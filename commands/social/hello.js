const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hello')
    .setDescription('Says hello to you or someone else!')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('The name of the person to greet')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('private')
        .setDescription('Make the greeting private (only you can see it)')
        .setRequired(false)
    ),
    
  async execute(interaction, { nodeId }) {
    const name = interaction.options.getString('name') || interaction.user.displayName;
    const isPrivate = interaction.options.getBoolean('private') || false;
    
    const greetings = [
      `👋 Hello, **${name}**!`,
      `🎉 Hey there, **${name}**!`,
      `✨ Greetings, **${name}**!`,
      `🌟 What's up, **${name}**!`,
      `🔥 Yo, **${name}**!`
    ];
    
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    
    await interaction.reply({
      content: `${randomGreeting}\n🖥️ *Served by node: \`${nodeId}\`*`,
      ephemeral: isPrivate
    });
  },
};