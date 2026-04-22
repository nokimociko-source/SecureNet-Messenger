package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"securenet-backend/internal/models"

	"github.com/google/uuid"
)

// MediaRepo implements repository.MediaRepository for PostgreSQL.
type MediaRepo struct {
	db *sql.DB
}

func NewMediaRepo(db *sql.DB) *MediaRepo {
	return &MediaRepo{db: db}
}

func (r *MediaRepo) StoreMedia(ctx context.Context, media *models.Media) error {
	if media.ID == uuid.Nil {
		media.ID = uuid.New()
	}

	_, err := r.db.ExecContext(ctx,
		`INSERT INTO media (id, uploader_id, chat_id, file_name, file_size, mime_type, storage_path, encrypted, checksum, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
		media.ID, media.UploaderID, media.ChatID, media.FileName, media.FileSize, media.MimeType, media.StoragePath, media.Encrypted, media.Checksum,
	)
	if err != nil {
		return fmt.Errorf("store media: %w", err)
	}
	return nil
}

func (r *MediaRepo) GetMedia(ctx context.Context, mediaID string) (*models.Media, error) {
	var m models.Media
	err := r.db.QueryRowContext(ctx,
		`SELECT id, uploader_id, chat_id, file_name, file_size, mime_type, storage_path, encrypted, checksum, created_at
		 FROM media WHERE id = $1`, mediaID,
	).Scan(&m.ID, &m.UploaderID, &m.ChatID, &m.FileName, &m.FileSize, &m.MimeType, &m.StoragePath, &m.Encrypted, &m.Checksum, &m.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get media: %w", err)
	}
	return &m, nil
}

func (r *MediaRepo) GetMediaForChat(ctx context.Context, chatID string, limit int, offset int) ([]*models.Media, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, uploader_id, chat_id, file_name, file_size, mime_type, storage_path, encrypted, checksum, created_at
		 FROM media WHERE (chat_id = $1::uuid OR (chat_id IS NULL AND uploader_id = $1::uuid)) ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		chatID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("get media for chat: %w", err)
	}
	defer rows.Close()

	var mediaList []*models.Media
	for rows.Next() {
		var m models.Media
		if err := rows.Scan(&m.ID, &m.UploaderID, &m.ChatID, &m.FileName, &m.FileSize, &m.MimeType, &m.StoragePath, &m.Encrypted, &m.Checksum, &m.CreatedAt); err != nil {
			fmt.Printf("❌ Scan error in GetMediaForChat: %v\n", err)
			return nil, fmt.Errorf("scan media: %w", err)
		}
		mediaList = append(mediaList, &m)
	}
	if err := rows.Err(); err != nil {
		fmt.Printf("❌ Rows error in GetMediaForChat: %v\n", err)
		return nil, fmt.Errorf("rows error: %w", err)
	}
	return mediaList, nil
}

func (r *MediaRepo) DeleteMedia(ctx context.Context, mediaID string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM media WHERE id = $1`, mediaID,
	)
	if err != nil {
		return fmt.Errorf("delete media: %w", err)
	}
	return nil
}
