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
      console.log(`🏠 Serving ${readyClient.guilds.cache.size} guilds`);
      
      // Test database connection
      const dbConnected = await this.database.testConnection();
      if (!dbConnected) {
        console.error('❌ Database connection failed! Points system may not work properly.');
      }
      
      // Register this bot instance in Redis
      await this.redis.registerNode(this.config.nodeId, {
        status: 'ready',
        guilds: readyClient.guilds.cache.size,
        commands: readyClient.commands.size,
        database: dbConnected ? 'connected' : 'failed'
      });
      
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
  }

  startHeartbeat() {
    setInterval(async () => {
      try {
        await this.redis.updateNodeHeartbeat(this.config.nodeId, {
          status: 'active',
          guilds: this.client.guilds.cache.size,
          ping: this.client.ws.ping,
          commands: this.client.commands.size,
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime()
        });
      } catch (error) {
        console.error('Error updating heartbeat:', error);
      }
    }, 30000);
  }

  async updateStatus(status) {
    try {
      await this.redis.updateNodeHeartbeat(this.config.nodeId, {
        status,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }
}

module.exports = LifecycleEvents;