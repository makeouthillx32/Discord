// commands/admin/components/reactionrole-create.js
const { EmbedBuilder } = require('discord.js');

async function handleCreate(interaction, database, nodeId) {
  await interaction.deferReply();

  const title = interaction.options.getString('title');
  const description = interaction.options.getString('description');
  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const colorInput = interaction.options.getString('color');

  // Validate channel permissions
  if (!channel.isTextBased()) {
    return await interaction.editReply('❌ Please select a text channel!');
  }

  const botPermissions = channel.permissionsFor(interaction.client.user);
  if (!botPermissions.has(['SendMessages', 'EmbedLinks', 'AddReactions'])) {
    return await interaction.editReply('❌ I need "Send Messages", "Embed Links", and "Add Reactions" permissions in that channel!');
  }

  // Parse color
  let color = 0x0099ff; // Default blue
  if (colorInput) {
    const hexColor = colorInput.replace('#', '');
    if (/^[0-9A-F]{6}$/i.test(hexColor)) {
      color = parseInt(hexColor, 16);
    } else {
      return await interaction.editReply('❌ Invalid color format! Use hex format like #FF0000 or #00FF00');
    }
  }

  // Create embed
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description + '\n\n*React below to get roles!*')
    .setColor(color)
    .setFooter({ text: `Reaction Roles | Node: ${nodeId}` })
    .setTimestamp();

  try {
    // Send the message
    const message = await channel.send({ embeds: [embed] });

    // Store in database if available
    if (database) {
      try {
        await database.query(`
          INSERT INTO reaction_roles (
            guild_id, channel_id, message_id, title, description, color, created_by, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (message_id) DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            color = EXCLUDED.color,
            updated_at = NOW()
        `, [
          interaction.guild.id,
          channel.id,
          message.id,
          title,
          description,
          color,
          interaction.user.id
        ]);
      } catch (dbError) {
        console.error('Database error in create:', dbError);
        // Continue anyway - the message was still created
      }
    }

    // Success response
    const successEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('✅ Reaction Role Message Created!')
      .addFields([
        { name: '📍 Channel', value: channel.toString(), inline: true },
        { name: '🆔 Message ID', value: `\`${message.id}\``, inline: true },
        { name: '🎨 Color', value: colorInput || '#0099FF', inline: true },
        { name: '🔗 Link', value: `[Jump to message](${message.url})`, inline: false },
        { name: '📝 Next Step', value: `Use \`/reactionrole add message_id:${message.id}\` to add reaction roles to this message.`, inline: false }
      ])
      .setFooter({ text: `Created by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });

  } catch (error) {
    console.error('Error creating reaction role message:', error);
    
    let errorMessage = '❌ Failed to create reaction role message!';
    if (error.code === 50013) {
      errorMessage = '❌ I don\'t have permission to send messages in that channel!';
    } else if (error.code === 50001) {
      errorMessage = '❌ I don\'t have access to that channel!';
    }
    
    await interaction.editReply(errorMessage);
  }
}

module.exports = { handleCreate };