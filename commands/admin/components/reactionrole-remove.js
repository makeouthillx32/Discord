// commands/admin/components/reactionrole-remove.js
const { EmbedBuilder } = require('discord.js');
const { updateReactionRoleEmbed, parseEmoji, findMessageInGuild } = require('./reactionrole-utils');

async function handleRemove(interaction, database, client, nodeId) {
  await interaction.deferReply();

  const messageId = interaction.options.getString('message_id');
  const emojiInput = interaction.options.getString('emoji');

  // Parse emoji
  const emojiData = parseEmoji(emojiInput, interaction.guild);
  if (!emojiData.valid) {
    return await interaction.editReply(`❌ ${emojiData.error}`);
  }

  // Find the message
  const messageData = await findMessageInGuild(interaction.guild, messageId);
  if (!messageData) {
    return await interaction.editReply('❌ Could not find a message with that ID in this server!');
  }

  const { message: targetMessage, channel: targetChannel } = messageData;

  // Check bot permissions
  if (!targetChannel.permissionsFor(client.user).has(['ManageMessages', 'ReadMessageHistory'])) {
    return await interaction.editReply('❌ I need "Manage Messages" and "Read Message History" permissions in that channel to remove reactions!');
  }

  // Remove from database first
  if (database) {
    try {
      const result = await database.query(`
        DELETE FROM reaction_role_mappings 
        WHERE guild_id = $1 AND message_id = $2 AND emoji = $3
        RETURNING role_id, description
      `, [interaction.guild.id, messageId, emojiData.storageValue]);

      if (result.rows.length === 0) {
        return await interaction.editReply('❌ No reaction role found with that message ID and emoji!');
      }

      const removedRoleId = result.rows[0].role_id;
      const removedRole = interaction.guild.roles.cache.get(removedRoleId);
      
      // Remove bot's reaction
      try {
        const reaction = targetMessage.reactions.cache.get(emojiData.reactionId);
        if (reaction) {
          await reaction.users.remove(client.user);
        }
      } catch (reactionError) {
        console.error('Error removing reaction:', reactionError);
        // Don't fail the whole operation if we can't remove the reaction
      }

      // Update embed to reflect the removal
      await updateReactionRoleEmbed(targetMessage, database, interaction.guild.id);

      // Create success response
      const successEmbed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle('✅ Reaction Role Removed Successfully!')
        .addFields([
          { name: '🎭 Emoji', value: emojiInput, inline: true },
          { name: '🎭 Role', value: removedRole ? removedRole.toString() : `Unknown Role (ID: ${removedRoleId})`, inline: true },
          { name: '📍 Message', value: `[Jump to message](${targetMessage.url})`, inline: false },
          { name: '📊 Channel', value: targetChannel.toString(), inline: true },
          { name: '📝 Description', value: result.rows[0].description || 'No description', inline: true }
        ])
        .setFooter({ text: `Removed by ${interaction.user.tag} | Node: ${nodeId}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed] });

    } catch (dbError) {
      console.error('Database error in remove:', dbError);
      return await interaction.editReply('❌ Database error occurred while removing reaction role!');
    }
  } else {
    return await interaction.editReply('❌ Database not available!');
  }
}

module.exports = { handleRemove };