-- Discord Bot Database Schema
-- High-performance points system with proper indexing



-- Reaction Role System Database Migration
-- Add this to your existing database schema

-- Reaction role messages table
CREATE TABLE IF NOT EXISTS reaction_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guild_id VARCHAR(20) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    channel_id VARCHAR(20) NOT NULL,
    message_id VARCHAR(20) NOT NULL UNIQUE,
    title VARCHAR(256) NOT NULL,
    description TEXT,
    color INTEGER DEFAULT 255,
    created_by VARCHAR(20) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Reaction role mappings table (emoji -> role relationships)
CREATE TABLE IF NOT EXISTS reaction_role_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guild_id VARCHAR(20) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    channel_id VARCHAR(20) NOT NULL,
    message_id VARCHAR(20) NOT NULL REFERENCES reaction_roles(message_id) ON DELETE CASCADE,
    emoji VARCHAR(100) NOT NULL,  -- Can be unicode emoji or custom emoji ID
    emoji_name VARCHAR(100),      -- Name of custom emoji (for display)
    emoji_id VARCHAR(20),         -- ID of custom emoji (null for unicode)
    role_id VARCHAR(20) NOT NULL,
    description TEXT,
    created_by VARCHAR(20) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(message_id, emoji)     -- One emoji per message
);

-- Reaction role action logs (for auditing)
CREATE TABLE IF NOT EXISTS reaction_role_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guild_id VARCHAR(20) NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id VARCHAR(20) NOT NULL,
    message_id VARCHAR(20) NOT NULL,
    action VARCHAR(20) NOT NULL,  -- 'added' or 'removed'
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reaction_roles_guild ON reaction_roles(guild_id);
CREATE INDEX IF NOT EXISTS idx_reaction_roles_message ON reaction_roles(message_id);
CREATE INDEX IF NOT EXISTS idx_reaction_role_mappings_message ON reaction_role_mappings(message_id);
CREATE INDEX IF NOT EXISTS idx_reaction_role_mappings_guild ON reaction_role_mappings(guild_id);
CREATE INDEX IF NOT EXISTS idx_reaction_role_mappings_emoji ON reaction_role_mappings(message_id, emoji);
CREATE INDEX IF NOT EXISTS idx_reaction_role_logs_guild ON reaction_role_logs(guild_id);
CREATE INDEX IF NOT EXISTS idx_reaction_role_logs_user ON reaction_role_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_reaction_role_logs_created ON reaction_role_logs(created_at DESC);

-- Add trigger for automatic timestamp updates (following your existing pattern)
CREATE TRIGGER update_reaction_roles_updated_at 
BEFORE UPDATE ON reaction_roles 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Display creation summary
DO $$
BEGIN
    RAISE NOTICE 'Reaction Role System Tables Created Successfully!';
    RAISE NOTICE 'Tables: reaction_roles, reaction_role_mappings, reaction_role_logs';
    RAISE NOTICE 'Indexes: Performance optimized for lookups and queries';
    RAISE NOTICE 'Ready for use with /reactionrole commands';
END $$;
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Users table - Basic user information
CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY,                    -- Discord user ID
    username VARCHAR(255) NOT NULL,
    discriminator VARCHAR(10),
    avatar_hash VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_bot BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Guilds table - Discord server information
CREATE TABLE IF NOT EXISTS guilds (
    id BIGINT PRIMARY KEY,                    -- Discord guild ID
    name VARCHAR(255) NOT NULL,
    icon_hash VARCHAR(255),
    owner_id BIGINT,
    member_count INTEGER DEFAULT 0,
    features TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    bot_joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Points - Main points tracking table
CREATE TABLE IF NOT EXISTS user_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL,
    guild_id BIGINT NOT NULL,
    total_points BIGINT DEFAULT 0,
    level INTEGER DEFAULT 1,
    messages_sent INTEGER DEFAULT 0,
    commands_used INTEGER DEFAULT 0,
    reactions_given INTEGER DEFAULT 0,
    reactions_received INTEGER DEFAULT 0,
    voice_time_minutes INTEGER DEFAULT 0,
    threads_created INTEGER DEFAULT 0,
    invites_created INTEGER DEFAULT 0,
    daily_streak INTEGER DEFAULT 0,
    last_daily_bonus DATE,
    last_weekly_bonus DATE,
    last_monthly_bonus DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, guild_id)
);

-- Points History - Detailed transaction log
CREATE TABLE IF NOT EXISTS points_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL,
    guild_id BIGINT NOT NULL,
    points INTEGER NOT NULL,
    reason VARCHAR(255) NOT NULL,
    action_type VARCHAR(50) NOT NULL,       -- 'message', 'reaction', 'voice', 'command', etc.
    metadata JSONB,                         -- Additional context data
    node_id VARCHAR(100),                   -- Which bot node processed this
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Voice Sessions - Track voice channel activity
CREATE TABLE IF NOT EXISTS voice_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL,
    guild_id BIGINT NOT NULL,
    channel_id BIGINT NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    points_awarded INTEGER DEFAULT 0,
    node_id VARCHAR(100)
);

-- Daily Activity - Track daily engagement patterns
CREATE TABLE IF NOT EXISTS daily_activity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL,
    guild_id BIGINT NOT NULL,
    activity_date DATE NOT NULL,
    messages_sent INTEGER DEFAULT 0,
    commands_used INTEGER DEFAULT 0,
    voice_minutes INTEGER DEFAULT 0,
    reactions_given INTEGER DEFAULT 0,
    points_earned INTEGER DEFAULT 0,
    first_activity_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, guild_id, activity_date)
);

-- Leaderboard Cache - Pre-computed rankings for performance
CREATE TABLE IF NOT EXISTS leaderboard_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guild_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    rank INTEGER NOT NULL,
    total_points BIGINT NOT NULL,
    level INTEGER NOT NULL,
    cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(guild_id, user_id)
);

-- Level Rewards - Configurable level-up rewards
CREATE TABLE IF NOT EXISTS level_rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guild_id BIGINT NOT NULL,
    level INTEGER NOT NULL,
    reward_type VARCHAR(50) NOT NULL,       -- 'role', 'currency', 'badge', etc.
    reward_data JSONB NOT NULL,             -- Flexible reward configuration
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(guild_id, level, reward_type)
);

-- Bot Statistics - Track bot performance and usage
CREATE TABLE IF NOT EXISTS bot_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guild_id BIGINT NOT NULL,
    node_id VARCHAR(100) NOT NULL,
    stat_date DATE NOT NULL,
    commands_processed INTEGER DEFAULT 0,
    messages_processed INTEGER DEFAULT 0,
    points_awarded INTEGER DEFAULT 0,
    voice_sessions INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    uptime_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(guild_id, node_id, stat_date)
);

-- Indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_user_points_guild_user ON user_points(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_points_total_points ON user_points(guild_id, total_points DESC);
CREATE INDEX IF NOT EXISTS idx_user_points_level ON user_points(level DESC);
CREATE INDEX IF NOT EXISTS idx_user_points_updated ON user_points(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_points_history_user_guild ON points_history(user_id, guild_id);
CREATE INDEX IF NOT EXISTS idx_points_history_created ON points_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_history_action_type ON points_history(action_type);
CREATE INDEX IF NOT EXISTS idx_points_history_guild_created ON points_history(guild_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_user_guild ON voice_sessions(user_id, guild_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_active ON voice_sessions(left_at) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_voice_sessions_joined ON voice_sessions(joined_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_activity_date ON daily_activity(activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_activity_user_guild_date ON daily_activity(user_id, guild_id, activity_date);

CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_guild_rank ON leaderboard_cache(guild_id, rank);
CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_cached ON leaderboard_cache(cached_at DESC);

-- Functions for automated tasks

-- Update user_points updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic timestamp updates
DROP TRIGGER IF EXISTS update_user_points_updated_at ON user_points;
CREATE TRIGGER update_user_points_updated_at 
    BEFORE UPDATE ON user_points 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate user level from points
CREATE OR REPLACE FUNCTION calculate_level(points BIGINT)
RETURNS INTEGER AS $$
BEGIN
    RETURN FLOOR(points / 100.0) + 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get points needed for next level
CREATE OR REPLACE FUNCTION points_to_next_level(current_points BIGINT)
RETURNS INTEGER AS $$
DECLARE
    current_level INTEGER;
    next_level_points BIGINT;
BEGIN
    current_level := calculate_level(current_points);
    next_level_points := current_level * 100;
    RETURN next_level_points - current_points;
END;
$$ LANGUAGE plpgsql;

-- Function to refresh leaderboard cache
CREATE OR REPLACE FUNCTION refresh_leaderboard_cache(target_guild_id BIGINT)
RETURNS VOID AS $$
BEGIN
    -- Delete old cache for this guild
    DELETE FROM leaderboard_cache WHERE guild_id = target_guild_id;
    
    -- Insert new rankings
    INSERT INTO leaderboard_cache (guild_id, user_id, rank, total_points, level)
    SELECT 
        guild_id,
        user_id,
        ROW_NUMBER() OVER (ORDER BY total_points DESC) as rank,
        total_points,
        level
    FROM user_points 
    WHERE guild_id = target_guild_id 
    AND total_points > 0
    ORDER BY total_points DESC;
END;
$$ LANGUAGE plpgsql;

-- Sample configuration data
INSERT INTO guilds (id, name, owner_id) VALUES 
(123456789012345678, 'Sample Discord Server', 987654321098765432)
ON CONFLICT (id) DO NOTHING;

-- Create a view for easy leaderboard queries
CREATE OR REPLACE VIEW v_leaderboard AS
SELECT 
    up.guild_id,
    up.user_id,
    u.username,
    up.total_points,
    up.level,
    points_to_next_level(up.total_points) as points_to_next,
    up.messages_sent,
    up.voice_time_minutes,
    up.daily_streak,
    ROW_NUMBER() OVER (PARTITION BY up.guild_id ORDER BY up.total_points DESC) as rank,
    up.updated_at
FROM user_points up
LEFT JOIN users u ON up.user_id = u.id
WHERE up.total_points > 0
ORDER BY up.guild_id, up.total_points DESC;

-- Create a view for user activity summary
CREATE OR REPLACE VIEW v_user_activity AS
SELECT 
    up.guild_id,
    up.user_id,
    u.username,
    up.total_points,
    up.level,
    up.messages_sent,
    up.commands_used,
    up.voice_time_minutes,
    up.daily_streak,
    COALESCE(recent.points_last_7d, 0) as points_last_7d,
    COALESCE(recent.messages_last_7d, 0) as messages_last_7d,
    up.updated_at as last_activity
FROM user_points up
LEFT JOIN users u ON up.user_id = u.id
LEFT JOIN (
    SELECT 
        user_id,
        guild_id,
        SUM(points_earned) as points_last_7d,
        SUM(messages_sent) as messages_last_7d
    FROM daily_activity 
    WHERE activity_date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY user_id, guild_id
) recent ON up.user_id = recent.user_id AND up.guild_id = recent.guild_id;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO bot_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO bot_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bot_user;

-- Maintenance: Set up automatic cleanup (optional)
-- Delete old points history (keep 90 days)
-- DELETE FROM points_history WHERE created_at < NOW() - INTERVAL '90 days';

-- Analyze tables for query optimization
ANALYZE users;
ANALYZE guilds;
ANALYZE user_points;
ANALYZE points_history;
ANALYZE voice_sessions;
ANALYZE daily_activity;
ANALYZE leaderboard_cache;

COMMIT;