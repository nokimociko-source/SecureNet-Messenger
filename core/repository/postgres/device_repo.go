package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"securenet-backend/core/models"

	"github.com/google/uuid"
)

// DeviceRepo implements repository.DeviceRepository for PostgreSQL.
type DeviceRepo struct {
	db *sql.DB
}

func NewDeviceRepo(db *sql.DB) *DeviceRepo {
	return &DeviceRepo{db: db}
}

func (r *DeviceRepo) RegisterDevice(ctx context.Context, device *models.Device) error {
	if device.ID == uuid.Nil {
		device.ID = uuid.New()
	}

	// Upsert: if the same fingerprint already exists for this user, update last_used
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO devices (id, user_id, device_name, fingerprint, platform, user_agent, ip_address, trusted, last_used_at, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
		 ON CONFLICT (user_id, fingerprint) DO UPDATE SET
		   last_used_at = NOW(),
		   ip_address = EXCLUDED.ip_address,
		   user_agent = EXCLUDED.user_agent`,
		device.ID, device.UserID, device.DeviceName, device.Fingerprint, device.Platform, device.UserAgent, device.IPAddress, device.Trusted,
	)
	if err != nil {
		return fmt.Errorf("register device: %w", err)
	}
	return nil
}

func (r *DeviceRepo) GetUserDevices(ctx context.Context, userID string) ([]*models.Device, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, user_id, device_name, fingerprint, platform, user_agent, ip_address, trusted, last_used_at, created_at, revoked_at
		 FROM devices WHERE user_id = $1 AND revoked_at IS NULL
		 ORDER BY last_used_at DESC`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("get devices: %w", err)
	}
	defer rows.Close()

	var devices []*models.Device
	for rows.Next() {
		var d models.Device
		if err := rows.Scan(&d.ID, &d.UserID, &d.DeviceName, &d.Fingerprint, &d.Platform, &d.UserAgent, &d.IPAddress, &d.Trusted, &d.LastUsedAt, &d.CreatedAt, &d.RevokedAt); err != nil {
			continue
		}
		devices = append(devices, &d)
	}
	return devices, nil
}

func (r *DeviceRepo) RevokeDevice(ctx context.Context, deviceID string, userID string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE devices SET revoked_at = NOW() WHERE id = $1 AND user_id = $2`,
		deviceID, userID,
	)
	if err != nil {
		return fmt.Errorf("revoke device: %w", err)
	}
	return nil
}

func (r *DeviceRepo) ValidateDevice(ctx context.Context, userID string, fingerprint string) (*models.Device, error) {
	var d models.Device
	err := r.db.QueryRowContext(ctx,
		`SELECT id, user_id, device_name, fingerprint, platform, trusted, last_used_at, created_at
		 FROM devices WHERE user_id = $1 AND fingerprint = $2 AND revoked_at IS NULL`,
		userID, fingerprint,
	).Scan(&d.ID, &d.UserID, &d.DeviceName, &d.Fingerprint, &d.Platform, &d.Trusted, &d.LastUsedAt, &d.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("validate device: %w", err)
	}
	return &d, nil
}
func (r *DeviceRepo) RevokeOtherDevices(ctx context.Context, userID string, currentDeviceID string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE devices SET revoked_at = NOW() WHERE user_id = $1 AND id != $2`,
		userID, currentDeviceID,
	)
	if err != nil {
		return fmt.Errorf("revoke other devices: %w", err)
	}
	return nil
}
func (r *DeviceRepo) TrustDevice(ctx context.Context, deviceID string, userID string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE devices SET trusted = true WHERE id = $1 AND user_id = $2`,
		deviceID, userID,
	)
	if err != nil {
		return fmt.Errorf("trust device: %w", err)
	}
	return nil
}
