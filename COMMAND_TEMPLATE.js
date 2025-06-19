const { SlashCommandBuilder } = require('discord.js');

// 🔥 COPY THIS TEMPLATE TO CREATE NEW COMMANDS!
// 1. Copy this file to commands/[category]/[name].js
// 2. Modify the data and execute function
// 3. Rebuild with: docker-compose up --build
// 4. Or hot reload with: curl -X POST http://localhost:8080/commands/reload

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mycommand')  // ⚡ CHANGE THIS
    .setDescription('Description of my command')  // ⚡ CHANGE THIS
    .addStringOption(option =>  // 📝 Add options as needed
      option.setName('input')
        .setDescription('Some input parameter')
        .setRequired(false)
    ),
    
  async execute(interaction, { nodeId, redis, client }) {
    // 🚀 YOUR COMMAND LOGIC GOES HERE
    
    const input = interaction.options.getString('input') || 'default';
    
    await interaction.reply({
      content: `✨ **My Command Response**\n` +
               `📝 **Input:** ${input}\n` +
               `🖥️ **Node:** \`${nodeId}\`\n` +
               `⏰ **Time:** ${new Date().toLocaleTimeString()}`
    });
    
    // 💾 Optional: Store data in Redis
    // await redis.set(`mykey:${interaction.user.id}`, 'some value');
    
    // 📊 Optional: Get bot stats
    // const guilds = client.guilds.cache.size;
    
    // 🔄 Optional: Defer reply for long operations
    // await interaction.deferReply();
    // // ... do long operation ...
    // await interaction.editReply('Done!');
  },
};

/* 📚 AVAILABLE PARAMETERS:
 * 
 * interaction - Discord interaction object
 * nodeId - Current bot node identifier
 * redis - Redis client for data storage
 * client - Discord.js client instance
 * 
 * 🛠️ COMMON PATTERNS:
 * 
 * // Get user input
 * const text = interaction.options.getString('text');
 * const number = interaction.options.getInteger('number');
 * const user = interaction.options.getUser('user');
 * const boolean = interaction.options.getBoolean('option');
 * 
 * // Reply types
 * await interaction.reply('Simple text');
 * await interaction.reply({ content: 'Text', ephemeral: true }); // Private
 * await interaction.reply({ embeds: [embed] }); // Rich embed
 * 
 * // For long operations
 * await interaction.deferReply();
 * // ... processing ...
 * await interaction.editReply('Result');
 * 
 * // Store data in Redis
 * await redis.set('key', 'value');
 * await redis.setex('key', 3600, 'value'); // With expiration
 * const data = await redis.get('key');
 * 
 * // Access Discord data
 * const guildCount = client.guilds.cache.size;
 * const userCount = interaction.guild.memberCount;
 * const channelName = interaction.channel.name;
 */