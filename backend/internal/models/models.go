package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID                 uuid.UUID `json:"id" db:"id"`
	PhoneNumber        string    `json:"phoneNumber" db:"phone_number"`
	Email              string    `json:"email" db:"email"`
	Username           string    `json:"username" db:"username"`
	PublicKey          string    `json:"publicKey" db:"public_key"`
	Role               string    `json:"role" db:"role"` // user, moderator, admin
	PasswordHash       string    `json:"-" db:"password_hash"`
	Online             bool      `json:"online" db:"online"`
	Avatar             string    `json:"avatar" db:"avatar"`
	PhoneVisibility     string    `json:"phoneVisibility" db:"phone_visibility"`
	LastSeenVisibility string    `json:"lastSeenVisibility" db:"last_seen_visibility"`
	AvatarVisibility    string    `json:"avatarVisibility" db:"avatar_visibility"`
	LastSeenAt         time.Time `json:"lastSeenAt" db:"last_seen_at"`
	// Notification Settings
	NotifPrivate  bool `json:"notifPrivate" db:"notif_private"`
	NotifGroups   bool `json:"notifGroups" db:"notif_groups"`
	NotifChannels bool `json:"notifChannels" db:"notif_channels"`
	NotifBadges   bool `json:"notifBadges" db:"notif_badges"`
	NotifSounds   bool `json:"notifSounds" db:"notif_sounds"`
	NotifReactions bool `json:"notifReactions" db:"notif_reactions"`
	TotpEnabled    bool `json:"totpEnabled" db:"totp_enabled"`
	TotpSecret     string `json:"-" db:"totp_secret"`
	CreatedAt          time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt          time.Time `json:"updatedAt" db:"updated_at"`
}

type Message struct {
	ID          uuid.UUID  `json:"id" db:"id"`
	ChatID      uuid.UUID  `json:"chatId" db:"chat_id"`
	SenderID    uuid.UUID  `json:"senderId" db:"sender_id"`
	ReceiverID  uuid.UUID  `json:"receiverId" db:"receiver_id"`
	Content     string     `json:"content" db:"content"` // Encrypted base64
	Type        string     `json:"type" db:"type"`       // text, file, voice, image
	Status      string     `json:"status" db:"status"`   // sent, delivered, read
	ClientMsgID string     `json:"clientMsgId,omitempty" db:"client_msg_id"` // Idempotency key
	MediaID     *uuid.UUID `json:"mediaId,omitempty" db:"media_id"`         // Reference to uploaded media
	CreatedAt   time.Time  `json:"createdAt" db:"created_at"`
}

type Chat struct {
	ID            uuid.UUID  `json:"id" db:"id"`
	Type          string     `json:"type" db:"type"` // direct, group
	Name          *string    `json:"name,omitempty" db:"name"`
	AvatarURL     *string    `json:"avatarUrl,omitempty" db:"avatar_url"`
	CreatedBy     uuid.UUID  `json:"createdBy" db:"created_by"`
	CreatedAt     time.Time  `json:"createdAt" db:"created_at"`
	UpdatedAt     time.Time  `json:"updatedAt" db:"updated_at"`
	LastMessageAt *time.Time `json:"lastMessageAt,omitempty" db:"last_message_at"`
}

// ChatWithParticipants extends Chat with participant info for API responses.
type ChatWithParticipants struct {
	Chat
	Participants []ChatParticipantInfo `json:"participants"`
	UnreadCount  int                   `json:"unreadCount"`
}

type ChatParticipantInfo struct {
	UserID   uuid.UUID `json:"userId"`
	Username string    `json:"username"`
	Role     string    `json:"role"`
	Online   bool      `json:"online"`
}

type ChatParticipant struct {
	ChatID     uuid.UUID  `json:"chatId" db:"chat_id"`
	UserID     uuid.UUID  `json:"userId" db:"user_id"`
	Role       string     `json:"role" db:"role"` // member, admin, owner
	JoinedAt   time.Time  `json:"joinedAt" db:"joined_at"`
	LastReadAt *time.Time `json:"lastReadAt,omitempty" db:"last_read_at"`
}

type Contact struct {
	ID        uuid.UUID `json:"id" db:"id"`
	UserID    uuid.UUID `json:"userId" db:"user_id"`
	ContactID uuid.UUID `json:"contactId" db:"contact_id"`
	Name      *string   `json:"name,omitempty" db:"name"`
	IsFavorite bool     `json:"isFavorite" db:"is_favorite"`
	IsBlocked  bool     `json:"isBlocked" db:"is_blocked"`
	CreatedAt  time.Time `json:"createdAt" db:"created_at"`
}

type Report struct {
	ID          uuid.UUID  `json:"id" db:"id"`
	ReporterID  uuid.UUID  `json:"reportedId" db:"reporter_id"`
	TargetID    uuid.UUID  `json:"targetId" db:"target_id"`
	Reason      string     `json:"reason" db:"reason"`
	Status      string     `json:"status" db:"status"` // pending, resolved, dismissed
	ModeratorID *uuid.UUID `json:"moderatorId,omitempty" db:"moderator_id"`
	Resolution  *string    `json:"resolution,omitempty" db:"resolution"`
	CreatedAt   time.Time  `json:"createdAt" db:"created_at"`
	ResolvedAt  *time.Time `json:"resolvedAt,omitempty" db:"resolved_at"`
}

// Device represents a registered device for Device Binding.
type Device struct {
	ID          uuid.UUID `json:"id" db:"id"`
	UserID      uuid.UUID `json:"userId" db:"user_id"`
	DeviceName  string    `json:"deviceName" db:"device_name"`
	Fingerprint string    `json:"fingerprint" db:"fingerprint"` // SHA-256 of hardware info
	Platform    string    `json:"platform" db:"platform"`       // web, android, windows, ios
	UserAgent   string    `json:"userAgent" db:"user_agent"`
	IPAddress   string    `json:"ipAddress" db:"ip_address"`
	Trusted     bool      `json:"trusted" db:"trusted"`
	LastUsedAt  time.Time `json:"lastUsedAt" db:"last_used_at"`
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
	RevokedAt   *time.Time `json:"revokedAt,omitempty" db:"revoked_at"`
}

// Media represents uploaded file/media metadata.
type Media struct {
	ID          uuid.UUID `json:"id" db:"id"`
	UploaderID  uuid.UUID `json:"uploaderId" db:"uploader_id"`
	ChatID      uuid.UUID `json:"chatId" db:"chat_id"`
	FileName    string    `json:"fileName" db:"file_name"`
	FileSize    int64     `json:"fileSize" db:"file_size"`
	MimeType    string    `json:"mimeType" db:"mime_type"`
	StoragePath string    `json:"storagePath" db:"storage_path"`
	Encrypted   bool      `json:"encrypted" db:"encrypted"`
	Checksum    string    `json:"checksum" db:"checksum"` // SHA-256 of original
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
}

// WebSocket message types
type WSMessage struct {
	Type      string      `json:"type"` // message, status, typing, presence
	ChatID    uuid.UUID   `json:"chatId,omitempty"`
	SenderID  uuid.UUID   `json:"senderId,omitempty"`
	Content   interface{} `json:"content,omitempty"`
	Timestamp int64       `json:"timestamp"`
}
// PreKey represents a one-time use key for X3DH.
type PreKey struct {
	ID        uuid.UUID `json:"id" db:"id"`
	UserID    uuid.UUID `json:"userId" db:"user_id"`
	KeyID     int       `json:"keyId" db:"key_id"`
	PublicKey string    `json:"publicKey" db:"public_key"`
	Signature *string   `json:"signature,omitempty" db:"signature"`
	IsSigned  bool      `json:"isSigned" db:"is_signed"`
	IsUsed    bool      `json:"isUsed" db:"is_used"`
	CreatedAt time.Time `json:"createdAt" db:"created_at"`
}

// KeyBundle represents the bundle needed to start an E2EE session.
type KeyBundle struct {
	IdentityKey string   `json:"identityKey"`
	SignedKey   *PreKey  `json:"signedKey"`
	OneTimeKey  *PreKey  `json:"oneTimeKey"`
}
