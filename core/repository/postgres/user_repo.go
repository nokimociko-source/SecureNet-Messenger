package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"securenet-backend/core/models"

	"github.com/google/uuid"
)

// UserRepo implements repository.UserRepository for PostgreSQL.
type UserRepo struct {
	db *sql.DB
}

func NewUserRepo(db *sql.DB) *UserRepo {
	return &UserRepo{db: db}
}

func (r *UserRepo) GetByPhone(ctx context.Context, phone string) (*models.User, error) {
	var u models.User
	err := r.db.QueryRowContext(ctx,
		`SELECT id, phone_number, COALESCE(email, ''), username, public_key, role, password_hash, online, COALESCE(avatar, ''), phone_visibility, last_seen_visibility, avatar_visibility, last_seen_at, 
		        notif_private, notif_groups, notif_channels, notif_badges, notif_sounds, notif_reactions, created_at, updated_at
		 FROM users WHERE phone_number = $1`, phone,
	).Scan(&u.ID, &u.PhoneNumber, &u.Email, &u.Username, &u.PublicKey, &u.Role, &u.PasswordHash, &u.Online, &u.Avatar, &u.PhoneVisibility, &u.LastSeenVisibility, &u.AvatarVisibility, &u.LastSeenAt,
		&u.NotifPrivate, &u.NotifGroups, &u.NotifChannels, &u.NotifBadges, &u.NotifSounds, &u.NotifReactions, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by phone: %w", err)
	}
	return &u, nil
}

func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := r.db.QueryRowContext(ctx,
		`SELECT id, phone_number, COALESCE(email, ''), username, public_key, role, password_hash, online, COALESCE(avatar, ''), phone_visibility, last_seen_visibility, avatar_visibility, last_seen_at, 
		        notif_private, notif_groups, notif_channels, notif_badges, notif_sounds, notif_reactions, created_at, updated_at
		 FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.PhoneNumber, &u.Email, &u.Username, &u.PublicKey, &u.Role, &u.PasswordHash, &u.Online, &u.Avatar, &u.PhoneVisibility, &u.LastSeenVisibility, &u.AvatarVisibility, &u.LastSeenAt,
		&u.NotifPrivate, &u.NotifGroups, &u.NotifChannels, &u.NotifBadges, &u.NotifSounds, &u.NotifReactions, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return &u, nil
}

func (r *UserRepo) Create(ctx context.Context, user *models.User) error {
	if user.ID == uuid.Nil {
		user.ID = uuid.New()
	}
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO users (id, phone_number, email, username, public_key, password_hash, role, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
		user.ID, user.PhoneNumber, user.Email, user.Username, user.PublicKey, user.PasswordHash, user.Role,
	)
	if err != nil {
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

func (r *UserRepo) UpdateStatus(ctx context.Context, userID string, status string) error {
	online := status == "online"
	_, err := r.db.ExecContext(ctx,
		`UPDATE users SET online = $2, last_seen_at = NOW() WHERE id = $1`,
		userID, online,
	)
	if err != nil {
		return fmt.Errorf("update user status: %w", err)
	}
	return nil
}

func (r *UserRepo) GetByTelegramID(ctx context.Context, telegramID int64) (*models.User, error) {
	var u models.User
	err := r.db.QueryRowContext(ctx,
		`SELECT id, phone_number, COALESCE(email, ''), username, public_key, role, password_hash, online, COALESCE(avatar, ''), phone_visibility, last_seen_visibility, avatar_visibility, last_seen_at, 
		        notif_private, notif_groups, notif_channels, notif_badges, notif_sounds, notif_reactions, created_at, updated_at, COALESCE(telegram_id, 0)
		 FROM users WHERE telegram_id = $1`, telegramID,
	).Scan(&u.ID, &u.PhoneNumber, &u.Email, &u.Username, &u.PublicKey, &u.Role, &u.PasswordHash, &u.Online, &u.Avatar, &u.PhoneVisibility, &u.LastSeenVisibility, &u.AvatarVisibility, &u.LastSeenAt,
		&u.NotifPrivate, &u.NotifGroups, &u.NotifChannels, &u.NotifBadges, &u.NotifSounds, &u.NotifReactions, &u.CreatedAt, &u.UpdatedAt, &u.TelegramID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &u, err
}

func (r *UserRepo) LinkTelegramID(ctx context.Context, userID string, telegramID int64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE users SET telegram_id = $2, updated_at = NOW() WHERE id = $1`,
		userID, telegramID,
	)
	return err
}

func (r *UserRepo) GetByID(ctx context.Context, userID string) (*models.User, error) {
	var u models.User
	err := r.db.QueryRowContext(ctx,
		`SELECT id, phone_number, COALESCE(email, ''), username, public_key, role, password_hash, online, COALESCE(avatar, ''), phone_visibility, last_seen_visibility, avatar_visibility, last_seen_at,
		        notif_private, notif_groups, notif_channels, notif_badges, notif_sounds, notif_reactions, created_at, updated_at, COALESCE(telegram_id, 0)
		 FROM users WHERE id = $1`, userID,
	).Scan(&u.ID, &u.PhoneNumber, &u.Email, &u.Username, &u.PublicKey, &u.Role, &u.PasswordHash, &u.Online, &u.Avatar, &u.PhoneVisibility, &u.LastSeenVisibility, &u.AvatarVisibility, &u.LastSeenAt,
		&u.NotifPrivate, &u.NotifGroups, &u.NotifChannels, &u.NotifBadges, &u.NotifSounds, &u.NotifReactions, &u.CreatedAt, &u.UpdatedAt, &u.TelegramID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return &u, nil
}

func (r *UserRepo) Search(ctx context.Context, query string, limit int) ([]*models.User, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, phone_number, username, public_key, role, avatar FROM users
		 WHERE phone_number ILIKE $1 OR username ILIKE $1 OR email ILIKE $1 LIMIT $2`,
		"%"+query+"%", limit,
	)
	if err != nil {
		return nil, fmt.Errorf("search users: %w", err)
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.PhoneNumber, &u.Username, &u.PublicKey, &u.Role, &u.Avatar); err != nil {
			continue
		}
		users = append(users, &u)
	}
	return users, nil
}

func (r *UserRepo) Count(ctx context.Context) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&count)
	return count, err
}

func (r *UserRepo) UpdateTOTP(ctx context.Context, userID string, secret string, enabled bool) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE users SET totp_secret = $2, totp_enabled = $3, updated_at = NOW() WHERE id = $1`,
		userID, secret, enabled,
	)
	if err != nil {
		return fmt.Errorf("update user totp: %w", err)
	}
	return nil
}

func (r *UserRepo) GetTOTPSecret(ctx context.Context, userID string) (string, bool, error) {
	var secret string
	var enabled bool
	err := r.db.QueryRowContext(ctx,
		`SELECT totp_secret, totp_enabled FROM users WHERE id = $1`,
		userID,
	).Scan(&secret, &enabled)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	return secret, enabled, err
}

func (r *UserRepo) SavePushSubscription(ctx context.Context, userID string, sub models.PushSubscription) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (user_id, endpoint) DO UPDATE 
		 SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
		userID, sub.Endpoint, sub.Keys.P256dh, sub.Keys.Auth,
	)
	if err != nil {
		return fmt.Errorf("save push subscription: %w", err)
	}
	return nil
}
