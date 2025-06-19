const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Flip a coin and see if you win!')
    .addStringOption(option =>
      option.setName('guess')
        .setDescription('Guess heads or tails')
        .setRequired(true)
        .addChoices(
          { name: '🪙 Heads', value: 'heads' },
          { name: '🥇 Tails', value: 'tails' }
        )
    ),
    
  async execute(interaction, { nodeId }) {
    const guess = interaction.options.getString('guess');
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = guess === result;
    
    const resultEmoji = result === 'heads' ? '🪙' : '🥇';
    const statusEmoji = won ? '🎉' : '😢';
    
    await interaction.reply({
      content: `${statusEmoji} **Coin Flip Result**\n\n` +
               `**Your Guess:** ${guess === 'heads' ? '🪙' : '🥇'} ${guess}\n` +
               `**Result:** ${resultEmoji} ${result}\n\n` +
               `${won ? '🎉 **You WIN!**' : '😢 **You LOSE!**'}\n\n` +
               `*Flipped on node: \`${nodeId}\`*`
    });
  },
};