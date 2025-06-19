const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Shows detailed bot status and cluster information'),
    
  async execute(interaction, { nodeId, redis, client, database }) {
    try {
      await interaction.deferReply();
      
      const uptime = process.uptime();
      const memUsage = process.memoryUsage();
      
      // Get all active nodes from Redis safely
      let activeNodes = [];
      try {
        if (redis && redis.client) {
          const nodeKeys = await redis.client.keys('bot:node:*');
          for (const key of nodeKeys) {
            const nodeData = await redis.get(key);
            if (nodeData) {
              try {
                activeNodes.push(JSON.parse(nodeData));
              } catch (parseError) {
                console.error('Error parsing node data:', parseError);
              }
            }
          }
        }
      } catch (redisError) {
        console.error('Redis error in status command:', redisError);
      }

      // Calculate cluster stats
      const totalGuilds = activeNodes.reduce((sum, node) => sum + (node.guilds || 0), 0) || client.guilds.cache.size;
      const avgPing = activeNodes.length > 0 
        ? Math.round(activeNodes.reduce((sum, node) => sum + (node.ping || 0), 0) / activeNodes.length)
        : client.ws.ping;

      // Get database stats safely
      let dbStats = null;
      try {
        if (database) {
          const dbSizeQuery = `
            SELECT 
              pg_size_pretty(pg_database_size(current_database())) as database_size,
              (SELECT COUNT(*) FROM user_guild_stats) as user_count,
              (SELECT COUNT(*) FROM points_transactions) as transaction_count
          `;
          const result = await database.query(dbSizeQuery);
          dbStats = result.rows[0];
        }
      } catch (dbError) {
        console.error('Database error in status command:', dbError);
      }

      const statusEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🤖 Discord Bot Cluster Status')
        .setDescription(`**Current Node:** \`${nodeId}\``)
        .addFields([
          { 
            name: '⏱️ Current Node Stats', 
            value: `**Uptime:** ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s\n` +
                   `**Ping:** ${client.ws.ping}ms\n` +
                   `**Memory:** ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB\n` +
                   `**Commands:** ${client.commands.size}`,
            inline: true 
          },
          { 
            name: '🌐 Cluster Overview', 
            value: `**Active Nodes:** ${activeNodes.length || 1}\n` +
                   `**Total Guilds:** ${totalGuilds}\n` +
                   `**Total Users:** ${client.users.cache.size}\n` +
                   `**Avg Ping:** ${avgPing}ms`,
            inline: true 
          },
          {
            name: '💻 System Info',
            value: `**Node.js:** ${process.version}\n` +
                   `**Platform:** ${process.platform}\n` +
                   `**Architecture:** ${process.arch}\n` +
                   `**PID:** ${process.pid}`,
            inline: true
          }
        ]);

      // Add cluster node details if available
      if (activeNodes.length > 0) {
        const nodeList = activeNodes.slice(0, 5).map(node => 
          `\`${node.id || 'unknown'}\`: ${node.ping || client.ws.ping}ms | ${node.guilds || 0} guilds | ${node.status || 'active'}`
        ).join('\n');
        
        statusEmbed.addFields({
          name: '📊 Active Nodes',
          value: nodeList + (activeNodes.length > 5 ? `\n... and ${activeNodes.length - 5} more` : ''),
          inline: false
        });
      }

      // Add database information if available
      if (dbStats) {
        statusEmbed.addFields({
          name: '🗄️ Database Stats',
          value: `**Size:** ${dbStats.database_size || 'Unknown'}\n` +
                 `**Users:** ${dbStats.user_count || 0}\n` +
                 `**Transactions:** ${dbStats.transaction_count || 0}`,
          inline: true
        });
      }

      // Add Redis information
      if (redis && redis.isConnected()) {
        statusEmbed.addFields({
          name: '🔴 Redis Status',
          value: `**Status:** Connected ✅\n` +
                 `**Active Sessions:** ${activeNodes.length}\n` +
                 `**Cache:** Operational`,
          inline: true
        });
      }

      statusEmbed.setFooter({ 
        text: `Requested by ${interaction.user.username} | Modular Discord Bot System`, 
        iconURL: interaction.user.displayAvatarURL() 
      })
      .setTimestamp();

      await interaction.editReply({ embeds: [statusEmbed] });

    } catch (error) {
      console.error('Error in status command:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Status Command Error')
        .setDescription('There was an error retrieving the bot status.')
        .addFields([
          { name: 'Error', value: `\`\`\`${error.message}\`\`\``, inline: false },
          { name: 'Node', value: `\`${nodeId}\``, inline: true },
          { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        ])
        .setTimestamp();
      
      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
};