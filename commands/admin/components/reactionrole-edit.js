// commands/admin/components/reactionrole-edit.js
const { EmbedBuilder } = require('discord.js');
const { updateReactionRoleEmbed, findMessageInGuild, validateColor } = require('./reactionrole-utils');

async function handleEdit(interaction, database, client, nodeId) {
  await interaction.deferReply();

  const messageId = interaction.options.getString('message_id');
  const newTitle = interaction.options.getString('title');
  const newDescription = interaction.options.getString('description');
  const newColor = interaction.options.getString('color');

  // Validate that at least one field is being updated
  if (!newTitle && !newDescription && !newColor) {
    return await interaction.editReply('❌ You must provide at least one field to update (title, description, or color)!');
  }

  // Find the message
  const messageData = await findMessageInGuild(interaction.guild, messageId);
  if (!messageData) {
    return await interaction.editReply('❌ Could not find a message with that ID in this server!');
  }

  const { message: targetMessage, channel: targetChannel } = messageData;

  // Check if this is actually a reaction role message
  if (!database) {
    return await interaction.editReply('❌ Database not available!');
  }

  // Verify this message exists in the reaction_roles table
  try {
    const existingMessage = await database.query(`
      SELECT * FROM reaction_roles 
      WHERE guild_id = $1 AND message_id = $2
    `, [interaction.guild.id, messageId]);

    if (existingMessage.rows.length === 0) {
      return await interaction.editReply('❌ This message is not a reaction role message! Use `/reactionrole create` to create one first.');
    }

    const currentData = existingMessage.rows[0];

    // Validate color if provided
    let colorValue = currentData.color;
    if (newColor) {
      const colorValidation = validateColor(newColor);
      if (!colorValidation.valid) {
        return await interaction.editReply(`❌ ${colorValidation.error}`);
      }
      colorValue = colorValidation.color;
    }

    // Check bot permissions
    if (!targetChannel.permissionsFor(client.user).has(['SendMessages', 'EmbedLinks'])) {
      return await interaction.editReply('❌ I need "Send Messages" and "Embed Links" permissions in that channel to edit the message!');
    }

    // Update database
    let updateQuery = 'UPDATE reaction_roles SET ';
    let updates = [];
    let params = [];
    let paramIndex = 1;

    if (newTitle) {
      updates.push(`title = $${paramIndex++}`);
      params.push(newTitle);
    }
    if (newDescription) {
      updates.push(`description = $${paramIndex++}`);
      params.push(newDescription);
    }
    if (newColor) {
      updates.push(`color = $${paramIndex++}`);
      params.push(colorValue);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      updateQuery += updates.join(', ');
      updateQuery += ` WHERE guild_id = $${paramIndex++} AND message_id = $${paramIndex}`;
      params.push(interaction.guild.id, messageId);

      await database.query(updateQuery, params);
    }

    // Update the message embed with new data
    await updateReactionRoleEmbed(targetMessage, database, interaction.guild.id);

    // Create success response
    const changes = [];
    if (newTitle) changes.push(`**Title:** ${newTitle}`);
    if (newDescription) changes.push(`**Description:** ${newDescription.length > 100 ? newDescription.substring(0, 100) + '...' : newDescription}`);
    if (newColor) changes.push(`**Color:** ${newColor}`);

    const successEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('✅ Reaction Role Message Updated!')
      .addFields([
        { 
          name: '📝 Changes Made', 
          value: changes.join('\n'), 
          inline: false 
        },
        { 
          name: '📍 Message', 
          value: `[Jump to message](${targetMessage.url})`, 
          inline: true 
        },
        { 
          name: '📊 Channel', 
          value: targetChannel.toString(), 
          inline: true 
        }
      ])
      .setFooter({ text: `Updated by ${interaction.user.tag} | Node: ${nodeId}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });

  } catch (dbError) {
    console.error('Database error in edit:', dbError);
    return await interaction.editReply('❌ Database error occurred while updating the reaction role message!');
  }
}

module.exports = { handleEdit };