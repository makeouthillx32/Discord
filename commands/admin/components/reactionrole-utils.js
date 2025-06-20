// commands/admin/components/reactionrole-utils.js
const { EmbedBuilder } = require('discord.js');

/**
 * Parse and validate emoji input
 * @param {string} emojiInput - Raw emoji input from user
 * @param {Guild} guild - Discord guild object
 * @returns {Object} Parsed emoji data
 */
function parseEmoji(emojiInput, guild) {
  // Check if it's a custom emoji <:name:id> or <a:name:id>
  const customEmojiMatch = emojiInput.match(/<(a?):([^:]+):(\d+)>/);
  
  if (customEmojiMatch) {
    const isAnimated = customEmojiMatch[1] === 'a';
    const emojiName = customEmojiMatch[2];
    const emojiId = customEmojiMatch[3];
    
    // Verify the custom emoji exists and is available
    const serverEmoji = guild.emojis.cache.get(emojiId);
    if (!serverEmoji) {
      return {
        valid: false,
        error: 'That custom emoji is not from this server! Use `/reactionrole emojis` to see available emojis.'
      };
    }
    if (!serverEmoji.available) {
      return {
        valid: false,
        error: 'That emoji is not available for use!'
      };
    }
    
    return {
      valid: true,
      isCustom: true,
      name: emojiName,
      id: emojiId,
      reactionId: emojiId, // For adding reactions to messages
      storageValue: emojiId, // For storing in database
      displayValue: emojiInput, // For displaying to users
      isAnimated
    };
  } else {
    // Unicode emoji - basic validation
    if (emojiInput.length > 8) {
      return {
        valid: false,
        error: 'Invalid emoji! Please use a valid Unicode emoji or server custom emoji.'
      };
    }
    
    return {
      valid: true,
      isCustom: false,
      name: emojiInput,
      id: null,
      reactionId: emojiInput,
      storageValue: emojiInput,
      displayValue: emojiInput,
      isAnimated: false
    };
  }
}

/**
 * Update reaction role embed with current reaction roles
 * @param {Message} message - Discord message object
 * @param {DatabaseService} database - Database service
 * @param {string} guildId - Guild ID
 */
async function updateReactionRoleEmbed(message, database, guildId) {
  if (!database || !message.embeds[0]) return;

  try {
    // Get updated data from database
    const rrResult = await database.query(`
      SELECT title, description, color FROM reaction_roles 
      WHERE guild_id = $1 AND message_id = $2
    `, [guildId, message.id]);

    const mappingsResult = await database.query(`
      SELECT emoji, emoji_name, emoji_id, role_id, description 
      FROM reaction_role_mappings 
      WHERE guild_id = $1 AND message_id = $2 
      ORDER BY created_at ASC
    `, [guildId, message.id]);

    if (rrResult.rows.length === 0) return;

    const rrData = rrResult.rows[0];
    const mappings = mappingsResult.rows;

    // Build new embed
    const embed = new EmbedBuilder()
      .setTitle(rrData.title)
      .setDescription(rrData.description + '\n\n*React below to get roles!*')
      .setColor(rrData.color)
      .setFooter({ text: 'Reaction Roles' })
      .setTimestamp();

    // Add reaction role information
    if (mappings.length > 0) {
      let reactionInfo = '';
      for (const mapping of mappings) {
        // Format emoji display
        let emojiDisplay;
        if (mapping.emoji_id) {
          // Custom emoji
          const isAnimated = mapping.emoji_name && message.guild.emojis.cache.get(mapping.emoji_id)?.animated;
          emojiDisplay = `<${isAnimated ? 'a' : ''}:${mapping.emoji_name}:${mapping.emoji_id}>`;
        } else {
          // Unicode emoji
          emojiDisplay = mapping.emoji;
        }
        
        reactionInfo += `${emojiDisplay} → <@&${mapping.role_id}>\n`;
        
        // Add description if it's not the default
        if (mapping.description && !mapping.description.startsWith('Get the') && mapping.description !== `Get the role`) {
          reactionInfo += `   *${mapping.description}*\n`;
        }
      }
      
      embed.addFields({
        name: '🎭 Available Roles',
        value: reactionInfo,
        inline: false
      });
    } else {
      embed.addFields({
        name: '🎭 Available Roles',
        value: '*No reaction roles configured yet.*\nUse `/reactionrole add` to add some!',
        inline: false
      });
    }

    await message.edit({ embeds: [embed] });
  } catch (error) {
    console.error('Error updating reaction role embed:', error);
  }
}

/**
 * Find a message by ID across all channels in a guild
 * @param {Guild} guild - Discord guild object
 * @param {string} messageId - Message ID to find
 * @returns {Object} Object containing message and channel, or null if not found
 */
async function findMessageInGuild(guild, messageId) {
  for (const [channelId, channel] of guild.channels.cache) {
    if (channel.isTextBased()) {
      try {
        const message = await channel.messages.fetch(messageId);
        return { message, channel };
      } catch (error) {
        // Message not in this channel, continue searching
        continue;
      }
    }
  }
  return null;
}

/**
 * Validate color input and convert to integer
 * @param {string} colorInput - Hex color input
 * @returns {Object} Validation result with color value
 */
function validateColor(colorInput) {
  if (!colorInput) {
    return { valid: true, color: 0x0099ff }; // Default blue
  }
  
  const hexColor = colorInput.replace('#', '');
  if (!/^[0-9A-F]{6}$/i.test(hexColor)) {
    return {
      valid: false,
      error: 'Invalid color format! Use hex format like #FF0000 or #00FF00'
    };
  }
  
  return {
    valid: true,
    color: parseInt(hexColor, 16)
  };
}

/**
 * Check if user has permission to manage reaction roles
 * @param {GuildMember} member - Guild member object
 * @param {Role} role - Role to check against
 * @returns {Object} Permission check result
 */
function checkRolePermissions(member, role) {
  // Check if user can manage the role
  if (role.position >= member.roles.highest.position && member.id !== member.guild.ownerId) {
    return {
      canManage: false,
      error: 'You cannot manage this role! The role is higher than or equal to your highest role.'
    };
  }
  
  // Check if bot can manage the role
  const botMember = member.guild.members.me;
  if (role.position >= botMember.roles.highest.position) {
    return {
      canManage: false,
      error: 'I cannot assign this role! The role is higher than or equal to my highest role.'
    };
  }
  
  if (role.managed) {
    return {
      canManage: false,
      error: 'I cannot assign this role! It is managed by an integration (bot role).'
    };
  }
  
  if (role.id === member.guild.roles.everyone.id) {
    return {
      canManage: false,
      error: 'I cannot assign the @everyone role!'
    };
  }
  
  return { canManage: true };
}

/**
 * Format emoji for display in embeds
 * @param {Object} emojiData - Parsed emoji data
 * @param {Guild} guild - Discord guild object
 * @returns {string} Formatted emoji string
 */
function formatEmojiDisplay(emojiData, guild) {
  if (emojiData.isCustom) {
    const serverEmoji = guild.emojis.cache.get(emojiData.id);
    if (serverEmoji) {
      return serverEmoji.toString();
    } else {
      // Fallback for custom emojis not in cache
      return `<${emojiData.isAnimated ? 'a' : ''}:${emojiData.name}:${emojiData.id}>`;
    }
  } else {
    return emojiData.displayValue;
  }
}

/**
 * Get reaction role statistics for a guild
 * @param {DatabaseService} database - Database service
 * @param {string} guildId - Guild ID
 * @returns {Object} Statistics object
 */
async function getReactionRoleStats(database, guildId) {
  if (!database) return null;
  
  try {
    const result = await database.query(`
      SELECT 
        COUNT(DISTINCT rr.message_id) as message_count,
        COUNT(rrm.id) as reaction_count,
        COUNT(DISTINCT rrm.role_id) as unique_roles
      FROM reaction_roles rr
      LEFT JOIN reaction_role_mappings rrm ON rr.message_id = rrm.message_id
      WHERE rr.guild_id = $1
    `, [guildId]);
    
    return result.rows[0] || { message_count: 0, reaction_count: 0, unique_roles: 0 };
  } catch (error) {
    console.error('Error getting reaction role stats:', error);
    return null;
  }
}

module.exports = {
  parseEmoji,
  updateReactionRoleEmbed,
  findMessageInGuild,
  validateColor,
  checkRolePermissions,
  formatEmojiDisplay,
  getReactionRoleStats
};