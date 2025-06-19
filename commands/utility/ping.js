const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong and shows latency info!'),
    
  async execute(interaction, { nodeId, client }) {
    const ping = client.ws.ping;
    const started = Date.now();
    
    await interaction.reply('🏓 Pinging...');
    
    const ended = Date.now();
    const roundtrip = ended - started;
    
    await interaction.editReply({
      content: `🏓 **Pong!**\n` +
               `📡 **WebSocket Ping:** ${ping}ms\n` +
               `⚡ **Roundtrip:** ${roundtrip}ms\n` +
               `🖥️ **Node:** \`${nodeId}\`\n` +
               `⏰ **Timestamp:** ${new Date().toLocaleTimeString()}`
    });
  },
};