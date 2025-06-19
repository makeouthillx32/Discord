// handlers/events/voiceEvents.js
const { Events } = require('discord.js');

class VoiceEvents {
  constructor(eventHandler) {
    this.client = eventHandler.client;
    this.voiceTracker = eventHandler.voiceTracker;
  }

  setup() {
    this.client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
      const userId = newState.id;
      const guildId = newState.guild.id;
      const member = newState.member;
      
      try {
        if (!oldState.channelId && newState.channelId) {
          await this.voiceTracker.handleVoiceJoin(userId, guildId, newState.channelId, member);
        } else if (oldState.channelId && !newState.channelId) {
          await this.voiceTracker.handleVoiceLeave(userId, guildId, true);
        }
      } catch (error) {
        console.error('Error handling voice state update:', error);
      }
    });
  }
}

// handlers/events/reactionEvents.js
const { Events } = require('discord.js');

class ReactionEvents {
  constructor(eventHandler) {
    this.client = eventHandler.client;
    this.config = eventHandler.config;
    this.eventHandler = eventHandler;
  }

  setup() {
    this.client.on(Events.MessageReactionAdd, async (reaction, user) => {
      if (user.bot || !reaction.message.guild) return;
      
      try {
        await this.eventHandler.safeAwardPoints(
          user.id,
          reaction.message.guild.id,
          this.config.points.REACTION_GIVEN,
          'Reaction Given',
          'reaction_given',
          { emoji: reaction.emoji.name }
        );
      } catch (error) {
        console.error('Error handling reaction add:', error);
      }
    });
  }
}

// handlers/events/guildEvents.js
const { Events } = require('discord.js');

class GuildEvents {
  constructor(eventHandler) {
    this.client = eventHandler.client;
    this.database = eventHandler.database;
    this.redis = eventHandler.redis;
    this.config = eventHandler.config;
  }

  setup() {
    this.client.on(Events.GuildCreate, async (guild) => {
      console.log(`🎉 Joined new guild: ${guild.name} (${guild.id})`);
      
      try {
        await this.database.upsertGuild(guild.id, {
          name: guild.name,
          iconURL: guild.iconURL({ dynamic: true })
        });
        
        await this.redis.updateNodeHeartbeat(this.config.nodeId, {
          status: 'active',
          guilds: this.client.guilds.cache.size
        });
      } catch (error) {
        console.error('Error handling guild create:', error);
      }
    });

    this.client.on(Events.GuildDelete, async (guild) => {
      console.log(`👋 Left guild: ${guild.name} (${guild.id})`);
      
      try {
        await this.redis.updateNodeHeartbeat(this.config.nodeId, {
          status: 'active',
          guilds: this.client.guilds.cache.size
        });
      } catch (error) {
        console.error('Error handling guild delete:', error);
      }
    });
  }
}

// handlers/events/errorEvents.js
const { Events } = require('discord.js');

class ErrorEvents {
  constructor(eventHandler) {
    this.client = eventHandler.client;
    this.config = eventHandler.config;
  }

  setup() {
    this.client.on(Events.Error, (error) => {
      console.error('💥 Discord client error:', error);
    });

    this.client.on(Events.Warn, (warning) => {
      console.warn('⚠️ Discord client warning:', warning);
    });

    this.client.on(Events.RateLimited, (rateLimitData) => {
      console.warn('🚦 Rate limited:', rateLimitData);
    });
  }
}

module.exports = { VoiceEvents, ReactionEvents, GuildEvents, ErrorEvents };