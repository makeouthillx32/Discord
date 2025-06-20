const { Events } = require('discord.js');

class LifecycleEvents {
  constructor(eventHandler) {
    this.client = eventHandler.client;
    this.config = eventHandler.config;
    this.database = eventHandler.database;
    this.redis = eventHandler.redis;
  }

  setup() {
    // Bot ready event
    this.client.once(Events.ClientReady, async (readyClient) => {
      console.log(`✅ Bot ready! Logged in as ${readyClient.user.tag}`);
      console.log(`🔧 Node ID: ${this.config.nodeId}`);
      
      // Debug information
      console.log(`🔍 Debug Info:`);
      console.log(`   Bot ID: ${readyClient.user.id}`);
      console.log(`   Expected Guild ID: ${this.config.guildId || 'Not set'}`);
      
      // Wait longer for guild cache to populate
      setTimeout(async () => {
        const guildCount = readyClient.guilds.cache.size;
        console.log(`🏠 Serving ${guildCount} guilds`);
        
        // Log ALL cached guilds for debugging
        console.log(`🔍 Cached guilds:`);
        readyClient.guilds.cache.forEach(guild => {
          console.log(`  📍 Guild: ${guild.name} (${guild.id}) - ${guild.memberCount || 'Unknown'} members`);
        });
        
        // Check if expected guild is in cache
        if (this.config.guildId) {
          const expectedGuild = readyClient.guilds.cache.get(this.config.guildId);
          if (expectedGuild) {
            console.log(`✅ Found expected guild: ${expectedGuild.name}`);
          } else {
            console.log(`❌ Expected guild ${this.config.guildId} not found in cache`);
            console.log(`🔧 This could mean:`);
            console.log(`   1. Bot isn't in that guild`);
            console.log(`   2. Guild ID is wrong`);
            console.log(`   3. Missing Server Members intent`);
          }
        }
        
        if (guildCount === 0) {
          console.log(`⚠️  No guilds found.`);
          console.log(`📋 Invite URL: https://discord.com/api/oauth2/authorize?client_id=${this.config.clientId}&permissions=8&scope=bot%20applications.commands`);
        }
      }, 3000); // Wait 3 seconds for cache to populate
      
      // Test database connection
      if (this.database) {
        const dbConnected = await this.database.testConnection();
        if (!dbConnected) {
          console.error('❌ Database connection failed! Points system may not work properly.');
        }
      }
      
      // Register this bot instance in Redis
      if (this.redis) {
        await this.redis.registerNode(this.config.nodeId, {
          status: 'ready',
          guilds: readyClient.guilds.cache.size,
          commands: readyClient.commands.size,
          database: this.database ? 'connected' : 'failed',
          userTag: readyClient.user.tag
        });
      }
      
      // Start heartbeat
      this.startHeartbeat();
    });

    // Disconnect/reconnect events
    this.client.on(Events.Disconnect, async () => {
      console.log('🔌 Bot disconnected from Discord');
      await this.updateStatus('disconnected');
    });

    this.client.on(Events.Reconnecting, () => {
      console.log('🔄 Bot reconnecting to Discord...');
    });

    this.client.on(Events.Resume, async () => {
      console.log('✅ Bot resumed connection to Discord');
      await this.updateStatus('resumed');
    });

    // Guild events for real-time updates
    this.client.on(Events.GuildCreate, (guild) => {
      console.log(`🎉 Joined new guild: ${guild.name} (${guild.id})`);
      console.log(`🏠 Now serving ${this.client.guilds.cache.size} guilds`);
    });

    this.client.on(Events.GuildDelete, (guild) => {
      console.log(`👋 Left guild: ${guild.name} (${guild.id})`);
      console.log(`🏠 Now serving ${this.client.guilds.cache.size} guilds`);
    });
  }

  startHeartbeat() {
    setInterval(async () => {
      try {
        if (this.redis) {
          await this.redis.updateNodeHeartbeat(this.config.nodeId, {
            status: 'active',
            guilds: this.client.guilds.cache.size,
            ping: this.client.ws.ping,
            commands: this.client.commands.size,
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime()
          });
        }
      } catch (error) {
        console.error('Error updating heartbeat:', error);
      }
    }, 30000); // Every 30 seconds
  }

  async updateStatus(status) {
    try {
      if (this.redis) {
        await this.redis.updateNodeHeartbeat(this.config.nodeId, {
          status,
          timestamp: Date.now(),
          guilds: this.client.guilds.cache.size
        });
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }
}

module.exports = LifecycleEvents;