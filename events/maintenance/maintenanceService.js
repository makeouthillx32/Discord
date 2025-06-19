class MaintenanceService {
    constructor(eventHandler) {
      this.eventHandler = eventHandler;
      this.redis = eventHandler.redis;
      this.pointsSystem = eventHandler.pointsSystem;
      this.voiceTracker = eventHandler.voiceTracker;
    }
  
    start() {
      // Cleanup tasks every 10 minutes
      setInterval(async () => {
        try {
          await this.performCleanup();
        } catch (error) {
          console.error('Error during maintenance:', error);
        }
      }, 10 * 60 * 1000);
  
      // Performance monitoring every 5 minutes
      setInterval(async () => {
        try {
          await this.recordPerformanceMetrics();
        } catch (error) {
          console.error('Error recording performance metrics:', error);
        }
      }, 5 * 60 * 1000);
  
      // Deep maintenance every hour
      setInterval(async () => {
        try {
          await this.deepMaintenance();
        } catch (error) {
          console.error('Error during deep maintenance:', error);
        }
      }, 60 * 60 * 1000);
    }
  
    async performCleanup() {
      console.log('🧹 Performing routine cleanup...');
      
      try {
        if (this.voiceTracker?.cleanup) {
          await this.voiceTracker.cleanup();
        }
        
        if (this.redis?.cleanup) {
          await this.redis.cleanup();
        }
        
        // Clean up inactive nodes
        if (this.redis?.getActiveNodes) {
          const activeNodes = await this.redis.getActiveNodes();
          const now = Date.now();
          
          for (const node of activeNodes) {
            if (now - node.timestamp > 5 * 60 * 1000) {
              await this.redis.removeNode(node.id);
              console.log(`🧹 Removed inactive node: ${node.id}`);
            }
          }
        }
        
        console.log('✅ Cleanup completed');
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    }
  
    async recordPerformanceMetrics() {
      try {
        if (!this.pointsSystem?.recordPerformanceMetric) return;
        
        const client = this.eventHandler.client;
        
        await this.pointsSystem.recordPerformanceMetric('bot_guilds', client.guilds.cache.size);
        await this.pointsSystem.recordPerformanceMetric('bot_users', client.users.cache.size);
        await this.pointsSystem.recordPerformanceMetric('bot_ping', client.ws.ping);
        await this.pointsSystem.recordPerformanceMetric('bot_uptime', process.uptime());
        
        const memUsage = process.memoryUsage();
        await this.pointsSystem.recordPerformanceMetric('memory_used', memUsage.heapUsed);
        await this.pointsSystem.recordPerformanceMetric('memory_total', memUsage.heapTotal);
        
      } catch (error) {
        console.error('Error recording performance metrics:', error);
      }
    }
  
    async deepMaintenance() {
      try {
        if (this.pointsSystem?.performMaintenance) {
          await this.pointsSystem.performMaintenance();
        }
        
        if (this.voiceTracker?.cleanup) {
          await this.voiceTracker.cleanup();
        }
      } catch (error) {
        console.error('Error during deep maintenance:', error);
      }
    }
  
    async handleEmergencyShutdown() {
      console.log('🚨 Emergency shutdown initiated...');
      
      try {
        if (this.voiceTracker?.forceEndAllSessions) {
          await this.voiceTracker.forceEndAllSessions('Emergency shutdown');
        }
        
        if (this.redis?.removeNode) {
          await this.redis.removeNode(this.eventHandler.config.nodeId);
        }
        
        console.log('✅ Emergency shutdown completed');
      } catch (error) {
        console.error('Error during emergency shutdown:', error);
      }
    }
  }
  
  module.exports = MaintenanceService;