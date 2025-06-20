// commands/admin/components/reactionrole-emojis.js
const { EmbedBuilder } = require('discord.js');

async function handleEmojiList(interaction, nodeId) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  
  try {
    // Fetch the latest emoji data from Discord
    await guild.emojis.fetch();
    const customEmojis = guild.emojis.cache;
    
    // Calculate emoji slots based on server boost level
    const boostLevel = guild.premiumTier;
    const maxEmojis = getMaxEmojis(boostLevel);
    
    // Create embed with all available emojis
    const embed = new EmbedBuilder()
      .setTitle(`🎭 Available Emojis for ${guild.name}`)
      .setDescription('These emojis can be used in reaction roles:')
      .setColor(0x00b0f4)
      .setFooter({ 
        text: `Node: ${nodeId} | Custom Emojis: ${customEmojis.size}/${maxEmojis} | Boost Level: ${boostLevel}` 
      })
      .setTimestamp();

    if (customEmojis.size === 0) {
      embed.addFields({
        name: '❌ No Custom Emojis',
        value: 'This server has no custom emojis. You can still use standard Unicode emojis like 👍 ❤️ 🎮 🎵 🎨',
        inline: false
      });
    } else {
      // Separate static and animated emojis
      const staticEmojis = customEmojis.filter(e => !e.animated && e.available);
      const animatedEmojis = customEmojis.filter(e => e.animated && e.available);
      const unavailableEmojis = customEmojis.filter(e => !e.available);
      
      // Add static emojis
      if (staticEmojis.size > 0) {
        await addEmojiFields(embed, staticEmojis, '🖼️ Static Emojis');
      }
      
      // Add animated emojis
      if (animatedEmojis.size > 0) {
        await addEmojiFields(embed, animatedEmojis, '🎬 Animated Emojis');
      }
      
      // Show unavailable emojis count
      if (unavailableEmojis.size > 0) {
        embed.addFields({
          name: '⚠️ Unavailable Emojis',
          value: `${unavailableEmojis.size} emojis are currently unavailable (server boost issues or deleted)`,
          inline: false
        });
      }

      // Show server emoji slots info
      const emojiSlotInfo = getEmojiSlotInfo(guild, customEmojis.size, maxEmojis);
      if (emojiSlotInfo) {
        embed.addFields({
          name: '📊 Emoji Slots',
          value: emojiSlotInfo,
          inline: true
        });
      }
    }

    // Add common Unicode emojis section
    const commonEmojis = [
      '👍', '❤️', '😀', '🎉', '✅', '❌', '🎮', '🎵', '🎨', '📚', 
      '💻', '🏆', '⚡', '🔥', '💎', '🌟', '🎯', '🚀', '🎪', '🎭',
      '💯', '🔔', '⭐', '🌈', '🎁', '🎲', '🎸', '🎤', '🎧', '📱',
      '🏅', '🎊', '🎈', '🎀', '🎃', '🎄', '🎆', '🎇', '✨', '🌟'
    ];
    
    embed.addFields({
      name: '🌍 Common Unicode Emojis',
      value: commonEmojis.join(' ') + '\n*...and thousands more standard emojis available*',
      inline: false
    });

    // Add usage examples
    embed.addFields({
      name: '📝 Usage Examples',
      value: '**For Unicode emojis:**\n```/reactionrole add message_id:123456 emoji:🎮 role:@Gamer```\n' +
             '**For custom emojis:**\n```/reactionrole add message_id:123456 emoji:<:custom:123456> role:@Custom```\n' +
             '**For animated emojis:**\n```/reactionrole add message_id:123456 emoji:<a:animated:123456> role:@Animated```',
      inline: false
    });

    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('Error fetching emojis:', error);
    await interaction.editReply({
      content: '❌ Error fetching server emojis! Please try again later.',
      ephemeral: true
    });
  }
}

// Helper function to add emoji fields with proper chunking
async function addEmojiFields(embed, emojis, title) {
  const emojiArray = Array.from(emojis.values());
  const emojiList = emojiArray.map(e => `${e.toString()} \`${e.name}\``);
  
  // Split into chunks that fit Discord's 1024 character limit per field
  let currentText = '';
  let fieldCount = 1;
  
  for (const emojiText of emojiList) {
    if ((currentText + emojiText + '\n').length > 1000) {
      // Add current field
      embed.addFields({
        name: `${title} ${fieldCount > 1 ? `(Part ${fieldCount})` : ''}`,
        value: currentText || 'No emojis',
        inline: true
      });
      currentText = emojiText + '\n';
      fieldCount++;
    } else {
      currentText += emojiText + '\n';
    }
  }
  
  // Add final field
  if (currentText) {
    embed.addFields({
      name: `${title} ${fieldCount > 1 ? `(Part ${fieldCount})` : ''} - ${emojis.size} total`,
      value: currentText,
      inline: true
    });
  }
}

// Helper function to get max emojis based on boost level
function getMaxEmojis(boostLevel) {
  switch (boostLevel) {
    case 0: return 50;   // No boost
    case 1: return 100;  // Level 1 boost
    case 2: return 150;  // Level 2 boost
    case 3: return 250;  // Level 3 boost
    default: return 50;
  }
}

// Helper function to get emoji slot information
function getEmojiSlotInfo(guild, currentEmojis, maxEmojis) {
  const remaining = maxEmojis - currentEmojis;
  const percentage = Math.round((currentEmojis / maxEmojis) * 100);
  
  let statusEmoji = '🟢';
  if (percentage >= 90) statusEmoji = '🔴';
  else if (percentage >= 70) statusEmoji = '🟡';
  
  let boostInfo = '';
  if (guild.premiumTier < 3) {
    const nextTierEmojis = getMaxEmojis(guild.premiumTier + 1);
    boostInfo = `\n*Boost to level ${guild.premiumTier + 1} for ${nextTierEmojis} slots*`;
  }
  
  return `${statusEmoji} ${currentEmojis}/${maxEmojis} used (${percentage}%)\n${remaining} slots remaining${boostInfo}`;
}

module.exports = { handleEmojiList };