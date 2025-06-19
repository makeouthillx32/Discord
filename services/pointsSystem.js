class PointsSystem {
    constructor(database, redis, config) {
      this.database = database;
      this.redis = redis;
      this.config = config;
      this.pointsConfig = config.points;
    }
  
    // 🎯 MAIN POINTS AWARDING FUNCTION
    async awardPoints(userId, guildId, points, reason = 'Activity', activityType = 'general', metadata = {}) {
      try {
        // Award points in database
        await this.database.awardPoints(
          userId, 
          guildId, 
          points, 
          reason, 
          activityType, 
          metadata, 
          this.config.nodeId
        );
        
        // Update activity stats
        await this.updateActivityStats(userId, guildId, activityType, points);
        
        // Invalidate user cache
        await this.redis.invalidateUserCache(userId, guildId);
        
        console.log(`🎯 Awarded ${points} points to ${userId} for ${reason} (Type: ${activityType})`);
        
        return true;
      } catch (error) {
        console.error('Error awarding points:', error);
        return false;
      }
    }
  
    // 📊 ACTIVITY STATS TRACKING
    async updateActivityStats(userId, guildId, activityType, value = 1) {
      try {
        switch (activityType) {
          case 'message':
            await this.database.updateActivityStats(userId, guildId, 'message', value);
            break;
          case 'command':
            await this.database.updateActivityStats(userId, guildId, 'command', value);
            break;
          case 'voice':
            const minutes = Math.floor(value / this.pointsConfig.VOICE_MINUTE);
            if (minutes > 0) {
              await this.database.updateActivityStats(userId, guildId, 'voice', minutes);
            }
            break;
          case 'reaction_given':
            await this.database.updateActivityStats(userId, guildId, 'reaction_given', value);
            break;
          case 'reaction_received':
            await this.database.updateActivityStats(userId, guildId, 'reaction_received', value);
            break;
        }
      } catch (error) {
        console.error('Error updating activity stats:', error);
      }
    }
  
    // 💬 MESSAGE POINTS CALCULATION
    async calculateMessagePoints(message) {
      let messagePoints = this.pointsConfig.MESSAGE_SENT;
      const metadata = { messageLength: message.content.length };
      
      // Bonus for long messages
      if (message.content.length > 100) {
        messagePoints += this.pointsConfig.LONG_MESSAGE;
        metadata.longMessageBonus = true;
      }
      
      // Bonus for using custom emojis
      const emojiMatches = message.content.match(/<:\w+:\d+>/g);
      if (emojiMatches) {
        const emojiBonus = emojiMatches.length * this.pointsConfig.EMOJI_USED;
        messagePoints += emojiBonus;
        metadata.customEmojis = emojiMatches.length;
        metadata.emojiBonus = emojiBonus;
      }
      
      // Check for first message of the day
      const isFirstToday = await this.redis.checkFirstMessageToday(message.author.id, message.guild.id);
      if (isFirstToday) {
        messagePoints += this.pointsConfig.FIRST_MESSAGE_DAY;
        metadata.firstMessageOfDay = true;
      }
      
      return { points: messagePoints, metadata };
    }
  
    // 🎤 VOICE POINTS CALCULATION
    calculateVoicePoints(timeSpentSeconds) {
      const minutes = Math.floor(timeSpentSeconds / 60);
      const points = minutes * this.pointsConfig.VOICE_MINUTE;
      
      return {
        points,
        metadata: {
          timeSpentSeconds,
          minutes,
          pointsPerMinute: this.pointsConfig.VOICE_MINUTE
        }
      };
    }
  
    // 👤 USER STATS WITH CACHING
    async getUserStats(userId, guildId, useCache = true) {
      try {
        // Try cache first
        if (useCache) {
          const cached = await this.redis.getCachedUserStats(userId, guildId);
          if (cached) {
            return cached;
          }
        }
        
        // Get from database
        const stats = await this.database.getUserStats(userId, guildId);
        
        // Cache the result
        if (useCache) {
          await this.redis.cacheUserStats(userId, guildId, stats, 300); // 5 minutes cache
        }
        
        return stats;
      } catch (error) {
        console.error('Error getting user stats:', error);
        return this.getDefaultUserStats();
      }
    }
  
    // 🏆 LEADERBOARD WITH CACHING
    async getLeaderboard(guildId, limit = 10, useCache = true) {
      try {
        const cacheKey = `leaderboard:${guildId}:${limit}`;
        
        // Try cache first
        if (useCache) {
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            return JSON.parse(cached);
          }
        }
        
        // Get from database
        const leaderboard = await this.database.getLeaderboard(guildId, limit);
        
        // Cache the result
        if (useCache) {
          await this.redis.set(cacheKey, JSON.stringify(leaderboard), 120); // 2 minutes cache
        }
        
        return leaderboard;
      } catch (error) {
        console.error('Error getting leaderboard:', error);
        return [];
      }
    }
  
    // 🎉 LEVEL UP HANDLING
    async handleLevelUp(userId, guildId, newLevel, oldLevel, client) {
      try {
        console.log(`🎉 User ${userId} leveled up from ${oldLevel} to ${newLevel}!`);
        
        // Record level up in database
        await this.database.recordLevelUp(userId, guildId, newLevel, oldLevel);
        
        // Send congratulations message
        await this.sendLevelUpMessage(userId, guildId, newLevel, client);
        
        // Check for level rewards
        const rewards = await this.database.getLevelRewards(newLevel);
        if (rewards.length > 0) {
          await this.processLevelRewards(userId, guildId, rewards);
        }
        
      } catch (error) {
        console.error('Error handling level up:', error);
      }
    }
  
    async sendLevelUpMessage(userId, guildId, newLevel, client) {
      try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;
        
        const member = guild.members.cache.get(userId);
        if (!member) return;
        
        // Find appropriate channel to send message
        const channel = guild.systemChannel || 
                      guild.channels.cache.find(ch => ch.type === 0 && ch.name.includes('general')) ||
                      guild.channels.cache.find(ch => ch.type === 0 && ch.permissionsFor(guild.members.me)?.has(['SendMessages']));
        
        if (!channel) return;
        
        // Create level up embed
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
          .setColor(this.getLevelColor(newLevel))
          .setTitle('🎉 Level Up!')
          .setDescription(`${member.toString()} has reached **Level ${newLevel}**!`)
          .addFields([
            { name: '🎯 New Level', value: newLevel.toString(), inline: true },
            { name: '⭐ Points Needed for Next', value: ((newLevel * this.pointsConfig.LEVEL_MULTIPLIER)).toString(), inline: true }
          ])
          .setThumbnail(member.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: 'Keep being active to earn more points!' });
        
        await channel.send({ embeds: [embed] });
        
      } catch (error) {
        console.error('Error sending level up message:', error);
      }
    }
  
    getLevelColor(level) {
      if (level >= 50) return 0xFF0000; // Red - Legendary
      if (level >= 25) return 0xFF69B4; // Pink - Epic
      if (level >= 15) return 0x9932CC; // Purple - Rare  
      if (level >= 10) return 0x0000FF; // Blue - Uncommon
      if (level >= 5) return 0x00FF00;  // Green - Common
      return 0x808080; // Gray - Beginner
    }
  
    async processLevelRewards(userId, guildId, rewards) {
      try {
        for (const reward of rewards) {
          switch (reward.reward_type) {
            case 'points':
              await this.awardPoints(userId, guildId, reward.reward_value, 'Level Reward', 'level_reward');
              break;
            case 'role':
              // Role assignment would need guild and member objects
              console.log(`TODO: Assign role ${reward.reward_value} to user ${userId}`);
              break;
            case 'badge':
              await this.database.awardBadge(userId, guildId, reward.reward_value);
              break;
          }
        }
      } catch (error) {
        console.error('Error processing level rewards:', error);
      }
    }
  
    // 📈 DAILY ACTIVITY TRACKING
    async updateDailyActivity(userId, guildId, activityType, points) {
      try {
        await this.database.updateDailyActivity(userId, guildId, activityType, points);
        
        // Check for daily streaks
        await this.checkDailyStreak(userId, guildId);
        
      } catch (error) {
        console.error('Error updating daily activity:', error);
      }
    }
  
    async checkDailyStreak(userId, guildId) {
      try {
        const streak = await this.database.checkDailyStreak(userId, guildId);
        
        // Award streak bonuses
        if (streak >= 7) {
          await this.awardPoints(userId, guildId, this.pointsConfig.WEEKLY_BONUS, 'Weekly Streak Bonus', 'streak');
        }
        
        if (streak >= 30) {
          await this.awardPoints(userId, guildId, this.pointsConfig.MONTHLY_BONUS, 'Monthly Streak Bonus', 'streak');
        }
        
      } catch (error) {
        console.error('Error checking daily streak:', error);
      }
    }
  
    // 🔍 ANALYTICS AND INSIGHTS
    async getGuildInsights(guildId, days = 7) {
      try {
        const insights = {
          totalUsers: 0,
          totalPoints: 0,
          avgPointsPerUser: 0,
          topActivity: null,
          growthRate: 0,
          activeUsers: 0
        };
        
        // Get guild statistics
        const stats = await this.database.getGuildStats(guildId, days);
        
        insights.totalUsers = stats.total_users || 0;
        insights.totalPoints = stats.total_points || 0;
        insights.avgPointsPerUser = insights.totalUsers > 0 ? Math.round(insights.totalPoints / insights.totalUsers) : 0;
        insights.activeUsers = stats.active_users || 0;
        
        // Get top activity type
        const topActivities = await this.database.getTopActivities(guildId, days);
        if (topActivities.length > 0) {
          insights.topActivity = topActivities[0];
        }
        
        // Calculate growth rate
        const previousStats = await this.database.getGuildStats(guildId, days * 2, days);
        if (previousStats.total_points > 0) {
          insights.growthRate = Math.round(((insights.totalPoints - previousStats.total_points) / previousStats.total_points) * 100);
        }
        
        return insights;
      } catch (error) {
        console.error('Error getting guild insights:', error);
        return this.getDefaultInsights();
      }
    }
  
    // 🎲 SPECIAL EVENTS AND MULTIPLIERS
    async applyEventMultiplier(basePoints, eventType = null) {
      if (!eventType) return basePoints;
      
      const multipliers = {
        'double_xp_weekend': 2.0,
        'triple_voice_points': 3.0,
        'message_madness': 1.5,
        'birthday_bonus': 2.5
      };
      
      const multiplier = multipliers[eventType] || 1.0;
      return Math.floor(basePoints * multiplier);
    }
  
    async getCurrentEvents(guildId) {
      try {
        return await this.database.getActiveEvents(guildId);
      } catch (error) {
        console.error('Error getting current events:', error);
        return [];
      }
    }
  
    // 🏅 ACHIEVEMENTS AND BADGES
    async checkAchievements(userId, guildId, activityType, currentStats) {
      try {
        const achievements = [];
        
        // Message milestones
        if (activityType === 'message') {
          const milestones = [10, 50, 100, 500, 1000, 5000, 10000];
          for (const milestone of milestones) {
            if (currentStats.messages_sent >= milestone && !await this.hasAchievement(userId, guildId, `messages_${milestone}`)) {
              achievements.push({
                id: `messages_${milestone}`,
                name: `Chatterbox ${milestone}`,
                description: `Send ${milestone} messages`,
                icon: '💬',
                rarity: milestone >= 1000 ? 'legendary' : milestone >= 100 ? 'epic' : 'common'
              });
            }
          }
        }
        
        // Voice milestones
        if (activityType === 'voice') {
          const voiceHours = Math.floor(currentStats.voice_time_seconds / 3600);
          const milestones = [1, 10, 50, 100, 500, 1000];
          for (const milestone of milestones) {
            if (voiceHours >= milestone && !await this.hasAchievement(userId, guildId, `voice_${milestone}h`)) {
              achievements.push({
                id: `voice_${milestone}h`,
                name: `Voice Veteran ${milestone}h`,
                description: `Spend ${milestone} hours in voice channels`,
                icon: '🎤',
                rarity: milestone >= 100 ? 'legendary' : milestone >= 10 ? 'epic' : 'common'
              });
            }
          }
        }
        
        // Award achievements
        for (const achievement of achievements) {
          await this.database.awardAchievement(userId, guildId, achievement);
          console.log(`🏅 ${userId} earned achievement: ${achievement.name}`);
        }
        
        return achievements;
      } catch (error) {
        console.error('Error checking achievements:', error);
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
  
    // 📊 PERFORMANCE METRICS
    async recordPerformanceMetric(metricName, value) {
      try {
        await this.redis.recordMetric(`points_system.${metricName}`, value);
      } catch (error) {
        console.error('Error recording performance metric:', error);
      }
    }
  
    async getPerformanceMetrics(minutes = 60) {
      try {
        const metrics = {};
        const metricNames = ['points_awarded', 'level_ups', 'achievements_earned', 'commands_processed'];
        
        for (const metricName of metricNames) {
          metrics[metricName] = await this.redis.getMetrics(`points_system.${metricName}`, minutes);
        }
        
        return metrics;
      } catch (error) {
        console.error('Error getting performance metrics:', error);
        return {};
      }
    }
  
    // 🔧 UTILITY METHODS
    getDefaultUserStats() {
      return {
        total_points: 0,
        level: 1,
        rank: 'Unranked',
        messages_sent: 0,
        commands_used: 0,
        voice_time_seconds: 0,
        reactions_given: 0,
        reactions_received: 0
      };
    }
  
    getDefaultInsights() {
      return {
        totalUsers: 0,
        totalPoints: 0,
        avgPointsPerUser: 0,
        topActivity: null,
        growthRate: 0,
        activeUsers: 0
      };
    }
  
    // 🧹 CLEANUP AND MAINTENANCE
    async performMaintenance() {
      try {
        console.log('🧹 Starting points system maintenance...');
        
        // Clean up old daily activity records (older than 90 days)
        await this.database.cleanupOldData(90);
        
        // Refresh leaderboard cache
        await this.refreshAllLeaderboards();
        
        // Update performance metrics
        await this.recordPerformanceMetric('maintenance_runs', 1);
        
        console.log('✅ Points system maintenance completed');
      } catch (error) {
        console.error('Error during maintenance:', error);
      }
    }
  
    async refreshAllLeaderboards() {
      try {
        // This would refresh cached leaderboards for all guilds
        const guilds = await this.database.getAllGuildIds();
        
        for (const guildId of guilds) {
          // Invalidate cache to force refresh on next request
          await this.redis.del(`leaderboard:${guildId}:10`);
          await this.redis.del(`leaderboard:${guildId}:25`);
          await this.redis.del(`leaderboard:${guildId}:50`);
        }
      } catch (error) {
        console.error('Error refreshing leaderboards:', error);
      }
    }
  
    // 📤 EXPORT AND BACKUP
    async exportUserData(userId, guildId) {
      try {
        return await this.database.exportUserData(userId, guildId);
      } catch (error) {
        console.error('Error exporting user data:', error);
        return null;
      }
    }
  
    async bulkImportPoints(importData) {
      try {
        return await this.database.bulkImportPoints(importData);
      } catch (error) {
        console.error('Error importing bulk points:', error);
        return false;
      }
    }
  }
  
  module.exports = PointsSystem;