package repository

import (
	"context"
	"securenet-backend/internal/models"

	"github.com/google/uuid"
)

// MessageRepository defines the interface for storing and retrieving messages.
// This allows switching between Postgres, Spanner, and Bigtable as per the Unified Plan.
type MessageRepository interface {
	// StoreMessage saves a message and returns its ID. Supports idempotency via clientMsgID.
	StoreMessage(ctx context.Context, msg *models.Message, clientMsgID string) (string, error)

	// GetChatMessages retrieves message history for a chat.
	GetChatMessages(ctx context.Context, chatID string, limit int, offset int) ([]*models.Message, error)

	// UpdateMessageStatus updates message status (sent, delivered, read).
	UpdateMessageStatus(ctx context.Context, messageID string, status string) error
}

// UserRepository defines the interface for user management.
type UserRepository interface {
	GetByPhone(ctx context.Context, phone string) (*models.User, error)
	GetByEmail(ctx context.Context, email string) (*models.User, error)
	GetByID(ctx context.Context, userID string) (*models.User, error)
	Create(ctx context.Context, user *models.User) error
	UpdateStatus(ctx context.Context, userID string, status string) error
	Search(ctx context.Context, query string, limit int) ([]*models.User, error)
	Count(ctx context.Context) (int, error)
}

// ChatRepository defines the interface for chat/group management.
type ChatRepository interface {
	// CreateChat creates a new chat (direct or group).
	CreateChat(ctx context.Context, chat *models.Chat, participantIDs []uuid.UUID) (string, error)

	// GetUserChats returns all chats for a user.
	GetUserChats(ctx context.Context, userID string) ([]*models.ChatWithParticipants, error)

	// GetChatByID returns a single chat.
	GetChatByID(ctx context.Context, chatID string) (*models.ChatWithParticipants, error)

	// AddParticipant adds a user to a group chat.
	AddParticipant(ctx context.Context, chatID string, userID uuid.UUID, role string) error

	// RemoveParticipant removes a user from a group chat.
	RemoveParticipant(ctx context.Context, chatID string, userID uuid.UUID) error

	// GetParticipants returns all participants of a chat.
	GetParticipants(ctx context.Context, chatID string) ([]*models.ChatParticipant, error)

	// UpdateChat updates chat metadata (name, etc.).
	UpdateChat(ctx context.Context, chatID string, name string) error
	
	// EnsureSavedChat checks if a "Saved Messages" chat exists for the user and creates it if not.
	EnsureSavedChat(ctx context.Context, userID uuid.UUID) error

	// IsParticipant checks if a user is a member of a chat.
	IsParticipant(ctx context.Context, chatID string, userID string) (bool, error)
}

// DeviceRepository defines the interface for device binding / management.
type DeviceRepository interface {
	// RegisterDevice stores a device fingerprint for a user.
	RegisterDevice(ctx context.Context, device *models.Device) error

	// GetUserDevices returns all registered devices for a user.
	GetUserDevices(ctx context.Context, userID string) ([]*models.Device, error)

	// RevokeDevice marks a device as revoked.
	RevokeDevice(ctx context.Context, deviceID string, userID string) error

	// ValidateDevice checks if a device fingerprint is known.
	ValidateDevice(ctx context.Context, userID string, fingerprint string) (*models.Device, error)

	// RevokeOtherDevices revokes all devices for a user except the current one.
	RevokeOtherDevices(ctx context.Context, userID string, currentDeviceID string) error

	// TrustDevice marks a device as trusted.
	TrustDevice(ctx context.Context, deviceID string, userID string) error
}

// MediaRepository defines the interface for file/media metadata storage.
type MediaRepository interface {
	// StoreMedia saves media file metadata.
	StoreMedia(ctx context.Context, media *models.Media) error

	// GetMedia retrieves media metadata by ID.
	GetMedia(ctx context.Context, mediaID string) (*models.Media, error)

	// GetMediaForChat retrieves all media for a chat.
	GetMediaForChat(ctx context.Context, chatID string, limit int, offset int) ([]*models.Media, error)

	// DeleteMedia deletes media metadata.
	DeleteMedia(ctx context.Context, mediaID string) error
}
