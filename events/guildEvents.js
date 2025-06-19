const { Events } = require('discord.js');

class GuildEvents {
  constructor(eventHandler) {
    this.client = eventHandler.client;
    this.database = eventHandler.database;
    this.redis = eventHandler.redis;
    this.config = eventHandler.config;
    this.eventHandler = eventHandler;
  }

  setup() {
    this.client.on(Events.GuildCreate, async (guild) => {
      console.log(`🎉 Joined new guild: ${guild.name} (${guild.id})`);
      
      try {
        // Add guild to database
        await this.database.upsertGuild(guild.id, {
          name: guild.name,
          iconURL: guild.iconURL({ dynamic: true }),
          memberCount: guild.memberCount,
          ownerId: guild.ownerId
        });
        
        // Update node heartbeat with new guild count
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
        // Update node heartbeat
        await this.redis.updateNodeHeartbeat(this.config.nodeId, {
          status: 'active',
          guilds: this.client.guilds.cache.size
        });
        
      } catch (error) {
        console.error('Error handling guild delete:', error);
      }
    });

    // Thread events
    this.client.on(Events.ThreadCreate, async (thread) => {
      if (thread.ownerId && thread.guild) {
        try {
          await this.eventHandler.safeAwardPoints(
            thread.ownerId,
            thread.guild.id,
            this.config.points.THREAD_CREATED,
            'Thread Created',
            'thread',
            {
              threadId: thread.id,
              threadName: thread.name
            }
          );
        } catch (error) {
          console.error('Error handling thread create:', error);
        }
      }
    });

    // Invite events
    this.client.on(Events.InviteCreate, async (invite) => {
      if (invite.inviter && invite.guild) {
        try {
          await this.eventHandler.safeAwardPoints(
            invite.inviter.id,
            invite.guild.id,
            this.config.points.INVITE_CREATED,
            'Invite Created',
            'invite',
            {
              inviteCode: invite.code,
              maxUses: invite.maxUses
            }
          );
        } catch (error) {
          console.error('Error handling invite create:', error);
        }
      }
    });

    // Guild member events
    this.client.on(Events.GuildMemberAdd, async (member) => {
      console.log(`👤 New member joined ${member.guild.name}: ${member.user.tag}`);
      
      try {
        // Create user in database if doesn't exist
        await this.database.upsertUser(member.user.id, {
          username: member.user.username,
          displayName: member.displayName,
          avatarURL: member.user.displayAvatarURL({ dynamic: true })
        });
        
      } catch (error) {
        console.error('Error handling member add:', error);
      }
    });

    this.client.on(Events.GuildMemberRemove, async (member) => {
      console.log(`👤 Member left ${member.guild.name}: ${member.user.tag}`);
    });

    // Guild update events
    this.client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
      try {
        // Update guild info in database if name or icon changed
        if (oldGuild.name !== newGuild.name || oldGuild.icon !== newGuild.icon) {
          await this.database.upsertGuild(newGuild.id, {
            name: newGuild.name,
            iconURL: newGuild.iconURL({ dynamic: true })
          });
          
          console.log(`🏠 Guild updated: ${newGuild.name}`);
        }
      } catch (error) {
        console.error('Error handling guild update:', error);
      }
    });
  }
}

module.exports = GuildEvents;