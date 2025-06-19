const { SlashCommandBuilder, EmbedBuilder, REST, Routes, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

class CommandLoader {
  constructor(config) {
    this.config = config;
    this.commands = [];
    this.loadedCommands = new Collection();
  }

  // 🚀 MAIN COMMAND LOADING FUNCTION
  async loadCommands(client) {
    console.log('🔄 Loading commands...');
    
    const commandsPath = path.join(__dirname, '..', 'commands');
    
    // Check if commands directory exists
    if (!fs.existsSync(commandsPath)) {
      console.log('⚠️  Commands directory not found - using fallback commands');
      return this.loadFallbackCommands(client);
    }

    // Clear existing commands
    client.commands.clear();
    this.commands.length = 0;
    this.loadedCommands.clear();

    let loadedCount = 0;

    try {
      // Get all command folders
      const commandFolders = fs.readdirSync(commandsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        
        try {
          const commandFiles = fs.readdirSync(folderPath)
            .filter(file => file.endsWith('.js'));

          for (const file of commandFiles) {
            const filePath = path.join(folderPath, file);
            
            try {
              // Clear require cache for hot reloading
              delete require.cache[require.resolve(filePath)];
              
              const command = require(filePath);
              const loadResult = this.validateAndLoadCommand(command, folder, file, client);
              
              if (loadResult.success) {
                loadedCount++;
                console.log(`✅ Loaded ${loadResult.type} command: ${loadResult.name} from ${folder}/${file}`);
              } else {
                console.log(`⚠️  Skipping ${folder}/${file} - ${loadResult.reason}`);
              }
              
            } catch (error) {
              console.error(`❌ Error loading command ${folder}/${file}:`, error.message);
            }
          }
        } catch (error) {
          console.log(`⚠️  Could not read folder ${folder} - skipping`);
        }
      }
      
    } catch (error) {
      console.log('⚠️  Could not read commands directory - using fallback commands');
      return this.loadFallbackCommands(client);
    }

    console.log(`🎯 Loaded ${loadedCount} commands total`);
    return loadedCount;
  }

  // 🔍 COMMAND VALIDATION AND LOADING
  validateAndLoadCommand(command, folder, file, client) {
    // Validate slash command structure
    if ('data' in command && 'execute' in command) {
      if (command.data && typeof command.data.toJSON === 'function') {
        client.commands.set(command.data.name, command);
        this.commands.push(command.data.toJSON());
        this.loadedCommands.set(command.data.name, {
          ...command,
          category: folder,
          file: file,
          type: 'slash'
        });
        
        return {
          success: true,
          type: 'slash',
          name: command.data.name
        };
      }
    }
    
    // Validate prefix command structure
    if ('name' in command && 'prefix' in command && 'execute' in command) {
      const commandKey = `${command.prefix}${command.name}`;
      client.commands.set(command.name, command);
      this.loadedCommands.set(commandKey, {
        ...command,
        category: folder,
        file: file,
        type: 'prefix'
      });
      
      return {
        success: true,
        type: 'prefix',
        name: commandKey
      };
    }
    
    // Validate multi-language command structure
    if ('name' in command && 'language' in command && 'execute' in command) {
      const commandKey = `${command.name}_${command.language}`;
      client.commands.set(commandKey, command);
      this.loadedCommands.set(commandKey, {
        ...command,
        category: folder,
        file: file,
        type: command.language
      });
      
      return {
        success: true,
        type: command.language,
        name: commandKey
      };
    }
    
    return {
      success: false,
      reason: 'Missing required properties (data/execute for slash, name/prefix/execute for prefix)'
    };
  }

  // 🔄 FALLBACK COMMANDS
  loadFallbackCommands(client) {
    console.log('🔄 Loading fallback commands...');
    
    // Clear existing commands
    client.commands.clear();
    this.commands.length = 0;
    this.loadedCommands.clear();

    const fallbackCommands = [
      {
        data: new SlashCommandBuilder()
          .setName('ping')
          .setDescription('Replies with Pong and shows latency info!'),
        category: 'utility',
        async execute(interaction, { nodeId, client, database, pointsSystem }) {
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
        }
      },
      {
        data: new SlashCommandBuilder()
          .setName('help')
          .setDescription('Shows available commands and bot information'),
        category: 'utility',
        async execute(interaction, { nodeId, client, database, pointsSystem }) {
          const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🤖 Discord Bot Help')
            .setDescription('Here are the available commands:')
            .addFields([
              { name: '🏓 /ping', value: 'Check bot latency and status', inline: false },
              { name: '📊 /points', value: 'View your points and level', inline: false },
              { name: '🎵 m![song] [artist]', value: 'Play music (prefix command)', inline: false },
              { name: '❓ /help', value: 'Show this help message', inline: false }
            ])
            .addFields([
              { name: '🎯 Points System', value: 'Earn points by:\n• Sending messages (+1)\n• Using voice chat (+5/min)\n• Using commands (+3)\n• Getting reactions (+2)', inline: false }
            ])
            .setFooter({ text: `Node: ${nodeId} | Modular Command System` })
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed] });
        }
      },
      {
        data: new SlashCommandBuilder()
          .setName('status')
          .setDescription('Shows detailed bot status and cluster information'),
        category: 'admin',
        async execute(interaction, { nodeId, client, database, redis }) {
          try {
            // Get active nodes safely
            let activeNodes = [];
            try {
              if (redis && redis.getClient) {
                const nodeKeys = await redis.getClient().keys('bot:node:*');
                for (const key of nodeKeys) {
                  const nodeData = await redis.get(key);
                  if (nodeData) {
                    activeNodes.push(JSON.parse(nodeData));
                  }
                }
              }
            } catch (error) {
              console.log('Redis error in status command:', error.message);
            }
            
            // Get database stats
            let dbStats = null;
            if (database) {
              try {
                dbStats = await database.getDatabaseSize();
              } catch (error) {
                console.error('Error getting database stats:', error);
              }
            }
            
            const embed = new EmbedBuilder()
              .setColor(0x00FF00)
              .setTitle('📊 Bot Cluster Status')
              .addFields([
                { name: '🖥️ Current Node', value: nodeId, inline: true },
                { name: '📡 Ping', value: `${client.ws.ping}ms`, inline: true },
                { name: '⏱️ Uptime', value: `${Math.floor(process.uptime())}s`, inline: true },
                { name: '🏠 Guilds', value: client.guilds.cache.size.toString(), inline: true },
                { name: '👥 Users', value: client.users.cache.size.toString(), inline: true },
                { name: '📝 Commands', value: client.commands.size.toString(), inline: true }
              ]);
            
            // Add cluster information
            if (activeNodes.length > 0) {
              const nodeList = activeNodes.map(node => 
                `**${node.id}**: ${node.ping || 'N/A'}ms | ${node.guilds || 0} guilds`
              ).join('\n');
              embed.addFields([
                { name: '🌐 Active Nodes', value: nodeList || 'No active nodes', inline: false }
              ]);
            }
            
            // Add database information
            if (dbStats) {
              embed.addFields([
                { name: '🗄️ Database', value: `${dbStats.user_count || 0} users | ${dbStats.transaction_count || 0} transactions`, inline: false }
              ]);
            }
            
            embed.setFooter({ text: 'Modular Discord Bot System' })
              .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
            
          } catch (error) {
            console.error('Error in status command:', error);
            await interaction.reply({
              content: `❌ Error getting status information!\nNode: ${nodeId}`,
              ephemeral: true
            });
          }
        }
      }
    ];

    // Load fallback commands
    for (const command of fallbackCommands) {
      client.commands.set(command.data.name, command);
      this.commands.push(command.data.toJSON());
      this.loadedCommands.set(command.data.name, {
        ...command,
        file: 'fallback',
        type: 'slash'
      });
      console.log(`✅ Loaded fallback command: ${command.data.name}`);
    }

    console.log(`🎯 Loaded ${fallbackCommands.length} fallback commands`);
    return fallbackCommands.length;
  }

  // 📝 REGISTER COMMANDS WITH DISCORD - PROPER GUILD HANDLING
  async registerCommands() {
    try {
      console.log('🔄 Registering application commands with Discord...');
      
      const rest = new REST({ version: '10' }).setToken(this.config.token);
      
      // PROPER LOGIC: Check if guild ID exists AND is valid
      if (this.config.guildId && this.config.guildId.trim() !== '') {
        // Guild-specific registration (faster, but only works in that guild)
        console.log(`🎯 Registering commands for guild: ${this.config.guildId}`);
        await rest.put(
          Routes.applicationGuildCommands(this.config.clientId, this.config.guildId),
          { body: this.commands }
        );
        console.log(`✅ Successfully registered ${this.commands.length} guild commands for guild ${this.config.guildId}`);
      } else {
        // Global registration (slower to update, but works everywhere)
        console.log('🌐 Registering commands globally (all servers)');
        await rest.put(
          Routes.applicationCommands(this.config.clientId),
          { body: this.commands }
        );
        console.log(`✅ Successfully registered ${this.commands.length} global commands`);
      }
    } catch (error) {
      console.error('❌ Error registering commands:', error);
      
      // If guild registration fails, try global as fallback
      if (this.config.guildId && error.code === 50001) {
        console.log('🔄 Guild registration failed, trying global registration...');
        try {
          const rest = new REST({ version: '10' }).setToken(this.config.token);
          await rest.put(
            Routes.applicationCommands(this.config.clientId),
            { body: this.commands }
          );
          console.log(`✅ Successfully registered ${this.commands.length} global commands as fallback`);
        } catch (globalError) {
          console.error('❌ Global registration also failed:', globalError);
          throw globalError;
        }
      } else {
        throw error;
      }
    }
  }

  // 🔍 COMMAND INFORMATION
  getCommandInfo(commandName) {
    return this.loadedCommands.get(commandName) || null;
  }

  getCommandsByCategory(category) {
    const commands = [];
    for (const [name, command] of this.loadedCommands) {
      if (command.category === category) {
        commands.push({ name, ...command });
      }
    }
    return commands;
  }

  getAllCategories() {
    const categories = new Set();
    for (const command of this.loadedCommands.values()) {
      categories.add(command.category);
    }
    return Array.from(categories);
  }

  getCommandCount() {
    return {
      total: this.loadedCommands.size,
      slash: Array.from(this.loadedCommands.values()).filter(cmd => cmd.type === 'slash').length,
      prefix: Array.from(this.loadedCommands.values()).filter(cmd => cmd.type === 'prefix').length,
      python: Array.from(this.loadedCommands.values()).filter(cmd => cmd.type === 'python').length,
      golang: Array.from(this.loadedCommands.values()).filter(cmd => cmd.type === 'golang').length
    };
  }

  // 🔄 HOT RELOADING
  async reloadCommand(commandName, client) {
    try {
      const commandInfo = this.getCommandInfo(commandName);
      if (!commandInfo) {
        throw new Error(`Command ${commandName} not found`);
      }
      
      const filePath = path.join(__dirname, '..', 'commands', commandInfo.category, commandInfo.file);
      
      // Clear require cache
      delete require.cache[require.resolve(filePath)];
      
      // Reload command
      const newCommand = require(filePath);
      const loadResult = this.validateAndLoadCommand(newCommand, commandInfo.category, commandInfo.file, client);
      
      if (loadResult.success) {
        console.log(`✅ Reloaded command: ${commandName}`);
        return true;
      } else {
        throw new Error(loadResult.reason);
      }
    } catch (error) {
      console.error(`❌ Error reloading command ${commandName}:`, error);
      return false;
    }
  }

  async reloadAllCommands(client) {
    try {
      const count = await this.loadCommands(client);
      await this.registerCommands();
      return count;
    } catch (error) {
      console.error('❌ Error reloading all commands:', error);
      throw error;
    }
  }

  // 🎯 COMMAND EXECUTION HELPERS
  async executeCommand(interaction, services) {
    const command = interaction.client.commands.get(interaction.commandName);
    
    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return false;
    }

    try {
      await command.execute(interaction, services);
      
      // Record command usage for analytics
      if (services.pointsSystem) {
        await services.pointsSystem.recordPerformanceMetric('commands_processed', 1);
      }
      
      return true;
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);
      
      const errorMessage = `❌ There was an error executing this command on node \`${services.nodeId}\`!`;
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
      
      return false;
    }
  }

  async executePrefixCommand(message, commandName, args, services) {
    const command = message.client.commands.get(commandName);
    
    if (!command || command.type !== 'prefix') {
      return false;
    }

    try {
      await command.execute(message, args, services);
      
      // Record command usage
      if (services.pointsSystem) {
        await services.pointsSystem.recordPerformanceMetric('prefix_commands_processed', 1);
      }
      
      return true;
    } catch (error) {
      console.error(`Error executing prefix command ${commandName}:`, error);
      message.reply(`❌ There was an error executing this command on node \`${services.nodeId}\`!`);
      return false;
    }
  }

  // 📊 COMMAND ANALYTICS
  getCommandStats() {
    const stats = {
      totalCommands: this.loadedCommands.size,
      categories: {},
      types: {}
    };
    
    for (const command of this.loadedCommands.values()) {
      // Count by category
      stats.categories[command.category] = (stats.categories[command.category] || 0) + 1;
      
      // Count by type
      stats.types[command.type] = (stats.types[command.type] || 0) + 1;
    }
    
    return stats;
  }
}

module.exports = CommandLoader;