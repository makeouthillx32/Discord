class VoiceTracker {
    constructor(pointsSystem, database, redis) {
      this.pointsSystem = pointsSystem;
      this.database = database;
      this.redis = redis;
      this.activeSessions = new Map(); // userId -> session data
      this.sessionTimeouts = new Map(); // userId -> timeout ID
    }
  
    // 🎤 VOICE SESSION MANAGEMENT
    async handleVoiceJoin(userId, guildId, channelId, member = null) {
      try {
        console.log(`🎤 ${userId} joined voice channel ${channelId}`);
        
        // End any existing session first
        await this.handleVoiceLeave(userId, guildId, false);
        
        // Start new session in database
        const sessionId = await this.database.startVoiceSession(userId, guildId, channelId);
        
        // Track locally
        const sessionData = {
          sessionId,
          userId,
          guildId,
          channelId,
          startTime: Date.now(),
          lastUpdate: Date.now(),
          memberName: member ? member.displayName : 'Unknown',
          totalPoints: 0
        };
        
        this.activeSessions.set(userId, sessionData);
        
        // Set up periodic point awarding (every minute)
        this.startPeriodicPointAwarding(userId);
        
        // Update Redis session tracking
        await this.redis.startSession('voice', userId, guildId, {
          channelId,
          startTime: Date.now()
        });
        
        return sessionId;
      } catch (error) {
        console.error('Error handling voice join:', error);
        return null;
      }
    }
  
    async handleVoiceLeave(userId, guildId, awardFinalPoints = true) {
      try {
        const session = this.activeSessions.get(userId);
        if (!session) {
          return; // No active session
        }
        
        console.log(`🎤 ${userId} left voice channel after ${Math.floor((Date.now() - session.startTime) / 1000)}s`);
        
        // Stop periodic point awarding
        this.stopPeriodicPointAwarding(userId);
        
        if (awardFinalPoints) {
          // Calculate final points
          const timeSpent = Math.floor((Date.now() - session.startTime) / 1000);
          const { points, metadata } = this.pointsSystem.calculateVoicePoints(timeSpent);
          
          if (points > 0) {
            await this.pointsSystem.awardPoints(
              userId, 
              guildId, 
              points, 
              'Voice Activity', 
              'voice',
              metadata
            );
            
            session.totalPoints += points;
          }
          
          // End session in database
          await this.database.endVoiceSession(userId, guildId, session.totalPoints);
        }
        
        // Clean up local tracking
        this.activeSessions.delete(userId);
        
        // Clean up Redis session
        const redisSessions = await this.redis.getUserActiveSessions(userId, 'voice');
        for (const redisSession of redisSessions) {
          await this.redis.endSession(redisSession.sessionId);
        }
        
      } catch (error) {
        console.error('Error handling voice leave:', error);
      }
    }
  
    async handleVoiceChannelSwitch(userId, guildId, oldChannelId, newChannelId) {
      try {
        console.log(`🎤 ${userId} switched from ${oldChannelId} to ${newChannelId}`);
        
        const session = this.activeSessions.get(userId);
        if (session) {
          // Update channel but keep session running
          session.channelId = newChannelId;
          session.lastUpdate = Date.now();
          
          // Update in database
          await this.database.updateVoiceSession(session.sessionId, { channelId: newChannelId });
        }
      } catch (error) {
        console.error('Error handling voice channel switch:', error);
      }
    }
  
    // ⏱️ PERIODIC POINT AWARDING
    startPeriodicPointAwarding(userId) {
      // Clear any existing timeout
      this.stopPeriodicPointAwarding(userId);
      
      const timeout = setInterval(async () => {
        try {
          await this.awardPeriodicPoints(userId);
        } catch (error) {
          console.error(`Error awarding periodic points for ${userId}:`, error);
          this.stopPeriodicPointAwarding(userId);
        }
      }, 60000); // Every minute
      
      this.sessionTimeouts.set(userId, timeout);
    }
  
    stopPeriodicPointAwarding(userId) {
      const timeout = this.sessionTimeouts.get(userId);
      if (timeout) {
        clearInterval(timeout);
        this.sessionTimeouts.delete(userId);
      }
    }
  
    async awardPeriodicPoints(userId) {
      const session = this.activeSessions.get(userId);
      if (!session) {
        this.stopPeriodicPointAwarding(userId);
        return;
      }
      
      // Award points for each minute in voice
      const pointsPerMinute = this.pointsSystem.pointsConfig.VOICE_MINUTE;
      
      await this.pointsSystem.awardPoints(
        userId,
        session.guildId,
        pointsPerMinute,
        'Voice Activity (Periodic)',
        'voice',
        {
          channelId: session.channelId,
          sessionDuration: Date.now() - session.startTime,
          pointsPerMinute
        }
      );
      
      session.totalPoints += pointsPerMinute;
      session.lastUpdate = Date.now();
      
      console.log(`🎯 Awarded ${pointsPerMinute} voice points to ${userId} (Total session: ${session.totalPoints})`);
    }
  
    // 📊 SESSION ANALYTICS
    async getActiveVoiceSessions(guildId = null) {
      const sessions = [];
      
      for (const [userId, session] of this.activeSessions) {
        if (!guildId || session.guildId === guildId) {
          sessions.push({
            ...session,
            duration: Date.now() - session.startTime,
            estimatedPoints: Math.floor((Date.now() - session.startTime) / 60000) * this.pointsSystem.pointsConfig.VOICE_MINUTE
          });
        }
      }
      
      return sessions;
    }
  
    async getVoiceStats(userId, guildId, days = 7) {
      try {
        const stats = await this.database.getVoiceStats(userId, guildId, days);
        
        return {
          totalTimeSeconds: stats.total_time_seconds || 0,
          totalSessions: stats.total_sessions || 0,
          avgSessionLength: stats.avg_session_length || 0,
          longestSession: stats.longest_session || 0,
          pointsEarned: stats.points_earned || 0,
          favoriteChannel: stats.favorite_channel || null,
          peakHours: stats.peak_hours || []
        };
      } catch (error) {
        console.error('Error getting voice stats:', error);
        return this.getDefaultVoiceStats();
      }
    }
  
    async getGuildVoiceActivity(guildId, days = 7) {
      try {
        const activity = await this.database.getGuildVoiceActivity(guildId, days);
        
        return {
          totalUsers: activity.total_users || 0,
          totalTimeSeconds: activity.total_time_seconds || 0,
          totalSessions: activity.total_sessions || 0,
          avgUsersPerHour: activity.avg_users_per_hour || 0,
          peakChannels: activity.peak_channels || [],
          hourlyActivity: activity.hourly_activity || []
        };
      } catch (error) {
        console.error('Error getting guild voice activity:', error);
        return this.getDefaultGuildVoiceActivity();
      }
    }
  
    // 🎖️ VOICE ACHIEVEMENTS
    async checkVoiceAchievements(userId, guildId, sessionDuration) {
      try {
        const achievements = [];
        const hoursSpent = Math.floor(sessionDuration / 3600000); // Convert to hours
        
        // Session length achievements
        if (sessionDuration >= 3600000 && !await this.hasAchievement(userId, guildId, 'voice_1hour_session')) {
          achievements.push({
            id: 'voice_1hour_session',
            name: 'Marathon Talker',
            description: 'Spend 1 hour in a single voice session',
            icon: '🏃‍♂️',
            rarity: 'common'
          });
        }
        
        if (sessionDuration >= 10800000 && !await this.hasAchievement(userId, guildId, 'voice_3hour_session')) {
          achievements.push({
            id: 'voice_3hour_session',
            name: 'Voice Endurance Master',
            description: 'Spend 3 hours in a single voice session',
            icon: '🎯',
            rarity: 'epic'
          });
        }
        
        // Total time achievements
        const userStats = await this.getVoiceStats(userId, guildId, 365); // Check yearly stats
        const totalHours = Math.floor(userStats.totalTimeSeconds / 3600);
        
        const hourMilestones = [10, 50, 100, 500, 1000];
        for (const milestone of hourMilestones) {
          if (totalHours >= milestone && !await this.hasAchievement(userId, guildId, `voice_${milestone}h_total`)) {
            achievements.push({
              id: `voice_${milestone}h_total`,
              name: `Voice Veteran ${milestone}h`,
              description: `Spend ${milestone} total hours in voice channels`,
              icon: '🎤',
              rarity: milestone >= 500 ? 'legendary' : milestone >= 100 ? 'epic' : 'rare'
            });
          }
        }
        
        // Award achievements
        for (const achievement of achievements) {
          await this.database.awardAchievement(userId, guildId, achievement);
          console.log(`🏅 ${userId} earned voice achievement: ${achievement.name}`);
        }
        
        return achievements;
      } catch (error) {
        console.error('Error checking voice achievements:', error);
        return [];
      }
    }
  
    async hasAchievement(userId, guildId, achievementId) {
      try {
        return await this.database.hasAchievement(userId, guildId, achievementId);
      } catch (error) {
        console.error('Error checking achievement:', error);
        return false;
      }
    }
  
    // 🔔 VOICE EVENTS AND NOTIFICATIONS
    async handleVoiceEvent(eventType, data) {
      try {
        switch (eventType) {
          case 'user_muted':
            await this.handleUserMuted(data.userId, data.guildId, data.isMuted);
            break;
          case 'user_deafened':
            await this.handleUserDeafened(data.userId, data.guildId, data.isDeafened);
            break;
          case 'channel_updated':
            await this.handleChannelUpdated(data.channelId, data.guildId, data.changes);
            break;
        }
      } catch (error) {
        console.error('Error handling voice event:', error);
      }
    }
  
    async handleUserMuted(userId, guildId, isMuted) {
      const session = this.activeSessions.get(userId);
      if (session) {
        // Update session metadata
        await this.database.updateVoiceSession(session.sessionId, { 
          isMuted,
          lastMuteChange: Date.now()
        });
      }
    }
  
    async handleUserDeafened(userId, guildId, isDeafened) {
      const session = this.activeSessions.get(userId);
      if (session) {
        // Update session metadata
        await this.database.updateVoiceSession(session.sessionId, { 
          isDeafened,
          lastDeafenChange: Date.now()
        });
      }
    }
  
    async handleChannelUpdated(channelId, guildId, changes) {
      // Update all sessions in this channel
      for (const [userId, session] of this.activeSessions) {
        if (session.channelId === channelId && session.guildId === guildId) {
          await this.database.updateVoiceSession(session.sessionId, {
            channelUpdates: changes,
            lastChannelUpdate: Date.now()
          });
        }
      }
    }
  
    // 📈 PERFORMANCE MONITORING
    async recordVoiceMetrics() {
      try {
        const activeSessionCount = this.activeSessions.size;
        const totalDuration = Array.from(this.activeSessions.values())
          .reduce((total, session) => total + (Date.now() - session.startTime), 0);
        
        await this.pointsSystem.recordPerformanceMetric('active_voice_sessions', activeSessionCount);
        await this.pointsSystem.recordPerformanceMetric('total_voice_duration', totalDuration);
        
      } catch (error) {
        console.error('Error recording voice metrics:', error);
      }
    }
  
    // 🧹 CLEANUP AND MAINTENANCE
    async cleanup() {
      try {
        console.log('🧹 Cleaning up voice tracker...');
        
        // Clean up any stale sessions (sessions older than 6 hours)
        const cutoffTime = Date.now() - (6 * 60 * 60 * 1000);
        
        for (const [userId, session] of this.activeSessions) {
          if (session.startTime < cutoffTime) {
            console.log(`🧹 Cleaning up stale voice session for ${userId}`);
            await this.handleVoiceLeave(userId, session.guildId, true);
          }
        }
        
        // Clean up Redis sessions
        await this.redis.cleanup();
        
        console.log('✅ Voice tracker cleanup completed');
      } catch (error) {
        console.error('Error during voice tracker cleanup:', error);
      }
    }
  
    async forceEndAllSessions(reason = 'Bot restart') {
      try {
        console.log(`🛑 Force ending all voice sessions: ${reason}`);
        
        const sessionPromises = [];
        for (const [userId, session] of this.activeSessions) {
          sessionPromises.push(this.handleVoiceLeave(userId, session.guildId, true));
        }
        
        await Promise.all(sessionPromises);
        
        console.log(`✅ Ended ${sessionPromises.length} voice sessions`);
      } catch (error) {
        console.error('Error force ending voice sessions:', error);
      }
    }
  
    // 📊 UTILITY METHODS
    getDefaultVoiceStats() {
      return {
        totalTimeSeconds: 0,
        totalSessions: 0,
        avgSessionLength: 0,
        longestSession: 0,
        pointsEarned: 0,
        favoriteChannel: null,
        peakHours: []
      };
    }
  
    getDefaultGuildVoiceActivity() {
      return {
        totalUsers: 0,
        totalTimeSeconds: 0,
        totalSessions: 0,
        avgUsersPerHour: 0,
        peakChannels: [],
        hourlyActivity: []
      };
    }
  
    isUserInVoice(userId) {
      return this.activeSessions.has(userId);
    }
  
    getUserVoiceSession(userId) {
      return this.activeSessions.get(userId) || null;
    }
  
    getActiveSessionCount(guildId = null) {
      if (!guildId) {
        return this.activeSessions.size;
      }
      
      let count = 0;
      for (const session of this.activeSessions.values()) {
        if (session.guildId === guildId) {
          count++;
        }
      }
      return count;
    }
  
    // 📤 DATA EXPORT
    async exportVoiceData(userId, guildId) {
      try {
        const stats = await this.getVoiceStats(userId, guildId, 365);
        const currentSession = this.getUserVoiceSession(userId);
        
        return {
          userVoiceStats: stats,
          currentSession: currentSession ? {
            ...currentSession,
            duration: Date.now() - currentSession.startTime
          } : null,
          exportTimestamp: Date.now()
        };
      } catch (error) {
        console.error('Error exporting voice data:', error);
        return null;
      }
    }
  }
  
  module.exports = VoiceTracker;