const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scale')
    .setDescription('Test the scaling capabilities of the bot cluster')
    .addIntegerOption(option =>
      option.setName('number')
        .setDescription('A number to process (1-10000)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10000)
    )
    .addBooleanOption(option =>
      option.setName('heavy')
        .setDescription('Enable heavy processing mode')
        .setRequired(false)
    ),
    
  async execute(interaction, { nodeId, redis }) {
    const number = interaction.options.getInteger('number');
    const heavyMode = interaction.options.getBoolean('heavy') || false;
    
    await interaction.deferReply();
    
    // Simulate processing load
    const startTime = Date.now();
    const result = await processScaleTask(number, heavyMode);
    const processingTime = Date.now() - startTime;
    
    // Store result in Redis for other nodes to see
    await redis.setex(`task:${interaction.id}`, 300, JSON.stringify({
      nodeId: nodeId,
      input: number,
      result: result,
      processingTime: processingTime,
      heavyMode: heavyMode,
      timestamp: Date.now()
    }));

    // Get cluster load info
    const nodeKeys = await redis.keys('bot:node:*');
    const nodeCount = nodeKeys.length;

    const responseEmbed = {
      color: 0x00ff00,
      title: '⚡ Scaling Test Results',
      fields: [
        { 
          name: '📊 Processing Info', 
          value: `**Input:** ${number}\n**Result:** ${result}\n**Mode:** ${heavyMode ? 'Heavy 🔥' : 'Normal ⚡'}`, 
          inline: true 
        },
        { 
          name: '⏱️ Performance', 
          value: `**Time:** ${processingTime}ms\n**Node:** \`${nodeId}\`\n**Cluster:** ${nodeCount} nodes`, 
          inline: true 
        },
        { 
          name: '🎯 Load Distribution', 
          value: `This task was processed by **${nodeId}**\nLoad is automatically distributed across ${nodeCount} active nodes`, 
          inline: false 
        }
      ],
      footer: { text: `Task ID: ${interaction.id}` },
      timestamp: new Date().toISOString()
    };

    await interaction.editReply({ embeds: [responseEmbed] });
  },
};

// Simulate processing task
async function processScaleTask(input, heavyMode = false) {
  let result = input;
  const iterations = heavyMode ? 500000 : 100000;
  
  for (let i = 0; i < iterations; i++) {
    result = Math.sqrt(result + i) * Math.sin(i / 1000);
  }
  
  return Math.round(result * 1000) / 1000;
}