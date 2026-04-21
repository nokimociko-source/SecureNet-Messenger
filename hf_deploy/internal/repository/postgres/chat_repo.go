package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"securenet-backend/internal/models"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// ChatRepo implements repository.ChatRepository for PostgreSQL.
type ChatRepo struct {
	db *sql.DB
}

func NewChatRepo(db *sql.DB) *ChatRepo {
	return &ChatRepo{db: db}
}

func (r *ChatRepo) CreateChat(ctx context.Context, chat *models.Chat, participantIDs []uuid.UUID) (string, error) {
	if chat.ID == uuid.Nil {
		chat.ID = uuid.New()
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx,
		`INSERT INTO chats (id, type, name, avatar_url, created_by, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
		chat.ID, chat.Type, chat.Name, chat.AvatarURL, chat.CreatedBy,
	)
	if err != nil {
		return "", fmt.Errorf("insert chat: %w", err)
	}

	// Add participants
	for _, uid := range participantIDs {
		role := "member"
		if uid == chat.CreatedBy {
			role = "owner"
		}
		_, err = tx.ExecContext(ctx,
			`INSERT INTO chat_participants (chat_id, user_id, role, joined_at)
			 VALUES ($1, $2, $3, NOW())`,
			chat.ID, uid, role,
		)
		if err != nil {
			return "", fmt.Errorf("add participant %s: %w", uid, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("commit: %w", err)
	}

	return chat.ID.String(), nil
}

// EnsureSavedChat checks if a "Saved Messages" chat exists for the user and creates it if not.
func (r *ChatRepo) EnsureSavedChat(ctx context.Context, userID uuid.UUID) error {
	// Insert chat if not exists
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO chats (id, type, name, created_at, updated_at)
		 VALUES ($1, 'saved', 'Saved Messages', NOW(), NOW())
		 ON CONFLICT (id) DO NOTHING`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("ensure chat row: %w", err)
	}

	// Ensure participant row exists
	_, err = r.db.ExecContext(ctx,
		`INSERT INTO chat_participants (chat_id, user_id, role, joined_at)
		 VALUES ($1, $1, 'owner', NOW())
		 ON CONFLICT (chat_id, user_id) DO NOTHING`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("ensure participant row: %w", err)
	}

	return nil
}

func (r *ChatRepo) GetUserChats(ctx context.Context, userID string) ([]*models.ChatWithParticipants, error) {
	// 1. Get all chats the user is part of
	rows, err := r.db.QueryContext(ctx,
		`SELECT c.id, c.type, c.name, c.avatar_url, c.created_at, c.updated_at, c.last_message_at
		 FROM chats c
		 JOIN chat_participants cp ON c.id = cp.chat_id
		 WHERE cp.user_id = $1
		 ORDER BY c.last_message_at DESC NULLS LAST`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("get user chats: %w", err)
	}
	defer rows.Close()

	var chats []*models.ChatWithParticipants
	var chatIDs []uuid.UUID
	for rows.Next() {
		c := &models.ChatWithParticipants{}
		if err := rows.Scan(&c.ID, &c.Type, &c.Name, &c.AvatarURL, &c.CreatedAt, &c.UpdatedAt, &c.LastMessageAt); err != nil {
			continue
		}
		chats = append(chats, c)
		chatIDs = append(chatIDs, c.ID)
	}

	if len(chatIDs) == 0 {
		return chats, nil
	}

	// 2. Fetch all participants for these chats in one go
	// Using lib/pq Array for the IN clause
	participantRows, err := r.db.QueryContext(ctx,
		`SELECT cp.chat_id, cp.user_id, cp.role, u.username, u.online
		 FROM chat_participants cp
		 JOIN users u ON cp.user_id = u.id
		 WHERE cp.chat_id = ANY($1)`, pq.Array(chatIDs),
	)
	if err != nil {
		// Log error but return chats without participants instead of failing
		fmt.Printf("Error fetching participants: %v\n", err)
		return chats, nil
	}
	defer participantRows.Close()

	// Map participants to their respective chats
	participantMap := make(map[uuid.UUID][]models.ChatParticipantInfo)
	for participantRows.Next() {
		var chatID uuid.UUID
		var p models.ChatParticipantInfo
		if err := participantRows.Scan(&chatID, &p.UserID, &p.Role, &p.Username, &p.Online); err != nil {
			continue
		}
		participantMap[chatID] = append(participantMap[chatID], p)
	}

	// 3. Assign participants to chats
	for _, chat := range chats {
		if p, ok := participantMap[chat.ID]; ok {
			chat.Participants = p
		} else {
			chat.Participants = []models.ChatParticipantInfo{}
		}
	}

	return chats, nil
}

func (r *ChatRepo) GetChatByID(ctx context.Context, chatID string) (*models.ChatWithParticipants, error) {
	var c models.ChatWithParticipants
	err := r.db.QueryRowContext(ctx,
		`SELECT id, type, name, avatar_url, created_at, updated_at, last_message_at
		 FROM chats WHERE id = $1`, chatID,
	).Scan(&c.ID, &c.Type, &c.Name, &c.AvatarURL, &c.CreatedAt, &c.UpdatedAt, &c.LastMessageAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get chat: %w", err)
	}

	participants, _ := r.getParticipantInfo(ctx, chatID)
	c.Participants = participants

	return &c, nil
}

func (r *ChatRepo) AddParticipant(ctx context.Context, chatID string, userID uuid.UUID, role string) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO chat_participants (chat_id, user_id, role, joined_at)
		 VALUES ($1, $2, $3, NOW()) ON CONFLICT (chat_id, user_id) DO NOTHING`,
		chatID, userID, role,
	)
	if err != nil {
		return fmt.Errorf("add participant: %w", err)
	}
	return nil
}

func (r *ChatRepo) RemoveParticipant(ctx context.Context, chatID string, userID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM chat_participants WHERE chat_id = $1 AND user_id = $2`,
		chatID, userID,
	)
	if err != nil {
		return fmt.Errorf("remove participant: %w", err)
	}
	return nil
}

func (r *ChatRepo) GetParticipants(ctx context.Context, chatID string) ([]*models.ChatParticipant, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT chat_id, user_id, role, joined_at, last_read_at
		 FROM chat_participants WHERE chat_id = $1`, chatID,
	)
	if err != nil {
		return nil, fmt.Errorf("get participants: %w", err)
	}
	defer rows.Close()

	var participants []*models.ChatParticipant
	for rows.Next() {
		var p models.ChatParticipant
		if err := rows.Scan(&p.ChatID, &p.UserID, &p.Role, &p.JoinedAt, &p.LastReadAt); err != nil {
			continue
		}
		participants = append(participants, &p)
	}
	return participants, nil
}

func (r *ChatRepo) UpdateChat(ctx context.Context, chatID string, name string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE chats SET name = $2, updated_at = NOW() WHERE id = $1`,
		chatID, name,
	)
	if err != nil {
		return fmt.Errorf("update chat: %w", err)
	}
	return nil
}

func (r *ChatRepo) getParticipantInfo(ctx context.Context, chatID string) ([]models.ChatParticipantInfo, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT u.id, u.username, cp.role, u.online
		 FROM chat_participants cp
		 JOIN users u ON cp.user_id = u.id
		 WHERE cp.chat_id = $1`, chatID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var infos []models.ChatParticipantInfo
	for rows.Next() {
		var info models.ChatParticipantInfo
		if err := rows.Scan(&info.UserID, &info.Username, &info.Role, &info.Online); err != nil {
			continue
		}
		infos = append(infos, info)
	}
	return infos, nil
}

func (r *ChatRepo) IsParticipant(ctx context.Context, chatID string, userID string) (bool, error) {
	var exists bool
	query := `SELECT EXISTS(SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2)`
	err := r.db.QueryRowContext(ctx, query, chatID, userID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check participant: %w", err)
	}
	return exists, nil
}
