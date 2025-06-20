const { Events } = require('discord.js');

class ReactionRoleEvents {
  constructor(eventHandler) {
    this.client = eventHandler.client;
    this.database = eventHandler.database;
    this.config = eventHandler.config;
    this.eventHandler = eventHandler;
  }

  setup() {
    this.client.on(Events.MessageReactionAdd, async (reaction, user) => {
      // Ignore bot reactions
      if (user.bot) return;

      try {
        // Handle partial reactions
        if (reaction.partial) {
          try {
            await reaction.fetch();
          } catch (error) {
            console.error('Error fetching reaction:', error);
            return;
          }
        }

        // Only handle reactions in guilds
        if (!reaction.message.guild) return;

        await this.handleReactionAdd(reaction, user);
      } catch (error) {
        console.error('Error handling reaction add for reaction roles:', error);
      }
    });

    this.client.on(Events.MessageReactionRemove, async (reaction, user) => {
      // Ignore bot reactions
      if (user.bot) return;

      try {
        // Handle partial reactions
        if (reaction.partial) {
          try {
            await reaction.fetch();
          } catch (error) {
            console.error('Error fetching reaction:', error);
            return;
          }
        }

        // Only handle reactions in guilds
        if (!reaction.message.guild) return;

        await this.handleReactionRemove(reaction, user);
      } catch (error) {
        console.error('Error handling reaction remove for reaction roles:', error);
      }
    });
  }

  async handleReactionAdd(reaction, user) {
    if (!this.database) return;

    try {
      // Get emoji identifier
      const emoji = reaction.emoji.id || reaction.emoji.name;
      
      // Look up reaction role mapping
      const result = await this.database.query(`
        SELECT role_id, description 
        FROM reaction_role_mappings 
        WHERE guild_id = $1 AND message_id = $2 AND emoji = $3
      `, [reaction.message.guild.id, reaction.message.id, emoji]);

      if (result.rows.length === 0) {
        // No reaction role configured for this emoji
        return;
      }

      const mapping = result.rows[0];
      const role = reaction.message.guild.roles.cache.get(mapping.role_id);

      if (!role) {
        console.error(`Role ${mapping.role_id} not found for reaction role`);
        return;
      }

      // Get guild member
      const member = reaction.message.guild.members.cache.get(user.id);
      if (!member) {
        console.error(`Member ${user.id} not found in guild`);
        return;
      }

      // Check if member already has the role
      if (member.roles.cache.has(role.id)) {
        console.log(`User ${user.tag} already has role ${role.name}`);
        return;
      }

      // Check bot permissions
      if (!reaction.message.guild.members.me.permissions.has('ManageRoles')) {
        console.error('Bot missing Manage Roles permission');
        return;
      }

      // Check role hierarchy
      if (role.position >= reaction.message.guild.members.me.roles.highest.position) {
        console.error(`Cannot assign role ${role.name} - role hierarchy issue`);
        return;
      }

      // Add the role
      try {
        await member.roles.add(role, `Reaction role from message ${reaction.message.id}`);
        
        console.log(`✅ Added role ${role.name} to ${user.tag} via reaction role`);

        // Award points for getting a role
        if (this.eventHandler.pointsSystem) {
          await this.eventHandler.safeAwardPoints(
            user.id,
            reaction.message.guild.id,
            this.config.points.REACTION_GIVEN * 2, // Double points for reaction roles
            'Reaction Role Obtained',
            'reaction_role',
            {
              roleId: role.id,
              roleName: role.name,
              messageId: reaction.message.id,
              emoji: emoji
            }
          );
        }

        // Log the action
        await this.logReactionRoleAction(reaction.message.guild, user, role, 'added', reaction.message.id);

      } catch (error) {
        console.error(`Error adding role ${role.name} to ${user.tag}:`, error);
      }

    } catch (error) {
      console.error('Error in handleReactionAdd:', error);
    }
  }

  async handleReactionRemove(reaction, user) {
    if (!this.database) return;

    try {
      // Get emoji identifier
      const emoji = reaction.emoji.id || reaction.emoji.name;
      
      // Look up reaction role mapping
      const result = await this.database.query(`
        SELECT role_id, description 
        FROM reaction_role_mappings 
        WHERE guild_id = $1 AND message_id = $2 AND emoji = $3
      `, [reaction.message.guild.id, reaction.message.id, emoji]);

      if (result.rows.length === 0) {
        // No reaction role configured for this emoji
        return;
      }

      const mapping = result.rows[0];
      const role = reaction.message.guild.roles.cache.get(mapping.role_id);

      if (!role) {
        console.error(`Role ${mapping.role_id} not found for reaction role`);
        return;
      }

      // Get guild member
      const member = reaction.message.guild.members.cache.get(user.id);
      if (!member) {
        console.error(`Member ${user.id} not found in guild`);
        return;
      }

      // Check if member has the role
      if (!member.roles.cache.has(role.id)) {
        console.log(`User ${user.tag} doesn't have role ${role.name}`);
        return;
      }

      // Check bot permissions
      if (!reaction.message.guild.members.me.permissions.has('ManageRoles')) {
        console.error('Bot missing Manage Roles permission');
        return;
      }

      // Check role hierarchy
      if (role.position >= reaction.message.guild.members.me.roles.highest.position) {
        console.error(`Cannot remove role ${role.name} - role hierarchy issue`);
        return;
      }

      // Remove the role
      try {
        await member.roles.remove(role, `Reaction role removed from message ${reaction.message.id}`);
        
        console.log(`❌ Removed role ${role.name} from ${user.tag} via reaction role`);

        // Log the action
        await this.logReactionRoleAction(reaction.message.guild, user, role, 'removed', reaction.message.id);

      } catch (error) {
        console.error(`Error removing role ${role.name} from ${user.tag}:`, error);
      }

    } catch (error) {
      console.error('Error in handleReactionRemove:', error);
    }
  }

  async logReactionRoleAction(guild, user, role, action, messageId) {
    try {
      if (!this.database) return;

      // Log to database
      await this.database.query(`
        INSERT INTO reaction_role_logs (
          guild_id, user_id, role_id, message_id, action, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [guild.id, user.id, role.id, messageId, action]);

      // Find a logs channel if it exists
      const logChannel = guild.channels.cache.find(channel => 
        channel.name.includes('log') && channel.isTextBased() && 
        channel.permissionsFor(guild.members.me).has(['SendMessages', 'ViewChannel'])
      );

      if (logChannel) {
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
          .setColor(action === 'added' ? 0x00ff00 : 0xff9900)
          .setTitle(`🎭 Reaction Role ${action === 'added' ? 'Added' : 'Removed'}`)
          .addFields([
            { name: '👤 User', value: `${user.tag} (${user.id})`, inline: true },
            { name: '🎭 Role', value: `${role.name} (${role.id})`, inline: true },
            { name: '📝 Action', value: action === 'added' ? '✅ Added' : '❌ Removed', inline: true },
            { name: '📨 Message ID', value: messageId, inline: true },
            { name: '📍 Channel', value: `<#${guild.channels.cache.find(c => c.messages?.cache?.has(messageId))?.id || 'Unknown'}>`, inline: true }
          ])
          .setTimestamp()
          .setFooter({ text: `Node: ${this.config.nodeId}` });

        await logChannel.send({ embeds: [embed] });
      }

    } catch (error) {
      console.error('Error logging reaction role action:', error);
    }
  }

  // Utility method to get reaction role stats
  async getReactionRoleStats(guildId) {
    if (!this.database) return null;

    try {
      const stats = await this.database.query(`
        SELECT 
          COUNT(DISTINCT rr.message_id) as total_messages,
          COUNT(rrm.id) as total_mappings,
          COUNT(CASE WHEN rrl.action = 'added' THEN 1 END) as roles_assigned,
          COUNT(CASE WHEN rrl.action = 'removed' THEN 1 END) as roles_removed
        FROM reaction_roles rr
        LEFT JOIN reaction_role_mappings rrm ON rr.message_id = rrm.message_id
        LEFT JOIN reaction_role_logs rrl ON rr.message_id = rrl.message_id
        WHERE rr.guild_id = $1
      `, [guildId]);

      return stats.rows[0];
    } catch (error) {
      console.error('Error getting reaction role stats:', error);
      return null;
    }
  }

  // Method to cleanup orphaned reaction roles
  async cleanupOrphanedReactionRoles(guildId) {
    if (!this.database) return;

    try {
      // Remove mappings for deleted roles
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return;

      const result = await this.database.query(`
        DELETE FROM reaction_role_mappings 
        WHERE guild_id = $1 AND role_id NOT IN (
          SELECT UNNEST($2::text[])
        )
        RETURNING *
      `, [guildId, guild.roles.cache.map(r => r.id)]);

      if (result.rows.length > 0) {
        console.log(`🧹 Cleaned up ${result.rows.length} orphaned reaction role mappings in ${guild.name}`);
      }

    } catch (error) {
      console.error('Error cleaning up orphaned reaction roles:', error);
    }
  }
}

module.exports = ReactionRoleEvents;