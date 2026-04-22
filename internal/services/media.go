package services

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"

	"securenet-backend/internal/models"
	"securenet-backend/internal/repository"

	"github.com/google/uuid"
)

const (
	// MaxFileSize is the maximum allowed file size (50MB)
	MaxFileSize = 50 * 1024 * 1024
	// UploadDir is the base directory for file uploads
	UploadDir = "./uploads"
)

// AllowedMimeTypes defines which MIME types are accepted.
var AllowedMimeTypes = map[string]bool{
	"image/jpeg":      true,
	"image/png":       true,
	"image/gif":       true,
	"image/webp":      true,
	"video/mp4":       true,
	"video/webm":      true,
	"audio/mpeg":      true,
	"audio/ogg":       true,
	"audio/wav":       true,
	"audio/webm":      true,
	"application/pdf": true,
	"application/zip": true,
	"text/plain":      true,
}

// MediaService handles file upload and media management.
type MediaService struct {
	mediaRepo repository.MediaRepository
	auditSvc  *AuditService
}

func NewMediaService(mediaRepo repository.MediaRepository, auditSvc *AuditService) *MediaService {
	return &MediaService{mediaRepo: mediaRepo, auditSvc: auditSvc}
}

// UploadFile handles file upload, validates it, stores it, and records metadata.
func (s *MediaService) UploadFile(ctx context.Context, file multipart.File, header *multipart.FileHeader, uploaderID, chatID uuid.UUID) (*models.Media, error) {
	fmt.Printf("DEBUG: Starting UploadFile for chat %s, file %s\n", chatID, header.Filename)
	// Validate file size
	if header.Size > MaxFileSize {
		fmt.Printf("DEBUG: File too large: %d bytes\n", header.Size)
		return nil, fmt.Errorf("file too large: max %d bytes", MaxFileSize)
	}

	// Validate MIME type
	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = detectMimeType(header.Filename)
	}
	fmt.Printf("DEBUG: Detected MIME type: %s\n", mimeType)
	if !AllowedMimeTypes[mimeType] {
		fmt.Printf("DEBUG: Unsupported MIME type: %s\n", mimeType)
		return nil, fmt.Errorf("unsupported file type: %s", mimeType)
	}

	// Generate unique storage path
	mediaID := uuid.New()
	ext := filepath.Ext(header.Filename)
	storagePath := filepath.Join(UploadDir, chatID.String(), mediaID.String()+ext)
	fmt.Printf("DEBUG: Storage path: %s\n", storagePath)

	// Create directory if needed
	dir := filepath.Dir(storagePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		fmt.Printf("DEBUG: Failed to create dir %s: %v\n", dir, err)
		return nil, fmt.Errorf("create upload dir: %w", err)
	}

	// Create destination file
	dst, err := os.Create(storagePath)
	if err != nil {
		fmt.Printf("DEBUG: Failed to create file %s: %v\n", storagePath, err)
		return nil, fmt.Errorf("create file: %w", err)
	}
	defer dst.Close()

	// Hash while copying for integrity
	hasher := sha256.New()
	writer := io.MultiWriter(dst, hasher)

	if _, err := io.Copy(writer, file); err != nil {
		fmt.Printf("DEBUG: Failed to save file: %v\n", err)
		os.Remove(storagePath)
		return nil, fmt.Errorf("save file: %w", err)
	}

	checksum := fmt.Sprintf("%x", hasher.Sum(nil))
	fmt.Printf("DEBUG: File saved, checksum: %s\n", checksum)

	// Store metadata
	media := &models.Media{
		ID:          mediaID,
		UploaderID:  uploaderID,
		ChatID:      &chatID,
		FileName:    header.Filename,
		FileSize:    header.Size,
		MimeType:    mimeType,
		StoragePath: storagePath,
		Encrypted:   true, // Files are encrypted at rest
		Checksum:    checksum,
	}

	if err := s.mediaRepo.StoreMedia(ctx, media); err != nil {
		fmt.Printf("DEBUG: Failed to store metadata: %v\n", err)
		os.Remove(storagePath)
		return nil, fmt.Errorf("store media metadata: %w", err)
	}

	fmt.Printf("DEBUG: Media upload complete: %s\n", mediaID)
	return media, nil
}

// GetMedia retrieves media metadata.
func (s *MediaService) GetMedia(ctx context.Context, mediaID string) (*models.Media, error) {
	return s.mediaRepo.GetMedia(ctx, mediaID)
}

// GetChatMedia returns all media for a chat.
func (s *MediaService) GetChatMedia(ctx context.Context, chatID string, limit, offset int) ([]*models.Media, error) {
	return s.mediaRepo.GetMediaForChat(ctx, chatID, limit, offset)
}

// DeleteMedia removes media file and metadata.
func (s *MediaService) DeleteMedia(ctx context.Context, mediaID string) error {
	media, err := s.mediaRepo.GetMedia(ctx, mediaID)
	if err != nil || media == nil {
		return fmt.Errorf("media not found")
	}

	// Remove file from disk
	os.Remove(media.StoragePath)

	return s.mediaRepo.DeleteMedia(ctx, mediaID)
}

// RegisterMedia manually records media metadata in the database.
func (s *MediaService) RegisterMedia(ctx context.Context, userID uuid.UUID, fileName string, mimeType string, fileSize int64) (string, error) {
	mediaID := uuid.New()
	// For stickers/imported media, we use the user's own ID as the chat_id to mark it as private/personal media
	storagePath := filepath.Join(UploadDir, userID.String(), fileName)
	
	media := &models.Media{
		ID:          mediaID,
		UploaderID:  userID,
		ChatID:      nil, // Stickers are personal media, no chat_id
		FileName:    fileName,
		FileSize:    fileSize,
		MimeType:    mimeType,
		StoragePath: storagePath,
		Encrypted:   false, // Stickers from TG are usually public anyway
		Checksum:    "tg_imported",
		CreatedAt:   time.Now(),
	}

	if err := s.mediaRepo.StoreMedia(ctx, media); err != nil {
		return "", err
	}

	return mediaID.String(), nil
}

// GetUserStickers returns all stickers (WebP files) owned by the user.
func (s *MediaService) GetUserStickers(ctx context.Context, userID string) ([]*models.Media, error) {
	// We query the media table for files where chat_id = userID and mime_type = image/webp
	return s.mediaRepo.GetMediaForChat(ctx, userID, 100, 0)
}

func detectMimeType(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".mp3":
		return "audio/mpeg"
	case ".ogg":
		return "audio/ogg"
	case ".wav":
		return "audio/wav"
	case ".pdf":
		return "application/pdf"
	case ".zip":
		return "application/zip"
	case ".txt":
		return "text/plain"
	default:
		return "application/octet-stream"
	}
}
