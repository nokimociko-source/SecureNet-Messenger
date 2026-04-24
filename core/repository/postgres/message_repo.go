package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"securenet-backend/core/models"

	"github.com/google/uuid"
)

// MessageRepo implements repository.MessageRepository for PostgreSQL.
type MessageRepo struct {
	db *sql.DB
}

func NewMessageRepo(db *sql.DB) *MessageRepo {
	return &MessageRepo{db: db}
}

func (r *MessageRepo) StoreMessage(ctx context.Context, msg *models.Message, clientMsgID string) (string, error) {
	if msg.ID == uuid.Nil {
		msg.ID = uuid.New()
	}

	// Idempotency: if clientMsgID is provided, check for duplicate
	if clientMsgID != "" {
		var existingID uuid.UUID
		err := r.db.QueryRowContext(ctx,
			`SELECT id FROM messages WHERE client_msg_id = $1 AND sender_id = $2`,
			clientMsgID, msg.SenderID,
		).Scan(&existingID)
		if err == nil {
			// Already exists — return existing ID (idempotent)
			return existingID.String(), nil
		}
	}

	_, err := r.db.ExecContext(ctx,
		`INSERT INTO messages (id, session_id, sender_id, content, msg_type, status, client_msg_id, timestamp)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
		msg.ID, msg.ChatID, msg.SenderID, msg.Content, msg.Type, msg.Status, clientMsgID,
	)
	if err != nil {
		return "", fmt.Errorf("store message: %w", err)
	}

	return msg.ID.String(), nil
}

func (r *MessageRepo) GetChatMessages(ctx context.Context, chatID string, limit int, offset int) ([]*models.Message, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, session_id, sender_id, content, msg_type, status, timestamp
		 FROM messages WHERE session_id = $1
		 ORDER BY timestamp DESC LIMIT $2 OFFSET $3`,
		chatID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("get chat messages: %w", err)
	}
	defer rows.Close()

	var messages []*models.Message
	for rows.Next() {
		var m models.Message
		if err := rows.Scan(&m.ID, &m.ChatID, &m.SenderID, &m.Content, &m.Type, &m.Status, &m.CreatedAt); err != nil {
			continue
		}
		messages = append(messages, &m)
	}
	return messages, nil
}

func (r *MessageRepo) UpdateMessageStatus(ctx context.Context, messageID string, status string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE messages SET status = $2 WHERE id = $1`,
		messageID, status,
	)
	if err != nil {
		return fmt.Errorf("update message status: %w", err)
	}
	return nil
}
