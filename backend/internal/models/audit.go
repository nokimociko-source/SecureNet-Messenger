package models

import (
	"time"
	"github.com/google/uuid"
)

// AuditLogEntry represents an audit log entry
type AuditLogEntry struct {
	ID         uuid.UUID              `json:"id" db:"id"`
	UserID     uuid.UUID              `json:"userId" db:"user_id"`
	Action     string                 `json:"action" db:"action"`
	Resource   string                 `json:"resource" db:"resource"`
	ResourceID *string                `json:"resourceId" db:"resource_id"`
	Details    map[string]interface{} `json:"details" db:"details"`
	IPAddress  string                 `json:"ipAddress" db:"ip_address"`
	UserAgent  string                 `json:"userAgent" db:"user_agent"`
	Timestamp  time.Time              `json:"timestamp" db:"timestamp"`
	Severity   string                 `json:"severity" db:"severity"` // low, medium, high, critical
}

// Audit constants
const (
	AuditActionLogin           = "login"
	AuditActionLogout          = "logout"
	AuditActionLoginFailed     = "login_failed"
	AuditActionPasswordChange  = "password_change"
	AuditAction2FAEnabled      = "2fa_enabled"
	AuditAction2FADisabled     = "2fa_disabled"
	AuditActionContactAdded    = "contact_added"
	AuditActionContactRemoved  = "contact_removed"
	AuditActionUserBlocked     = "user_blocked"
	AuditActionUserUnblocked   = "user_unblocked"
	AuditActionMessageSent     = "message_sent"
	AuditActionMessageDeleted  = "message_deleted"
	AuditActionChatCreated     = "chat_created"
	AuditActionFileUploaded    = "file_uploaded"
	AuditActionAccountDeleted  = "account_deleted"
	AuditActionPermissionChanged = "permission_changed"
)

// Audit severity levels
const (
	SeverityLow      = "low"
	SeverityMedium   = "medium"
	SeverityHigh     = "high"
	SeverityCritical = "critical"
)

// AuditFilter represents filters for audit log queries
type AuditFilter struct {
	UserID    *uuid.UUID `json:"userId,omitempty"`
	Action    *string    `json:"action,omitempty"`
	Resource  *string    `json:"resource,omitempty"`
	Severity  *string    `json:"severity,omitempty"`
	StartDate *time.Time `json:"startDate,omitempty"`
	EndDate   *time.Time `json:"endDate,omitempty"`
	Limit     int        `json:"limit"`
	Offset    int        `json:"offset"`
}
