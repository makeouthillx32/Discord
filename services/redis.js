const Redis = require('ioredis');

class RedisService {
  constructor(url) {
    this.url = url;
    this.client = null;
    this.connected = false;
  }

  async connect() {
    try {
      this.client = new Redis(this.url);
      
      this.client.on('connect', () => {
        console.log('✅ Redis connected successfully');
        this.connected = true;
      });
      
      this.client.on('error', (error) => {
        console.error('❌ Redis connection error:', error);
        this.connected = false;
      });
      
      this.client.on('close', () => {
        console.log('🔌 Redis connection closed');
        this.connected = false;
      });
      
      // Test connection
      await this.client.ping();
      
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  // Basic Redis operations
  async get(key) {
    return await this.client.get(key);
  }

  async set(key, value, expiration = null) {
    if (expiration) {
      return await this.client.setex(key, expiration, value);
    }
    return await this.client.set(key, value);
  }

  async del(key) {
    return await this.client.del(key);
  }

  async exists(key) {
    return await this.client.exists(key);
  }

  async expire(key, seconds) {
    return await this.client.expire(key, seconds);
  }

  // Hash operations
  async hget(key, field) {
    return await this.client.hget(key, field);
  }

  async hset(key, field, value) {
    return await this.client.hset(key, field, value);
  }

  async hgetall(key) {
    return await this.client.hgetall(key);
  }

  async hincrby(key, field, increment) {
    return await this.client.hincrby(key, field, increment);
  }

  // Sorted set operations (for leaderboards)
  async zadd(key, score, member) {
    return await this.client.zadd(key, score, member);
  }

  async zincrby(key, increment, member) {
    return await this.client.zincrby(key, increment, member);
  }

  async zrevrange(key, start, stop, withScores = false) {
    if (withScores) {
      return await this.client.zrevrange(key, start, stop, 'WITHSCORES');
    }
    return await this.client.zrevrange(key, start, stop);
  }

  async zrevrank(key, member) {
    return await this.client.zrevrank(key, member);
  }

  async zscore(key, member) {
    return await this.client.zscore(key, member);
  }

  // Bot node management
  async registerNode(nodeId, nodeData) {
    const key = `bot:node:${nodeId}`;
    const data = JSON.stringify({
      ...nodeData,
      timestamp: Date.now()
    });
    
    return await this.set(key, data, 60); // 60 second TTL
  }

  async updateNodeHeartbeat(nodeId, nodeData) {
    return await this.registerNode(nodeId, nodeData);
  }

  async getActiveNodes() {
    const pattern = 'bot:node:*';
    const keys = await this.client.keys(pattern);
    const nodes = [];
    
    for (const key of keys) {
      const data = await this.get(key);
      if (data) {
        try {
          nodes.push(JSON.parse(data));
        } catch (error) {
          console.error('Error parsing node data:', error);
        }
      }
    }
    
    return nodes;
  }

  async removeNode(nodeId) {
    return await this.del(`bot:node:${nodeId}`);
  }

  // Daily activity tracking
  async checkFirstMessageToday(userId, guildId) {
    const today = new Date().toDateString();
    const key = `daily:${guildId}:${userId}:${today}`;
    
    // Use SET with NX (only set if not exists) and EX (expiration)
    const result = await this.client.set(key, '1', 'EX', 86400, 'NX');
    return result === 'OK'; // Returns true if it was the first message today
  }

  // Cache management
  async cacheUserStats(userId, guildId, stats, ttl = 300) {
    const key = `cache:user:${guildId}:${userId}`;
    return await this.set(key, JSON.stringify(stats), ttl);
  }

  async getCachedUserStats(userId, guildId) {
    const key = `cache:user:${guildId}:${userId}`;
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async invalidateUserCache(userId, guildId) {
    const key = `cache:user:${guildId}:${userId}`;
    return await this.del(key);
  }

  // Session management (for voice tracking, etc.)
  async startSession(sessionType, userId, guildId, sessionData) {
    const sessionId = `${sessionType}:${userId}:${guildId}:${Date.now()}`;
    const key = `session:${sessionId}`;
    
    const data = {
      sessionId,
      sessionType,
      userId,
      guildId,
      startTime: Date.now(),
      ...sessionData
    };
    
    await this.set(key, JSON.stringify(data), 3600); // 1 hour TTL
    return sessionId;
  }

  async getSession(sessionId) {
    const key = `session:${sessionId}`;
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async endSession(sessionId) {
    const key = `session:${sessionId}`;
    return await this.del(key);
  }

  async getUserActiveSessions(userId, sessionType = null) {
    const pattern = sessionType 
      ? `session:${sessionType}:${userId}:*`
      : `session:*:${userId}:*`;
    
    const keys = await this.client.keys(pattern);
    const sessions = [];
    
    for (const key of keys) {
      const data = await this.get(key);
      if (data) {
        try {
          sessions.push(JSON.parse(data));
        } catch (error) {
          console.error('Error parsing session data:', error);
        }
      }
    }
    
    return sessions;
  }

  // Performance monitoring
  async recordMetric(metricName, value, timestamp = Date.now()) {
    const key = `metrics:${metricName}:${Math.floor(timestamp / 60000)}`; // 1-minute buckets
    return await this.client.incrbyfloat(key, value);
  }

  async getMetrics(metricName, minutes = 60) {
    const now = Date.now();
    const keys = [];
    
    for (let i = 0; i < minutes; i++) {
      const bucket = Math.floor((now - (i * 60000)) / 60000);
      keys.push(`metrics:${metricName}:${bucket}`);
    }
    
    const values = await this.client.mget(keys);
    return values.map((v, i) => ({
      timestamp: now - (i * 60000),
      value: parseFloat(v) || 0
    }));
  }

  // Cleanup methods
  async cleanup() {
    // Remove expired sessions
    const sessionKeys = await this.client.keys('session:*');
    const now = Date.now();
    
    for (const key of sessionKeys) {
      const data = await this.get(key);
      if (data) {
        try {
          const session = JSON.parse(data);
          // Remove sessions older than 1 hour
          if (now - session.startTime > 3600000) {
            await this.del(key);
          }
        } catch (error) {
          // Remove invalid session data
          await this.del(key);
        }
      }
    }
    
    // Remove old metrics (older than 24 hours)
    const metricsKeys = await this.client.keys('metrics:*');
    const cutoff = Math.floor((now - (24 * 60 * 60 * 1000)) / 60000);
    
    for (const key of metricsKeys) {
      const bucket = parseInt(key.split(':').pop());
      if (bucket < cutoff) {
        await this.del(key);
      }
    }
  }

  // Connection management
  async ping() {
    return await this.client.ping();
  }

  async quit() {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
    }
  }

  isConnected() {
    return this.connected;
  }

  // Raw client access for advanced operations
  getClient() {
    return this.client;
  }
}

module.exports = RedisService;