package postgres

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"github.com/nokimociko-source/SecureNet-Messenger/core/models"
	"github.com/nokimociko-source/SecureNet-Messenger/core/utils"

	"github.com/google/uuid"
)

type UserRepo struct {
	db        *sql.DB
	masterKey []byte
}

func NewUserRepo(db *sql.DB, masterKey []byte) *UserRepo {
	// If the key is not 32 bytes, hash it to ensure it is
	var key []byte
	if len(masterKey) != 32 {
		h := sha256.Sum256(masterKey)
		key = h[:]
	} else {
		key = masterKey
	}
	return &UserRepo{db: db, masterKey: key}
}

func (r *UserRepo) decryptUserPII(u *models.User) {
	if u.PhoneNumber != "" {
		dec, _ := utils.Decrypt(u.PhoneNumber, r.masterKey)
		u.PhoneNumber = string(dec)
	}
	if u.Email != "" && u.Email != "NULL" {
		dec, _ := utils.Decrypt(u.Email, r.masterKey)
		u.Email = string(dec)
	}
}

func (r *UserRepo) getByPIIHash(ctx context.Context, column string, hash string) (*models.User, error) {
	var u models.User
	query := fmt.Sprintf(`
		SELECT id, phone_number, COALESCE(email, ''), username, public_key, COALESCE(signing_public_key, ''), role, password_hash, online, COALESCE(avatar, ''), phone_visibility, last_seen_visibility, avatar_visibility, last_seen_at, 
		        notif_private, notif_groups, notif_channels, notif_badges, notif_sounds, notif_reactions, created_at, updated_at, COALESCE(telegram_id, 0), COALESCE(bio, '')
		 FROM users WHERE %s = $1 AND deleted_at IS NULL`, column)

	err := r.db.QueryRowContext(ctx, query, hash).Scan(
		&u.ID, &u.PhoneNumber, &u.Email, &u.Username, &u.PublicKey, &u.SigningPublicKey, &u.Role, &u.PasswordHash, &u.Online, &u.Avatar, &u.PhoneVisibility, &u.LastSeenVisibility, &u.AvatarVisibility, &u.LastSeenAt,
		&u.NotifPrivate, &u.NotifGroups, &u.NotifChannels, &u.NotifBadges, &u.NotifSounds, &u.NotifReactions, &u.CreatedAt, &u.UpdatedAt, &u.TelegramID, &u.Bio,
	)
	if err == sql.ErrNoRows { return nil, err }
	if err != nil { return nil, err }
	r.decryptUserPII(&u)
	return &u, nil
}

func (r *UserRepo) GetByPhone(ctx context.Context, phone string) (*models.User, error) {
	hash := utils.HashPII(phone)
	log.Printf("🔍 Searching for user with phone_hash: %s", hash)
	return r.getByPIIHash(ctx, "phone_hash", hash)
}

func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	return r.getByPIIHash(ctx, "email_hash", utils.HashPII(email))
}

func (r *UserRepo) GetByID(ctx context.Context, userID string) (*models.User, error) {
	var u models.User
	err := r.db.QueryRowContext(ctx, `
		SELECT id, phone_number, COALESCE(email, ''), username, public_key, COALESCE(signing_public_key, ''), role, password_hash, online, COALESCE(avatar, ''), phone_visibility, last_seen_visibility, avatar_visibility, last_seen_at,
		        notif_private, notif_groups, notif_channels, notif_badges, notif_sounds, notif_reactions, created_at, updated_at, COALESCE(telegram_id, 0), COALESCE(bio, '')
		 FROM users WHERE id = $1 AND deleted_at IS NULL`, userID,
	).Scan(
		&u.ID, &u.PhoneNumber, &u.Email, &u.Username, &u.PublicKey, &u.SigningPublicKey, &u.Role, &u.PasswordHash, &u.Online, &u.Avatar, &u.PhoneVisibility, &u.LastSeenVisibility, &u.AvatarVisibility, &u.LastSeenAt,
		&u.NotifPrivate, &u.NotifGroups, &u.NotifChannels, &u.NotifBadges, &u.NotifSounds, &u.NotifReactions, &u.CreatedAt, &u.UpdatedAt, &u.TelegramID, &u.Bio,
	)
	if err == sql.ErrNoRows { return nil, err }
	if err != nil { return nil, err }
	r.decryptUserPII(&u)
	return &u, nil
}

func (r *UserRepo) Create(ctx context.Context, user *models.User) error {
	if user.ID == uuid.Nil { user.ID = uuid.New() }
	encPhone, _ := utils.Encrypt([]byte(user.PhoneNumber), r.masterKey)
	phoneHash := utils.HashPII(user.PhoneNumber)
	log.Printf("📝 Creating user with phone_hash: %s", phoneHash)
	encEmail, emailHash := "", ""
	if user.Email != "" {
		encEmail, _ = utils.Encrypt([]byte(user.Email), r.masterKey)
		emailHash = utils.HashPII(user.Email)
	}
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO users (id, phone_number, phone_hash, email, email_hash, username, public_key, signing_public_key, password_hash, role, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
		user.ID, encPhone, phoneHash, encEmail, emailHash, user.Username, user.PublicKey, user.SigningPublicKey, user.PasswordHash, user.Role,
	)
	if err != nil {
		log.Printf("❌ DB INSERT Error: %v", err)
		// Translate postgres unique constraint violations into user-friendly errors
		errStr := err.Error()
		if strings.Contains(errStr, "phone_hash") || strings.Contains(errStr, "users_phone") {
			return errors.New("пользователь с таким номером уже существует")
		}
		if strings.Contains(errStr, "email_hash") || strings.Contains(errStr, "users_email") {
			return errors.New("пользователь с такой почтой уже существует")
		}
		if strings.Contains(errStr, "username") && strings.Contains(errStr, "unique") {
			return errors.New("пользователь с таким именем уже существует")
		}
	}
	return err
}

func (r *UserRepo) UpdateStatus(ctx context.Context, userID string, status string) error {
	online := status == "online"
	_, err := r.db.ExecContext(ctx, "UPDATE users SET online = $2, last_seen_at = NOW(), updated_at = NOW() WHERE id = $1", userID, online)
	return err
}

func (r *UserRepo) UpdateProfile(ctx context.Context, userID string, username string, avatar string, bio string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE users SET username = $2, avatar = $3, bio = $4, updated_at = NOW() WHERE id = $1", userID, username, avatar, bio)
	return err
}

func (r *UserRepo) UpdatePrivacy(ctx context.Context, userID string, key string, value string) error {
	allowed := map[string]string{"phoneVisibility": "phone_visibility", "lastSeenVisibility": "last_seen_visibility", "avatarVisibility": "avatar_visibility"}
	col, ok := allowed[key]
	if !ok { return fmt.Errorf("invalid privacy key") }
	_, err := r.db.ExecContext(ctx, fmt.Sprintf("UPDATE users SET %s = $2, updated_at = NOW() WHERE id = $1", col), userID, value)
	return err
}

func (r *UserRepo) Search(ctx context.Context, query string, limit int) ([]*models.User, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, phone_number, COALESCE(email, ''), username, COALESCE(avatar, ''), online, last_seen_at, COALESCE(bio, '') FROM users WHERE username ILIKE $1 AND deleted_at IS NULL LIMIT $2`, "%"+query+"%", limit)
	if err != nil { return nil, err }
	defer rows.Close()
	var users []*models.User
	for rows.Next() {
		var u models.User
		rows.Scan(&u.ID, &u.PhoneNumber, &u.Email, &u.Username, &u.Avatar, &u.Online, &u.LastSeenAt, &u.Bio)
		r.decryptUserPII(&u)
		users = append(users, &u)
	}
	return users, nil
}

func (r *UserRepo) Count(ctx context.Context) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE deleted_at IS NULL").Scan(&count)
	return count, err
}

func (r *UserRepo) SoftDelete(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE users SET deleted_at = NOW() WHERE id = $1", userID)
	return err
}

func (r *UserRepo) BlockUser(ctx context.Context, userID string, targetID string, reason string) error {
	_, err := r.db.ExecContext(ctx, "INSERT INTO blocked_users (user_id, blocked_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", userID, targetID)
	return err
}

func (r *UserRepo) UnblockUser(ctx context.Context, userID string, targetID string) error {
	_, err := r.db.ExecContext(ctx, "DELETE FROM blocked_users WHERE user_id = $1 AND blocked_user_id = $2", userID, targetID)
	return err
}

func (r *UserRepo) GetBlockedUsers(ctx context.Context, userID string) ([]*models.User, error) {
	rows, err := r.db.QueryContext(ctx, "SELECT u.id, u.username, u.avatar FROM users u JOIN blocked_users b ON u.id = b.blocked_user_id WHERE b.user_id = $1", userID)
	if err != nil { return nil, err }
	defer rows.Close()
	var users []*models.User
	for rows.Next() {
		var u models.User
		rows.Scan(&u.ID, &u.Username, &u.Avatar)
		users = append(users, &u)
	}
	return users, nil
}

func (r *UserRepo) GetTOTPSecret(ctx context.Context, userID string) (string, bool, error) {
	var secret string
	var enabled bool
	err := r.db.QueryRowContext(ctx, "SELECT totp_secret, totp_enabled FROM users WHERE id = $1", userID).Scan(&secret, &enabled)
	if err != nil { return "", false, err }
	if secret != "" {
		dec, _ := utils.Decrypt(secret, r.masterKey)
		secret = string(dec)
	}
	return secret, enabled, nil
}

func (r *UserRepo) UpdateTOTP(ctx context.Context, userID string, secret string, enabled bool) error {
	enc, _ := utils.Encrypt([]byte(secret), r.masterKey)
	_, err := r.db.ExecContext(ctx, "UPDATE users SET totp_secret = $2, totp_enabled = $3, updated_at = NOW() WHERE id = $1", userID, enc, enabled)
	return err
}

func (r *UserRepo) SavePushSubscription(ctx context.Context, userID string, sub models.PushSubscription) error {
	data, _ := json.Marshal(sub)
	_, err := r.db.ExecContext(ctx, "UPDATE users SET push_subscription = $2, updated_at = NOW() WHERE id = $1", userID, string(data))
	return err
}

func (r *UserRepo) UpdateNotificationSettings(ctx context.Context, userID string, settings map[string]bool) error {
	allowed := map[string]string{
		"notifPrivate": "notif_private", "notifGroups": "notif_groups", "notifChannels": "notif_channels",
		"notifBadges": "notif_badges", "notifSounds": "notif_sounds", "notifReactions": "notif_reactions",
	}
	for k, v := range settings {
		col, ok := allowed[k]
		if !ok { continue }
		r.db.ExecContext(ctx, fmt.Sprintf("UPDATE users SET %s = $2, updated_at = NOW() WHERE id = $1", col), userID, v)
	}
	return nil
}

func (r *UserRepo) GetByTelegramID(ctx context.Context, telegramID int64) (*models.User, error) {
	var u models.User
	err := r.db.QueryRowContext(ctx, "SELECT id, phone_number, username FROM users WHERE telegram_id = $1 AND deleted_at IS NULL", telegramID).Scan(&u.ID, &u.PhoneNumber, &u.Username)
	if err == sql.ErrNoRows { return nil, nil }
	if err != nil { return nil, err }
	r.decryptUserPII(&u)
	return &u, nil
}

func (r *UserRepo) LinkTelegramID(ctx context.Context, userID string, telegramID int64) error {
	_, err := r.db.ExecContext(ctx, "UPDATE users SET telegram_id = $2, updated_at = NOW() WHERE id = $1", userID, telegramID)
	return err
}
