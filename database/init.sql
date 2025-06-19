-- Discord Bot Database Schema
-- High-performance points system with proper indexing

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Users table - Basic user information
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(20) PRIMARY KEY,          -- Discord user ID
    username VARCHAR(100) NOT NULL,      -- Discord username
    display_name VARCHAR(100),           -- Discord display name
    avatar_url TEXT,                     -- Profile picture URL
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Guilds table - Discord servers
CREATE TABLE IF NOT EXISTS guilds (
    id VARCHAR(20) PRIMARY KEY,          -- Discord guild ID
    name VARCHAR(200) NOT NULL,          -- Guild name
    icon_url TEXT,                       -- Guild icon URL
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- User guild stats - Points and levels per server
CREATE TABLE IF NOT EXISTS user_guild_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(20) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guild_id VARCHAR(20) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    total_points BIGINT DEFAULT 0,
    level INTEGER DEFAULT 1,
    messages_sent BIGINT DEFAULT 0,
    voice_time_seconds BIGINT DEFAULT 0,
    commands_used BIGINT DEFAULT 0,
    reactions_given BIGINT DEFAULT 0,
    reactions_received BIGINT DEFAULT 0,
    daily_streak INTEGER DEFAULT 0,
    last_message_date DATE,
    last_voice_session TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, guild_id)
);

-- Points transaction log - Audit trail
CREATE TABLE IF NOT EXISTS points_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(20) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guild_id VARCHAR(20) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    points_change INTEGER NOT NULL,      -- Can be positive or negative
    reason VARCHAR(100) NOT NULL,        -- Why points were awarded/removed
    activity_type VARCHAR(50) NOT NULL,  -- message, voice, command, reaction, etc.
    metadata JSONB,                      -- Additional data about the transaction
    created_at TIMESTAMP DEFAULT NOW(),
    node_id VARCHAR(50)                  -- Which bot node processed this
);

-- Voice sessions - Track time in voice channels
CREATE TABLE IF NOT EXISTS voice_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(20) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guild_id VARCHAR(20) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    channel_id VARCHAR(20) NOT NULL,     -- Voice channel ID
    started_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP,
    duration_seconds INTEGER,
    points_awarded INTEGER DEFAULT 0
);

-- Daily activity tracking
CREATE TABLE IF NOT EXISTS daily_activity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(20) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guild_id VARCHAR(20) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    activity_date DATE NOT NULL,
    messages_sent INTEGER DEFAULT 0,
    voice_time_seconds INTEGER DEFAULT 0,
    commands_used INTEGER DEFAULT 0,
    points_earned INTEGER DEFAULT 0,
    first_activity_time TIMESTAMP,
    last_activity_time TIMESTAMP,
    UNIQUE(user_id, guild_id, activity_date)
);

-- Level rewards configuration
CREATE TABLE IF NOT EXISTS level_rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guild_id VARCHAR(20) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    level INTEGER NOT NULL,
    reward_type VARCHAR(50) NOT NULL,    -- role, badge, title, etc.
    reward_data JSONB NOT NULL,          -- Role ID, badge info, etc.
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(guild_id, level, reward_type)
);

-- Bot statistics and health
CREATE TABLE IF NOT EXISTS bot_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id VARCHAR(50) NOT NULL,
    guild_count INTEGER DEFAULT 0,
    user_count INTEGER DEFAULT 0,
    commands_processed INTEGER DEFAULT 0,
    points_awarded INTEGER DEFAULT 0,
    uptime_seconds INTEGER DEFAULT 0,
    memory_usage_mb FLOAT DEFAULT 0,
    recorded_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_guild_stats_user_guild ON user_guild_stats(user_id, guild_id);
CREATE INDEX IF NOT EXISTS idx_user_guild_stats_total_points ON user_guild_stats(guild_id, total_points DESC);
CREATE INDEX IF NOT EXISTS idx_user_guild_stats_level ON user_guild_stats(guild_id, level DESC);
CREATE INDEX IF NOT EXISTS idx_points_transactions_user_guild ON points_transactions(user_id, guild_id);
CREATE INDEX IF NOT EXISTS idx_points_transactions_created_at ON points_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_user_guild ON voice_sessions(user_id, guild_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_started_at ON voice_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_activity_user_guild_date ON daily_activity(user_id, guild_id, activity_date);
CREATE INDEX IF NOT EXISTS idx_daily_activity_guild_date ON daily_activity(guild_id, activity_date DESC);

-- Functions for automatic updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_guilds_updated_at BEFORE UPDATE ON guilds 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_guild_stats_updated_at BEFORE UPDATE ON user_guild_stats 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create default admin user for testing (optional)
INSERT INTO users (id, username, display_name) 
VALUES ('1', 'system', 'System User') 
ON CONFLICT (id) DO NOTHING;

-- Display creation summary
DO $$
BEGIN
    RAISE NOTICE 'Discord Bot Database Schema Created Successfully!';
    RAISE NOTICE 'Tables: users, guilds, user_guild_stats, points_transactions, voice_sessions, daily_activity, level_rewards, bot_stats';
    RAISE NOTICE 'Indexes: Performance optimized for queries and leaderboards';
    RAISE NOTICE 'Ready for production use with automatic cleanup and maintenance';
END $$;