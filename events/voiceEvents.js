const { Events } = require('discord.js');

class VoiceEvents {
  constructor(eventHandler) {
    this.client = eventHandler.client;
    this.voiceTracker = eventHandler.voiceTracker;
    this.config = eventHandler.config;
    this.eventHandler = eventHandler;
  }

  setup() {
    this.client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
      const userId = newState.id;
      const guildId = newState.guild.id;
      const member = newState.member;
      
      try {
        // User joined a voice channel
        if (!oldState.channelId && newState.channelId) {
          console.log(`🎤 ${member.displayName} joined voice channel ${newState.channel.name}`);
          if (this.voiceTracker) {
            await this.voiceTracker.handleVoiceJoin(userId, guildId, newState.channelId, member);
          }
        } 
        // User left a voice channel
        else if (oldState.channelId && !newState.channelId) {
          console.log(`🎤 ${member.displayName} left voice channel ${oldState.channel.name}`);
          if (this.voiceTracker) {
            await this.voiceTracker.handleVoiceLeave(userId, guildId, true);
          }
        }
        // User switched voice channels
        else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
          console.log(`🎤 ${member.displayName} switched from ${oldState.channel.name} to ${newState.channel.name}`);
          if (this.voiceTracker) {
            await this.voiceTracker.handleVoiceChannelSwitch(userId, guildId, oldState.channelId, newState.channelId);
          }
        }
        
        // Handle mute/deafen changes
        if (oldState.selfMute !== newState.selfMute || oldState.selfDeaf !== newState.selfDeaf) {
          if (this.voiceTracker) {
            await this.voiceTracker.handleVoiceEvent('user_muted', {
              userId,
              guildId,
              isMuted: newState.selfMute,
              isDeafened: newState.selfDeaf
            });
          }
        }
        
      } catch (error) {
        console.error('Error handling voice state update:', error);
      }
    });
  }
}

module.exports = VoiceEvents;