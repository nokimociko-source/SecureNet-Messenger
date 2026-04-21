package db

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"
)

func Init(databaseURL string) (*sql.DB, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Configure connection pool (Optimized for Direct Connection)
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(5 * time.Minute) 

	return db, nil
}

func Migrate(db *sql.DB) error {
	queries := []string{
		// ===== CORE TABLES =====
		`CREATE TABLE IF NOT EXISTS users (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			phone_number VARCHAR(20) UNIQUE NOT NULL,
			email VARCHAR(100) UNIQUE,
			username VARCHAR(50) NOT NULL,
			public_key TEXT NOT NULL,
			role VARCHAR(20) DEFAULT 'user',
			password_hash VARCHAR(255) NOT NULL,
			online BOOLEAN DEFAULT false,
			last_seen_at TIMESTAMP DEFAULT NOW(),
			totp_secret VARCHAR(64),
			totp_enabled BOOLEAN DEFAULT false,
			created_at TIMESTAMP DEFAULT NOW(),
			updated_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS chats (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			type VARCHAR(20) NOT NULL,
			name VARCHAR(100),
			avatar_url TEXT,
			created_by UUID REFERENCES users(id) ON DELETE SET NULL,
			created_at TIMESTAMP DEFAULT NOW(),
			updated_at TIMESTAMP DEFAULT NOW(),
			last_message_at TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS chat_participants (
			chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
			user_id UUID REFERENCES users(id) ON DELETE CASCADE,
			role VARCHAR(20) DEFAULT 'member',
			joined_at TIMESTAMP DEFAULT NOW(),
			last_read_at TIMESTAMP,
			PRIMARY KEY (chat_id, user_id)
		)`,
		`CREATE TABLE IF NOT EXISTS messages (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			session_id UUID REFERENCES chats(id) ON DELETE CASCADE,
			sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
			content TEXT NOT NULL,
			msg_type VARCHAR(20) DEFAULT 'text',
			status VARCHAR(20) DEFAULT 'sent',
			client_msg_id VARCHAR(64),
			media_id UUID,
			read_at TIMESTAMP,
			timestamp TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS contacts (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID REFERENCES users(id) ON DELETE CASCADE,
			contact_id UUID REFERENCES users(id) ON DELETE CASCADE,
			name VARCHAR(100),
			is_favorite BOOLEAN DEFAULT false,
			is_blocked BOOLEAN DEFAULT false,
			created_at TIMESTAMP DEFAULT NOW(),
			UNIQUE(user_id, contact_id)
		)`,
		`CREATE TABLE IF NOT EXISTS reports (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
			target_id UUID REFERENCES users(id) ON DELETE SET NULL,
			reason TEXT NOT NULL,
			status VARCHAR(20) DEFAULT 'pending',
			moderator_id UUID REFERENCES users(id) ON DELETE SET NULL,
			resolution TEXT,
			created_at TIMESTAMP DEFAULT NOW(),
			resolved_at TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS blocked_users (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID REFERENCES users(id) ON DELETE CASCADE,
			blocked_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
			created_at TIMESTAMP DEFAULT NOW(),
			UNIQUE(user_id, blocked_user_id)
		)`,

		// ===== DEVICE BINDING =====
		`CREATE TABLE IF NOT EXISTS devices (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			device_name VARCHAR(100) NOT NULL,
			fingerprint VARCHAR(128) NOT NULL,
			platform VARCHAR(20) NOT NULL,
			user_agent TEXT,
			ip_address INET,
			trusted BOOLEAN DEFAULT false,
			last_used_at TIMESTAMP DEFAULT NOW(),
			created_at TIMESTAMP DEFAULT NOW(),
			revoked_at TIMESTAMP,
			UNIQUE(user_id, fingerprint)
		)`,

		// ===== MEDIA / FILE UPLOADS =====
		`CREATE TABLE IF NOT EXISTS media (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			uploader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
			file_name VARCHAR(255) NOT NULL,
			file_size BIGINT NOT NULL,
			mime_type VARCHAR(100) NOT NULL,
			storage_path TEXT NOT NULL,
			encrypted BOOLEAN DEFAULT true,
			checksum VARCHAR(64) NOT NULL,
			created_at TIMESTAMP DEFAULT NOW()
		)`,

		// ===== AUDIT LOG =====
		`CREATE TABLE IF NOT EXISTS audit_log (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			action VARCHAR(50) NOT NULL,
			resource VARCHAR(50) NOT NULL,
			resource_id UUID,
			details JSONB DEFAULT '{}',
			ip_address INET,
			user_agent TEXT,
			timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
			severity VARCHAR(20) NOT NULL DEFAULT 'low'
		)`,
		`CREATE TABLE IF NOT EXISTS push_subscriptions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			endpoint TEXT NOT NULL,
			p256dh TEXT NOT NULL,
			auth TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT NOW(),
			UNIQUE(user_id, endpoint)
		)`,
		`CREATE TABLE IF NOT EXISTS posts (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			content TEXT,
			media_urls TEXT[],
			is_system BOOLEAN DEFAULT false,
			created_at TIMESTAMP DEFAULT NOW(),
			updated_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS post_likes (
			post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
			user_id UUID REFERENCES users(id) ON DELETE CASCADE,
			created_at TIMESTAMP DEFAULT NOW(),
			PRIMARY KEY (post_id, user_id)
		)`,
		`CREATE TABLE IF NOT EXISTS post_comments (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
			author_id UUID REFERENCES users(id) ON DELETE CASCADE,
			content TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT NOW(),
			updated_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS subscribers (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			subscriber_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			target_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			target_type VARCHAR(20) NOT NULL, -- user, channel
			created_at TIMESTAMP DEFAULT NOW(),
			UNIQUE(subscriber_id, target_id)
		)`,

		// ===== INDEXES =====
		`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_client_msg_id ON messages(client_msg_id)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)`,
		`CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)`,
		`CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_devices_fingerprint ON devices(user_id, fingerprint)`,
		`CREATE INDEX IF NOT EXISTS idx_media_chat_id ON media(chat_id)`,
		`CREATE INDEX IF NOT EXISTS idx_media_uploader_id ON media(uploader_id)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_log_severity ON audit_log(severity)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_log_resource_id ON audit_log(resource_id)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_log_user_timestamp ON audit_log(user_id, timestamp DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id)`,
		`CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id)`,
		`CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON post_comments(post_id)`,
		`CREATE INDEX IF NOT EXISTS idx_post_comments_created_at ON post_comments(created_at DESC)`,

		`CREATE TABLE IF NOT EXISTS user_prekeys (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			key_id INTEGER NOT NULL,
			public_key TEXT NOT NULL,
			signature TEXT,
			is_signed BOOLEAN DEFAULT false,
			is_used BOOLEAN DEFAULT false,
			created_at TIMESTAMP DEFAULT NOW()
		)`,
		// ===== ADD COLUMNS IF NOT EXISTS (safe migrations) =====
		// Explicitly ensure all columns exist (Postgres 9.6+ syntax)
		`ALTER TABLE chats ADD COLUMN IF NOT EXISTS avatar_url TEXT`,
		`ALTER TABLE chats ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_msg_id VARCHAR(64)`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_id UUID`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_visibility VARCHAR(20) DEFAULT 'everybody'`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_visibility VARCHAR(20) DEFAULT 'everybody'`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_visibility VARCHAR(20) DEFAULT 'everybody'`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_private BOOLEAN DEFAULT true`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_groups BOOLEAN DEFAULT true`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_channels BOOLEAN DEFAULT true`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_badges BOOLEAN DEFAULT true`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_sounds BOOLEAN DEFAULT true`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_reactions BOOLEAN DEFAULT true`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64)`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(100)`,
		`ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_email_unique UNIQUE (email)`,
	}

	fmt.Println("🚀 Running database migrations...")
	for i, query := range queries {
		if _, err := db.Exec(query); err != nil {
			return fmt.Errorf("migration #%d failed: %w", i+1, err)
		}
	}
	fmt.Println("✅ Database migrations completed successfully.")
	return nil
}
