const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

class DatabaseService {
    constructor(connectionString) {
        this.pool = new Pool({
            connectionString: connectionString,
            max: 20,                    // Maximum number of clients
            idleTimeoutMillis: 30000,   // Close idle clients after 30 seconds
            connectionTimeoutMillis: 5000, // Return error after 5 seconds if connection could not be established
            maxUses: 7500,              // Close (and replace) a connection after it has been used 7500 times
        });

        // Handle pool errors
        this.pool.on('error', (err, client) => {
            console.error('Unexpected error on idle client', err);
        });

        console.log('🗄️ PostgreSQL connection pool initialized');
    }

    async query(text, params) {
        const start = Date.now();
        try {
            const res = await this.pool.query(text, params);
            const duration = Date.now() - start;
            console.log('📊 Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
            return res;
        } catch (err) {
            console.error('❌ Database query error:', { text: text.substring(0, 100), error: err.message });
            throw err;
        }
    }

    // USER MANAGEMENT
    async upsertUser(userId, userData) {
        const query = `
            INSERT INTO users (id, username, display_name, avatar_url)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) 
            DO UPDATE SET 
                username = EXCLUDED.username,
                display_name = EXCLUDED.display_name,
                avatar_url = EXCLUDED.avatar_url,
                updated_at = NOW()
            RETURNING *
        `;
        
        const values = [
            userId,
            userData.username || 'Unknown',
            userData.displayName || userData.username || 'Unknown',
            userData.avatarURL || null
        ];

        const result = await this.query(query, values);
        return result.rows[0];
    }

    async upsertGuild(guildId, guildData) {
        const query = `
            INSERT INTO guilds (id, name, icon_url)
            VALUES ($1, $2, $3)
            ON CONFLICT (id)
            DO UPDATE SET
                name = EXCLUDED.name,
                icon_url = EXCLUDED.icon_url,
                updated_at = NOW()
            RETURNING *
        `;

        const values = [
            guildId,
            guildData.name || 'Unknown Guild',
            guildData.iconURL || null
        ];

        const result = await this.query(query, values);
        return result.rows[0];
    }

    // POINTS SYSTEM
    async awardPoints(userId, guildId, points, reason, activityType = 'general', metadata = {}, nodeId = 'unknown') {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');

            // First ensure user and guild exist
            await this.upsertUser(userId, { username: 'Unknown' });
            await this.upsertGuild(guildId, { name: 'Unknown Guild' });

            // Insert points transaction record
            const transactionQuery = `
                INSERT INTO points_transactions (user_id, guild_id, points_change, reason, activity_type, metadata, node_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
            `;
            
            await client.query(transactionQuery, [
                userId, guildId, points, reason, activityType, 
                JSON.stringify(metadata), nodeId
            ]);

            // Calculate new level (simple formula: level = floor(totalPoints / 100) + 1)
            const levelQuery = `
                SELECT 
                    COALESCE(total_points, 0) + $3 as new_total,
                    FLOOR((COALESCE(total_points, 0) + $3) / 100) + 1 as new_level
                FROM user_guild_stats 
                WHERE user_id = $1 AND guild_id = $2
                UNION ALL
                SELECT $3 as new_total, FLOOR($3 / 100) + 1 as new_level
                WHERE NOT EXISTS (
                    SELECT 1 FROM user_guild_stats WHERE user_id = $1 AND guild_id = $2
                )
                LIMIT 1
            `;

            const levelResult = await client.query(levelQuery, [userId, guildId, points]);
            const { new_total, new_level } = levelResult.rows[0];

            // Update or create user guild stats
            const upsertQuery = `
                INSERT INTO user_guild_stats (user_id, guild_id, total_points, level)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id, guild_id)
                DO UPDATE SET
                    total_points = $3,
                    level = $4,
                    updated_at = NOW()
                RETURNING total_points, level
            `;

            const result = await client.query(upsertQuery, [userId, guildId, new_total, new_level]);
            
            await client.query('COMMIT');
            
            console.log(`🎯 Awarded ${points} points to ${userId} for ${reason} (Total: ${new_total})`);
            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Error awarding points:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async updateActivityStats(userId, guildId, activityType, increment = 1) {
        const columnMap = {
            'message': 'messages_sent',
            'command': 'commands_used',
            'reaction_given': 'reactions_given',
            'reaction_received': 'reactions_received',
            'voice': 'voice_time_seconds'
        };

        const column = columnMap[activityType];
        if (!column) {
            console.warn(`Unknown activity type: ${activityType}`);
            return;
        }

        const query = `
            INSERT INTO user_guild_stats (user_id, guild_id, ${column})
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, guild_id)
            DO UPDATE SET
                ${column} = COALESCE(user_guild_stats.${column}, 0) + $3,
                updated_at = NOW()
        `;

        await this.query(query, [userId, guildId, increment]);
    }

    async getUserStats(userId, guildId) {
        const query = `
            SELECT 
                ugs.*,
                (ugs.level * 100) - ugs.total_points as points_to_next,
                (SELECT COUNT(*) + 1 FROM user_guild_stats 
                 WHERE guild_id = $2 AND total_points > ugs.total_points) as rank
            FROM user_guild_stats ugs
            WHERE ugs.user_id = $1 AND ugs.guild_id = $2
        `;

        const result = await this.query(query, [userId, guildId]);
        
        if (result.rows.length === 0) {
            // Return default stats for new users
            return {
                user_id: userId,
                guild_id: guildId,
                total_points: 0,
                level: 1,
                points_to_next: 100,
                messages_sent: 0,
                commands_used: 0,
                reactions_given: 0,
                reactions_received: 0,
                voice_time_seconds: 0,
                rank: 'Unranked'
            };
        }

        return result.rows[0];
    }

    async getLeaderboard(guildId, limit = 10, offset = 0) {
        const query = `
            SELECT 
                ugs.user_id,
                u.username,
                u.display_name,
                ugs.total_points,
                ugs.level,
                (ugs.level * 100) - ugs.total_points as points_to_next,
                ugs.messages_sent,
                FLOOR(ugs.voice_time_seconds / 60) as voice_time_minutes,
                ROW_NUMBER() OVER (ORDER BY ugs.total_points DESC) as rank
            FROM user_guild_stats ugs
            LEFT JOIN users u ON ugs.user_id = u.id
            WHERE ugs.guild_id = $1 AND ugs.total_points > 0
            ORDER BY ugs.total_points DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await this.query(query, [guildId, limit, offset]);
        return result.rows;
    }

    // VOICE TRACKING
    async startVoiceSession(userId, guildId, channelId) {
        const query = `
            INSERT INTO voice_sessions (user_id, guild_id, channel_id, started_at)
            VALUES ($1, $2, $3, NOW())
            RETURNING id
        `;

        const result = await this.query(query, [userId, guildId, channelId]);
        return result.rows[0].id;
    }

    async endVoiceSession(userId, guildId, pointsAwarded = 0) {
        const query = `
            UPDATE voice_sessions 
            SET 
                ended_at = NOW(),
                duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at)),
                points_awarded = $3
            WHERE user_id = $1 AND guild_id = $2 AND ended_at IS NULL
            RETURNING duration_seconds
        `;

        const result = await this.query(query, [userId, guildId, pointsAwarded]);
        return result.rows[0]?.duration_seconds || 0;
    }

    async getActiveVoiceSession(userId, guildId) {
        const query = `
            SELECT id, started_at, channel_id
            FROM voice_sessions
            WHERE user_id = $1 AND guild_id = $2 AND ended_at IS NULL
            ORDER BY started_at DESC
            LIMIT 1
        `;

        const result = await this.query(query, [userId, guildId]);
        return result.rows[0] || null;
    }

    // DAILY ACTIVITY TRACKING
    async updateDailyActivity(userId, guildId, activityData) {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        
        const query = `
            INSERT INTO daily_activity (
                user_id, guild_id, activity_date, 
                messages_sent, commands_used, voice_time_seconds, reactions_given, points_earned,
                first_activity_time, last_activity_time
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
            ON CONFLICT (user_id, guild_id, activity_date)
            DO UPDATE SET
                messages_sent = daily_activity.messages_sent + EXCLUDED.messages_sent,
                commands_used = daily_activity.commands_used + EXCLUDED.commands_used,
                voice_time_seconds = daily_activity.voice_time_seconds + EXCLUDED.voice_time_seconds,
                reactions_given = daily_activity.reactions_given + EXCLUDED.reactions_given,
                points_earned = daily_activity.points_earned + EXCLUDED.points_earned,
                last_activity_time = NOW()
        `;

        const values = [
            userId, guildId, today,
            activityData.messages || 0,
            activityData.commands || 0,
            activityData.voiceSeconds || 0,
            activityData.reactions || 0,
            activityData.points || 0
        ];

        await this.query(query, values);
    }

    // CONNECTION MANAGEMENT
    async testConnection() {
        try {
            const result = await this.query('SELECT NOW() as current_time, version() as postgres_version');
            console.log('✅ Database connection test successful:', result.rows[0]);
            return true;
        } catch (error) {
            console.error('❌ Database connection test failed:', error);
            return false;
        }
    }

    async close() {
        await this.pool.end();
        console.log('🗄️ Database connection pool closed');
    }

    // UTILITY METHODS
    async getDatabaseSize() {
        const query = `
            SELECT 
                pg_size_pretty(pg_database_size(current_database())) as database_size,
                (SELECT COUNT(*) FROM user_guild_stats) as user_count,
                (SELECT COUNT(*) FROM points_transactions) as transaction_count,
                (SELECT MAX(created_at) FROM points_transactions) as last_activity
        `;

        const result = await this.query(query);
        return result.rows[0];
    }

    async exportUserData(userId, guildId) {
        const queries = {
            user_stats: `SELECT * FROM user_guild_stats WHERE user_id = $1 AND guild_id = $2`,
            points_history: `SELECT * FROM points_transactions WHERE user_id = $1 AND guild_id = $2 ORDER BY created_at DESC`,
            voice_sessions: `SELECT * FROM voice_sessions WHERE user_id = $1 AND guild_id = $2 ORDER BY started_at DESC`,
            daily_activity: `SELECT * FROM daily_activity WHERE user_id = $1 AND guild_id = $2 ORDER BY activity_date DESC`
        };

        const userData = {};
        for (const [table, query] of Object.entries(queries)) {
            const result = await this.query(query, [userId, guildId]);
            userData[table] = result.rows;
        }

        return userData;
    }
}

module.exports = DatabaseService;