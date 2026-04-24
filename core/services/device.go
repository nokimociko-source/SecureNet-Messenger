package services

import (
	"context"
	"crypto/sha256"
	"fmt"

	"securenet-backend/core/models"
	"securenet-backend/core/repository"

	"github.com/google/uuid"
)

// DeviceService handles device binding business logic.
type DeviceService struct {
	deviceRepo repository.DeviceRepository
	auditSvc   *AuditService
}

func NewDeviceService(deviceRepo repository.DeviceRepository, auditSvc *AuditService) *DeviceService {
	return &DeviceService{deviceRepo: deviceRepo, auditSvc: auditSvc}
}

// GenerateFingerprint creates a device fingerprint from user agent and other info.
func GenerateFingerprint(userAgent, ipAddress, platform string) string {
	data := fmt.Sprintf("%s|%s|%s", userAgent, ipAddress, platform)
	hash := sha256.Sum256([]byte(data))
	return fmt.Sprintf("%x", hash)
}

// RegisterDevice registers a new device or updates last used time.
func (s *DeviceService) RegisterDevice(ctx context.Context, userID uuid.UUID, deviceName, fingerprint, platform, userAgent, ipAddress string) (*models.Device, bool, error) {
	// Check if device already exists
	existing, err := s.deviceRepo.ValidateDevice(ctx, userID.String(), fingerprint)
	if err != nil {
		return nil, false, err
	}

	// Device already registered — just return it (no duplicate insert)
	if existing != nil {
		return existing, false, nil
	}

	// New device — register it
	device := &models.Device{
		ID:          uuid.New(),
		UserID:      userID,
		DeviceName:  deviceName,
		Fingerprint: fingerprint,
		Platform:    platform,
		UserAgent:   userAgent,
		IPAddress:   ipAddress,
		Trusted:     false,
	}

	if err := s.deviceRepo.RegisterDevice(ctx, device); err != nil {
		return nil, false, err
	}

	if s.auditSvc != nil {
		s.auditSvc.LogAction(userID, "new_device_detected", "device", nil, map[string]interface{}{
			"device_name": deviceName,
			"platform":    platform,
			"fingerprint": fingerprint[:16] + "...",
		}, ipAddress, userAgent)
	}

	return device, true, nil
}

// GetDevices returns all active devices for a user.
func (s *DeviceService) GetDevices(ctx context.Context, userID string) ([]*models.Device, error) {
	return s.deviceRepo.GetUserDevices(ctx, userID)
}

// RevokeDevice revokes a device.
func (s *DeviceService) RevokeDevice(ctx context.Context, deviceID, userID string) error {
	return s.deviceRepo.RevokeDevice(ctx, deviceID, userID)
}

// ValidateDevice checks if the current device is trusted.
func (s *DeviceService) ValidateDevice(ctx context.Context, userID, fingerprint string) (*models.Device, error) {
	return s.deviceRepo.ValidateDevice(ctx, userID, fingerprint)
}
// RevokeOtherDevices revokes all other devices for a user.
func (s *DeviceService) RevokeOtherDevices(ctx context.Context, userID, currentDeviceID string) error {
	err := s.deviceRepo.RevokeOtherDevices(ctx, userID, currentDeviceID)
	if err == nil && s.auditSvc != nil {
		s.auditSvc.LogAction(uuid.MustParse(userID), "all_other_sessions_terminated", "device", nil, nil, "", "")
	}
	return err
}
// TrustDevice marks a device as trusted.
func (s *DeviceService) TrustDevice(ctx context.Context, deviceID, userID string) error {
	err := s.deviceRepo.TrustDevice(ctx, deviceID, userID)
	if err == nil && s.auditSvc != nil {
		s.auditSvc.LogAction(uuid.MustParse(userID), "device_trusted", "device", nil, map[string]interface{}{
			"device_id": deviceID,
		}, "", "")
	}
	return err
}
