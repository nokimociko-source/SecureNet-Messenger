package services

import (
	"context"
	"database/sql"
	"errors"
	"securenet-backend/core/models"

	"github.com/google/uuid"
)

type CryptoService struct {
	db *sql.DB
}

func NewCryptoService(db *sql.DB) *CryptoService {
	return &CryptoService{db: db}
}

// UploadPreKeys stores a batch of pre-keys for a user.
func (s *CryptoService) UploadPreKeys(ctx context.Context, userID uuid.UUID, keys []models.PreKey) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, k := range keys {
		_, err := tx.ExecContext(ctx, 
			`INSERT INTO user_prekeys (user_id, key_id, public_key, signature, is_signed) 
			 VALUES ($1, $2, $3, $4, $5)`,
			userID, k.KeyID, k.PublicKey, k.Signature, k.IsSigned)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// GetKeyBundle fetches the necessary keys to start an E2EE session with a user.
func (s *CryptoService) GetKeyBundle(ctx context.Context, targetID uuid.UUID) (*models.KeyBundle, error) {
	var bundle models.KeyBundle

	// 1. Get Identity Key
	err := s.db.QueryRowContext(ctx, "SELECT public_key FROM users WHERE id = $1", targetID).Scan(&bundle.IdentityKey)
	if err != nil {
		return nil, errors.New("user identity key not found")
	}

	// 2. Get the current Signed Pre-key
	var signedKey models.PreKey
	err = s.db.QueryRowContext(ctx, 
		`SELECT id, key_id, public_key, signature FROM user_prekeys 
		 WHERE user_id = $1 AND is_signed = true AND is_used = false 
		 ORDER BY created_at DESC LIMIT 1`, targetID).Scan(
		&signedKey.ID, &signedKey.KeyID, &signedKey.PublicKey, &signedKey.Signature)
	if err == nil {
		bundle.SignedKey = &signedKey
	}

	// 3. Get one One-Time Pre-key (and mark as used)
	var otk models.PreKey
	err = s.db.QueryRowContext(ctx, 
		`SELECT id, key_id, public_key FROM user_prekeys 
		 WHERE user_id = $1 AND is_signed = false AND is_used = false 
		 LIMIT 1`, targetID).Scan(&otk.ID, &otk.KeyID, &otk.PublicKey)
	
	if err == nil {
		// Mark as used immediately to prevent reuse
		_, _ = s.db.ExecContext(ctx, "UPDATE user_prekeys SET is_used = true WHERE id = $1", otk.ID)
		bundle.OneTimeKey = &otk
	}

	return &bundle, nil
}

// GetPreKeyCount returns the number of unused one-time pre-keys for a user.
func (s *CryptoService) GetPreKeyCount(ctx context.Context, userID uuid.UUID) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM user_prekeys WHERE user_id = $1 AND is_signed = false AND is_used = false", userID).Scan(&count)
	return count, err
}
