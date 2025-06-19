const { Events } = require('discord.js');

class ReactionEvents {
  constructor(eventHandler) {
    this.client = eventHandler.client;
    this.config = eventHandler.config;
    this.eventHandler = eventHandler;
  }

  setup() {
    this.client.on(Events.MessageReactionAdd, async (reaction, user) => {
      if (user.bot) return;
      
      try {
        // Check if reaction is in guild
        if (!reaction.message.guild) return;

        console.log(`👍 ${user.tag} added ${reaction.emoji.name} to message in ${reaction.message.guild.name}`);
        
        // Award points to user who added reaction
        await this.eventHandler.safeAwardPoints(
          user.id,
          reaction.message.guild.id,
          this.config.points.REACTION_GIVEN,
          'Reaction Given',
          'reaction_given',
          {
            emoji: reaction.emoji.name,
            messageId: reaction.message.id,
            channelId: reaction.message.channel.id
          }
        );
        
        // Award points to message author for receiving reaction (if not bot)
        if (!reaction.message.author.bot && reaction.message.author.id !== user.id) {
          await this.eventHandler.safeAwardPoints(
            reaction.message.author.id,
            reaction.message.guild.id,
            this.config.points.REACTION_RECEIVED,
            'Reaction Received',
            'reaction_received',
            {
              emoji: reaction.emoji.name,
              messageId: reaction.message.id,
              reactorId: user.id,
              channelId: reaction.message.channel.id
            }
          );
        }

        // Bonus points for popular messages (multiple reactions)
        if (reaction.count >= 5) {
          await this.eventHandler.safeAwardPoints(
            reaction.message.author.id,
            reaction.message.guild.id,
            this.config.points.LONG_MESSAGE, // Reuse long message bonus
            'Popular Message',
            'popular_message',
            {
              emoji: reaction.emoji.name,
              messageId: reaction.message.id,
              reactionCount: reaction.count
            }
          );
        }
        
      } catch (error) {
        console.error('Error handling reaction add:', error);
      }
    });

    this.client.on(Events.MessageReactionRemove, async (reaction, user) => {
      if (user.bot) return;
      
      try {
        if (!reaction.message.guild) return;
        
        console.log(`👎 ${user.tag} removed ${reaction.emoji.name} from message in ${reaction.message.guild.name}`);
        
        // You could implement reaction removal tracking here
        // For now, we don't subtract points for removing reactions
        
      } catch (error) {
        console.error('Error handling reaction remove:', error);
      }
    });

    this.client.on(Events.MessageReactionRemoveAll, async (message) => {
      try {
        if (!message.guild) return;
        
        console.log(`🧹 All reactions removed from message in ${message.guild.name}`);
        
        // Log bulk reaction removal
        if (this.eventHandler.pointsSystem?.recordPerformanceMetric) {
          await this.eventHandler.pointsSystem.recordPerformanceMetric('reactions_bulk_removed', 1);
        }
        
      } catch (error) {
        console.error('Error handling reaction remove all:', error);
      }
    });

    this.client.on(Events.MessageReactionRemoveEmoji, async (reaction) => {
      try {
        if (!reaction.message.guild) return;
        
        console.log(`🧹 ${reaction.emoji.name} reactions removed from message in ${reaction.message.guild.name}`);
        
        // Log emoji-specific reaction removal
        if (this.eventHandler.pointsSystem?.recordPerformanceMetric) {
          await this.eventHandler.pointsSystem.recordPerformanceMetric('reactions_emoji_removed', 1);
        }
        
      } catch (error) {
        console.error('Error handling reaction remove emoji:', error);
      }
    });
  }

  // Get reaction statistics for a guild
  async getGuildReactionStats(guildId, days = 7) {
    try {
      if (!this.eventHandler.database) return null;

      // This would require a database query to get reaction stats
      // For now, return a placeholder
      return {
        totalReactionsGiven: 0,
        totalReactionsReceived: 0,
        mostUsedEmoji: null,
        topReactors: [],
        topReactionReceivers: []
      };
    } catch (error) {
      console.error('Error getting guild reaction stats:', error);
      return null;
    }
  }

  // Get reaction statistics for a user
  async getUserReactionStats(userId, guildId, days = 7) {
    try {
      if (!this.eventHandler.database) return null;

      // This would require a database query to get user reaction stats
      // For now, return a placeholder
      return {
        reactionsGiven: 0,
        reactionsReceived: 0,
        favoriteEmoji: null,
        reactionStreak: 0
      };
    } catch (error) {
      console.error('Error getting user reaction stats:', error);
      return null;
    }
  }

  // Check for reaction-based achievements
  async checkReactionAchievements(userId, guildId, reactionType) {
    try {
      if (!this.eventHandler.pointsSystem?.checkAchievements) return [];

      const userStats = await this.eventHandler.pointsSystem.getUserStats(userId, guildId);
      
      // Check for reaction milestones
      const achievements = [];
      
      if (reactionType === 'given') {
        const milestones = [10, 50, 100, 500, 1000];
        for (const milestone of milestones) {
          if (userStats.reactions_given >= milestone) {
            achievements.push({
              id: `reactions_given_${milestone}`,
              name: `Reactor ${milestone}`,
              description: `Give ${milestone} reactions`,
              icon: '👍',
              rarity: milestone >= 500 ? 'legendary' : milestone >= 100 ? 'epic' : 'common'
            });
          }
        }
      }

      if (reactionType === 'received') {
        const milestones = [25, 100, 250, 1000, 2500];
        for (const milestone of milestones) {
          if (userStats.reactions_received >= milestone) {
            achievements.push({
              id: `reactions_received_${milestone}`,
              name: `Popular ${milestone}`,
              description: `Receive ${milestone} reactions`,
              icon: '⭐',
              rarity: milestone >= 1000 ? 'legendary' : milestone >= 250 ? 'epic' : 'rare'
            });
          }
        }
      }

      return achievements;
    } catch (error) {
      console.error('Error checking reaction achievements:', error);
      return [];
    }
  }

  // Track emoji usage patterns
  async trackEmojiUsage(guildId, emojiName, userId) {
    try {
      if (!this.eventHandler.redis) return;

      const key = `emoji_usage:${guildId}:${emojiName}`;
      const userKey = `emoji_usage:${guildId}:${userId}:${emojiName}`;
      
      // Increment global emoji usage
      await this.eventHandler.redis.hincrby('emoji_global_usage', emojiName, 1);
      
      // Increment guild emoji usage
      await this.eventHandler.redis.hincrby(key, 'total', 1);
      await this.eventHandler.redis.hincrby(key, userId, 1);
      
      // Increment user emoji usage
      await this.eventHandler.redis.hincrby(userKey, 'count', 1);
      
      // Set expiration for cleanup
      await this.eventHandler.redis.expire(key, 86400 * 30); // 30 days
      await this.eventHandler.redis.expire(userKey, 86400 * 30);
      
    } catch (error) {
      console.error('Error tracking emoji usage:', error);
    }
  }

  // Get most popular emojis
  async getPopularEmojis(guildId, limit = 10) {
    try {
      if (!this.eventHandler.redis) return [];

      const key = `emoji_usage:${guildId}:*`;
      const keys = await this.eventHandler.redis.client.keys(key);
      
      const emojiCounts = [];
      for (const emojiKey of keys) {
        const emojiName = emojiKey.split(':')[2];
        const total = await this.eventHandler.redis.hget(emojiKey, 'total');
        if (total) {
          emojiCounts.push({ emoji: emojiName, count: parseInt(total) });
        }
      }
      
      return emojiCounts
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
        
    } catch (error) {
      console.error('Error getting popular emojis:', error);
      return [];
    }
  }

  // Handle custom emoji events
  setupCustomEmojiEvents() {
    this.client.on(Events.GuildEmojiCreate, async (emoji) => {
      console.log(`😀 New emoji created: ${emoji.name} in ${emoji.guild.name}`);
      
      // Award points to emoji creator if available
      if (emoji.author && this.eventHandler.safeAwardPoints) {
        await this.eventHandler.safeAwardPoints(
          emoji.author.id,
          emoji.guild.id,
          this.config.points.EMOJI_USED * 5, // Bonus for creating emoji
          'Emoji Created',
          'emoji_created',
          {
            emojiId: emoji.id,
            emojiName: emoji.name
          }
        );
      }
    });

    this.client.on(Events.GuildEmojiDelete, async (emoji) => {
      console.log(`😭 Emoji deleted: ${emoji.name} from ${emoji.guild.name}`);
    });

    this.client.on(Events.GuildEmojiUpdate, async (oldEmoji, newEmoji) => {
      console.log(`😀 Emoji updated: ${oldEmoji.name} → ${newEmoji.name} in ${newEmoji.guild.name}`);
    });
  }
}

module.exports = ReactionEvents;