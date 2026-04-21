-- ✅ CATLOVER DATABASE SCHEMA (FOR SUPABASE / POSTGRES)

-- Users table with E2EE metadata
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    phone_number TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    public_key TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    online BOOLEAN DEFAULT false,
    avatar TEXT DEFAULT '' NOT NULL,
    phone_visibility TEXT DEFAULT 'everybody',
    last_seen_visibility TEXT DEFAULT 'everybody',
    avatar_visibility TEXT DEFAULT 'everybody',
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Messages table (Optimized for high-throughput)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY,
    session_id TEXT NOT NULL,
    sender_id UUID REFERENCES users(id),
    content TEXT NOT NULL, -- This is the ENCRYPTED blob
    timestamp BIGINT NOT NULL,
    encrypted BOOLEAN DEFAULT true,
    status TEXT DEFAULT 'sent',
    msg_type TEXT DEFAULT 'text'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

-- Blocked users table
CREATE TABLE IF NOT EXISTS blocked_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    blocked_user_id UUID REFERENCES users(id),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_user ON blocked_users(user_id);
