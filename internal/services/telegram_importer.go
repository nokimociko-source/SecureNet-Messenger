package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

type TelegramImporter struct {
	botToken string
	mediaDir string
	mediaSvc *MediaService
}

func NewTelegramImporter(token string, mediaDir string, mediaSvc *MediaService) *TelegramImporter {
	return &TelegramImporter{
		botToken: token,
		mediaDir: mediaDir,
		mediaSvc: mediaSvc,
	}
}

// TelegramUpdate represents a simplified structure from TG Bot API
type TelegramUpdate struct {
	UpdateID int `json:"update_id"`
	Message  *struct {
		Text    string `json:"text"`
		From    struct {
			ID int64 `json:"id"`
		} `json:"from"`
		Sticker *struct {
			FileID   string `json:"file_id"`
			IsVideo  bool   `json:"is_video"`
			IsAnim   bool   `json:"is_animated"`
			Emoji    string `json:"emoji"`
			Set      string `json:"set_name"`
		} `json:"sticker"`
	} `json:"message"`
}

func (s *TelegramImporter) ImportSticker(ctx context.Context, userID uuid.UUID, fileID string) (string, error) {
	// 1. Get file path from Telegram
	getFilePathURL := fmt.Sprintf("https://api.telegram.org/bot%s/getFile?file_id=%s", s.botToken, fileID)
	resp, err := http.Get(getFilePathURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		OK     bool `json:"ok"`
		Result struct {
			FilePath string `json:"file_path"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || !result.OK {
		return "", fmt.Errorf("failed to get file path from TG")
	}

	// 2. Download the actual file
	downloadURL := fmt.Sprintf("https://api.telegram.org/file/bot%s/%s", s.botToken, result.Result.FilePath)
	fileResp, err := http.Get(downloadURL)
	if err != nil {
		return "", err
	}
	defer fileResp.Body.Close()

	// 3. Save to local media storage
	ext := filepath.Ext(result.Result.FilePath)
	if ext == "" {
		ext = ".webp"
	}
	
	// Create user directory if it doesn't exist
	userDir := filepath.Join(s.mediaDir, userID.String())
	if err := os.MkdirAll(userDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create user dir: %w", err)
	}

	fileName := fmt.Sprintf("%s%s", uuid.New().String(), ext)
	filePath := filepath.Join(userDir, fileName)

	out, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to create file: %w", err)
	}
	defer out.Close()

	_, err = io.Copy(out, fileResp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to copy file: %w", err)
	}

	// 4. Register in our media database
	mediaID, err := s.mediaSvc.RegisterMedia(ctx, userID, fileName, "image/webp", 0)
	if err != nil {
		return "", err
	}

	return mediaID, nil
}
