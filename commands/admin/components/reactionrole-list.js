// commands/admin/components/reactionrole-list.js
const { EmbedBuilder } = require('discord.js');
const { getReactionRoleStats } = require('./reactionrole-utils');

async function handleList(interaction, database, nodeId) {
  await interaction.deferReply();

  const channel = interaction.options.getChannel('channel');

  if (!database) {
    return await interaction.editReply('❌ Database not available!');
  }

  try {
    let query = `
      SELECT DISTINCT rr.message_id, rr.channel_id, rr.title, 
             COUNT(rrm.id) as reaction_count,
             rr.created_at, rr.created_by
      FROM reaction_roles rr
      LEFT JOIN reaction_role_mappings rrm ON rr.message_id = rrm.message_id
      WHERE rr.guild_id = $1
    `;
    
    let params = [interaction.guild.id];
    
    if (channel) {
      query += ` AND rr.channel_id = $2`;
      params.push(channel.id);
    }
    
    query += ` GROUP BY rr.message_id, rr.channel_id, rr.title, rr.created_at, rr.created_by ORDER BY rr.created_at DESC LIMIT 20`;

    const result = await database.query(query, params);

    if (result.rows.length === 0) {
      const noDataEmbed = new EmbedBuilder()
        .setColor(0x999999)
        .setTitle('📝 No Reaction Role Messages Found')
        .setDescription(channel ? 
          `No reaction role messages found in ${channel}.` : 
          'No reaction role messages found in this server!'
        )
        .addFields({
          name: '🚀 Get Started',
          value: 'Use `/reactionrole create` to create your first reaction role message!',
          inline: false
        })
        .addFields({
          name: '💡 Tips',
          value: '• Create engaging titles and descriptions\n' +
                 '• Use clear emoji choices\n' +
                 '• Test your reaction roles after creating them',
          inline: false
        })
        .setFooter({ text: `Node: ${nodeId}` })
        .setTimestamp();

      return await interaction.editReply({ embeds: [noDataEmbed] });
    }

    // Get overall stats
    const stats = await getReactionRoleStats(database, interaction.guild.id);

    const embed = new EmbedBuilder()
      .setTitle(`📝 Reaction Role Messages${channel ? ` in ${channel.name}` : ''}`)
      .setColor(0x0099ff)
      .setFooter({ text: `Node: ${nodeId} | Showing ${result.rows.length} messages` })
      .setTimestamp();

    // Add server statistics if we have them
    if (stats && !channel) {
      embed.setDescription(`**Server Overview:**\n` +
        `📊 ${stats.message_count} reaction role messages\n` +
        `🎭 ${stats.reaction_count} total reaction roles\n` +
        `👥 ${stats.unique_roles} unique roles used\n\n` +
        `**Recent Messages:**`
      );
    }

    // Build the list of reaction role messages
    let messageList = '';
    for (const [index, row] of result.rows.slice(0, 10).entries()) {
      const channelMention = `<#${row.channel_id}>`;
      const creator = row.created_by ? `<@${row.created_by}>` : 'Unknown';
      
      messageList += `**${index + 1}. ${row.title}**\n`;
      messageList += `📍 ${channelMention} | 🆔 \`${row.message_id}\`\n`;
      messageList += `🎭 ${row.reaction_count} reaction roles | 👤 ${creator}\n`;
      messageList += `📅 <t:${Math.floor(new Date(row.created_at).getTime() / 1000)}:R>\n\n`;
    }

    embed.addFields({
      name: channel ? `Messages in ${channel.name}` : 'Recent Reaction Role Messages',
      value: messageList || 'No messages found.',
      inline: false
    });

    if (result.rows.length > 10) {
      embed.addFields({
        name: '📊 Note',
        value: `Showing first 10 of ${result.rows.length} total reaction role messages.`,
        inline: false
      });
    }

    // Add detailed breakdown for first few messages
    if (result.rows.length > 0 && result.rows.length <= 3) {
      for (const row of result.rows) {
        try {
          const detailQuery = `
            SELECT emoji, emoji_name, emoji_id, role_id, description
            FROM reaction_role_mappings 
            WHERE guild_id = $1 AND message_id = $2 
            ORDER BY created_at ASC
          `;
          const details = await database.query(detailQuery, [interaction.guild.id, row.message_id]);
          
          if (details.rows.length > 0) {
            let roleDetails = '';
            for (const mapping of details.rows.slice(0, 5)) {
              const role = interaction.guild.roles.cache.get(mapping.role_id);
              const roleName = role ? role.name : 'Unknown Role';
              
              // Format emoji
              let emojiDisplay;
              if (mapping.emoji_id) {
                emojiDisplay = `<${mapping.emoji_name ? ':' + mapping.emoji_name + ':' : 'custom:'}${mapping.emoji_id}>`;
              } else {
                emojiDisplay = mapping.emoji;
              }
              
              roleDetails += `${emojiDisplay} → ${roleName}\n`;
            }
            
            if (details.rows.length > 5) {
              roleDetails += `*...and ${details.rows.length - 5} more*`;
            }
            
            embed.addFields({
              name: `🎭 Roles in "${row.title}"`,
              value: roleDetails,
              inline: true
            });
          }
        } catch (detailError) {
          console.error('Error getting reaction role details:', detailError);
        }
      }
    }

    // Add quick actions
    embed.addFields({
      name: '⚡ Quick Actions',
      value: '• `/reactionrole add message_id:ID` - Add new reaction role\n' +
             '• `/reactionrole edit message_id:ID` - Edit message\n' +
             '• `/reactionrole remove message_id:ID emoji:🎮` - Remove reaction\n' +
             '• `/reactionrole emojis` - View available emojis',
      inline: false
    });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Database error in list:', error);
    await interaction.editReply({
      content: '❌ Error retrieving reaction role list from database!\n' +
               'This might be a temporary issue. Please try again in a moment.',
      ephemeral: true
    });
  }
}

module.exports = { handleList };