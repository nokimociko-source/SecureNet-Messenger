package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"securenet-backend/core/models"
)

// AuditService handles audit logging
type AuditService struct {
	db *sql.DB
}

// NewAuditService creates a new audit service
func NewAuditService(db *sql.DB) *AuditService {
	return &AuditService{db: db}
}

// LogAction logs an audit action
func (s *AuditService) LogAction(userID uuid.UUID, action, resource string, resourceID *uuid.UUID, details map[string]interface{}, ipAddress, userAgent string) error {
	severity := s.determineSeverity(action)

	query := `
		INSERT INTO audit_log (user_id, action, resource, resource_id, details, ip_address, user_agent, severity)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`

	var detailsJSON []byte
	var err error
	if details != nil {
		detailsJSON, err = json.Marshal(details)
		if err != nil {
			detailsJSON = []byte("{}")
		}
	} else {
		detailsJSON = []byte("{}")
	}

	_, err = s.db.Exec(query, userID, action, resource, resourceID, string(detailsJSON), ipAddress, userAgent, severity)
	if err != nil {
		return fmt.Errorf("failed to log audit action: %w", err)
	}

	return nil
}

// GetAuditLog retrieves audit log entries with filters
func (s *AuditService) GetAuditLog(filter models.AuditFilter) ([]models.AuditLogEntry, error) {
	query := `
		SELECT id, user_id, action, resource, resource_id, details, ip_address, user_agent, timestamp, severity
		FROM audit_log
		WHERE 1=1
	`
	args := []interface{}{}
	argIndex := 1

	// Build WHERE clause
	if filter.UserID != nil {
		query += fmt.Sprintf(" AND user_id = $%d", argIndex)
		args = append(args, *filter.UserID)
		argIndex++
	}

	if filter.Action != nil {
		query += fmt.Sprintf(" AND action = $%d", argIndex)
		args = append(args, *filter.Action)
		argIndex++
	}

	if filter.Resource != nil {
		query += fmt.Sprintf(" AND resource = $%d", argIndex)
		args = append(args, *filter.Resource)
		argIndex++
	}

	if filter.Severity != nil {
		query += fmt.Sprintf(" AND severity = $%d", argIndex)
		args = append(args, *filter.Severity)
		argIndex++
	}

	if filter.StartDate != nil {
		query += fmt.Sprintf(" AND timestamp >= $%d", argIndex)
		args = append(args, *filter.StartDate)
		argIndex++
	}

	if filter.EndDate != nil {
		query += fmt.Sprintf(" AND timestamp <= $%d", argIndex)
		args = append(args, *filter.EndDate)
		argIndex++
	}

	// Add ordering and pagination
	query += " ORDER BY timestamp DESC"

	if filter.Limit > 0 {
		query += fmt.Sprintf(" LIMIT $%d", argIndex)
		args = append(args, filter.Limit)
		argIndex++
	}

	if filter.Offset > 0 {
		query += fmt.Sprintf(" OFFSET $%d", argIndex)
		args = append(args, filter.Offset)
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query audit log: %w", err)
	}
	defer rows.Close()

	var entries []models.AuditLogEntry
	for rows.Next() {
		var entry models.AuditLogEntry
		var detailsJSON []byte

		err := rows.Scan(
			&entry.ID,
			&entry.UserID,
			&entry.Action,
			&entry.Resource,
			&entry.ResourceID,
			&detailsJSON,
			&entry.IPAddress,
			&entry.UserAgent,
			&entry.Timestamp,
			&entry.Severity,
		)
		if err != nil {
			continue // Skip invalid entries
		}

		if len(detailsJSON) > 0 {
			json.Unmarshal(detailsJSON, &entry.Details)
		}

		entries = append(entries, entry)
	}

	return entries, nil
}

// GetAuditLogStats returns audit log statistics
func (s *AuditService) GetAuditLogStats(userID *uuid.UUID, startDate, endDate *time.Time) (map[string]interface{}, error) {
	query := `
		SELECT 
			COUNT(*) as total_entries,
			COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_count,
			COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_count,
			COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_count,
			COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_count,
			COUNT(CASE WHEN action LIKE '%login%' THEN 1 END) as login_events,
			COUNT(CASE WHEN action LIKE '%failed%' THEN 1 END) as failed_events,
			COUNT(CASE WHEN action LIKE '%delete%' THEN 1 END) as delete_events
		FROM audit_log
		WHERE 1=1
	`
	args := []interface{}{}
	argIndex := 1

	if userID != nil {
		query += fmt.Sprintf(" AND user_id = $%d", argIndex)
		args = append(args, *userID)
		argIndex++
	}

	if startDate != nil {
		query += fmt.Sprintf(" AND timestamp >= $%d", argIndex)
		args = append(args, *startDate)
		argIndex++
	}

	if endDate != nil {
		query += fmt.Sprintf(" AND timestamp <= $%d", argIndex)
		args = append(args, *endDate)
		argIndex++
	}

	var totalEntries, criticalCount, highCount, mediumCount, lowCount, loginEvents, failedEvents, deleteEvents int

	err := s.db.QueryRow(query, args...).Scan(
		&totalEntries,
		&criticalCount,
		&highCount,
		&mediumCount,
		&lowCount,
		&loginEvents,
		&failedEvents,
		&deleteEvents,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get audit stats: %w", err)
	}

	return map[string]interface{}{
		"total_entries":  totalEntries,
		"critical_count": criticalCount,
		"high_count":     highCount,
		"medium_count":   mediumCount,
		"low_count":      lowCount,
		"login_events":   loginEvents,
		"failed_events":  failedEvents,
		"delete_events":  deleteEvents,
	}, nil
}

// CleanupOldAuditLogs removes audit logs older than specified duration
func (s *AuditService) CleanupOldAuditLogs(olderThan time.Duration) error {
	query := `DELETE FROM audit_log WHERE timestamp < NOW() - INTERVAL '1 second' * $1`

	_, err := s.db.Exec(query, int64(olderThan.Seconds()))
	if err != nil {
		return fmt.Errorf("failed to cleanup old audit logs: %w", err)
	}

	return nil
}

// GetClientInfo extracts client information from gin.Context
func GetClientInfo(c *gin.Context) (string, string) {
	ipAddress := c.ClientIP()

	userAgent := c.GetHeader("User-Agent")
	if userAgent == "" {
		userAgent = "Unknown"
	}

	return ipAddress, userAgent
}

// determineSeverity assigns severity level based on action
func (s *AuditService) determineSeverity(action string) string {
	switch {
	case strings.Contains(action, "delete"), strings.Contains(action, "failed"):
		return models.SeverityHigh
	case strings.Contains(action, "login"), strings.Contains(action, "password"), strings.Contains(action, "2fa"):
		return models.SeverityMedium
	case strings.Contains(action, "block"), strings.Contains(action, "admin"), strings.Contains(action, "permission"):
		return models.SeverityHigh
	case strings.Contains(action, "account_deleted"):
		return models.SeverityCritical
	default:
		return models.SeverityLow
	}
}
