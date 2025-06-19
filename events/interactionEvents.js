const { Events } = require('discord.js');

class InteractionEvents {
  constructor(eventHandler) {
    this.client = eventHandler.client;
    this.config = eventHandler.config;
    this.commandLoader = eventHandler.commandLoader;
    this.eventHandler = eventHandler;
  }

  setup() {
    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.handleSlashCommand(interaction);
        } else if (interaction.isButton()) {
          await this.handleButtonInteraction(interaction);
        } else if (interaction.isSelectMenu()) {
          await this.handleSelectMenuInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
          await this.handleModalSubmit(interaction);
        }
      } catch (error) {
        console.error('Error handling interaction:', error);
      }
    });
  }

  async handleSlashCommand(interaction) {
    const services = this.eventHandler.getServices();
    const success = await this.commandLoader.executeCommand(interaction, services);
    
    // FIX: Check for guild AND pointsSystem before awarding points
    if (success && interaction.guild && this.eventHandler.pointsSystem) {
      await this.eventHandler.safeAwardPoints(
        interaction.user.id,
        interaction.guild.id,
        this.config.points.COMMAND_USED,
        'Slash Command',
        'command',
        { command: interaction.commandName }
      );
    }
  }

  async handleButtonInteraction(interaction) {
    console.log(`🔘 Button interaction: ${interaction.customId}`);
    
    if (interaction.customId.startsWith('points_')) {
      // Handle points-related button interactions
      await this.handlePointsButton(interaction);
    }
  }

  async handleSelectMenuInteraction(interaction) {
    console.log(`📋 Select menu interaction: ${interaction.customId}`);
  }

  async handleModalSubmit(interaction) {
    console.log(`📝 Modal submission: ${interaction.customId}`);
    
    if (interaction.customId === 'feedback_modal') {
      const feedback = interaction.fields.getTextInputValue('feedback_input');
      
      if (this.eventHandler.database?.storeFeedback && interaction.guild) {
        await this.eventHandler.database.storeFeedback(interaction.user.id, interaction.guild.id, feedback);
      }
      
      await interaction.reply({
        content: '✅ Thank you for your feedback!',
        ephemeral: true
      });
    }
  }

  async handlePointsButton(interaction) {
    if (!interaction.guild) return;
    
    try {
      switch (interaction.customId) {
        case 'points_leaderboard':
          if (this.eventHandler.pointsSystem?.getLeaderboard) {
            const leaderboard = await this.eventHandler.pointsSystem.getLeaderboard(interaction.guild.id, 10);
            const embed = this.createLeaderboardEmbed(leaderboard, interaction.guild.name);
            await interaction.reply({ embeds: [embed], ephemeral: true });
          }
          break;
          
        case 'points_profile':
          if (this.eventHandler.pointsSystem?.getUserStats) {
            const userStats = await this.eventHandler.pointsSystem.getUserStats(interaction.user.id, interaction.guild.id);
            const embed = this.createProfileEmbed(interaction.user, userStats);
            await interaction.reply({ embeds: [embed], ephemeral: true });
          }
          break;
          
        default:
          await interaction.reply({ content: 'Unknown button interaction!', ephemeral: true });
      }
    } catch (error) {
      console.error('Error handling points button:', error);
      await interaction.reply({ content: 'An error occurred!', ephemeral: true });
    }
  }

  createLeaderboardEmbed(leaderboard, guildName) {
    const { EmbedBuilder } = require('discord.js');
    
    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${guildName} Leaderboard`)
      .setColor(0xFFD700)
      .setTimestamp()
      .setFooter({ text: `Node: ${this.config.nodeId}` });
    
    if (leaderboard.length === 0) {
      embed.setDescription('No users found in leaderboard.');
      return embed;
    }
    
    const leaderboardText = leaderboard.map((user, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      return `${medal} **${user.username || 'Unknown'}** - ${user.total_points} points (Level ${user.level})`;
    }).join('\n');
    
    embed.setDescription(leaderboardText);
    return embed;
  }

  createProfileEmbed(user, stats) {
    const { EmbedBuilder } = require('discord.js');
    
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${user.displayName || user.username}'s Profile`)
      .setColor(0x0099FF)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields([
        { name: '🎯 Total Points', value: stats.total_points.toString(), inline: true },
        { name: '📈 Level', value: stats.level.toString(), inline: true },
        { name: '🏆 Rank', value: `#${stats.rank}`, inline: true }
      ])
      .setTimestamp()
      .setFooter({ text: `Node: ${this.config.nodeId}` });
    
    return embed;
  }
}

module.exports = InteractionEvents;