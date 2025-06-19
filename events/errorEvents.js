const { Events } = require('discord.js');

class ErrorEvents {
  constructor(eventHandler) {
    this.client = eventHandler.client;
    this.config = eventHandler.config;
    this.redis = eventHandler.redis;
    this.eventHandler = eventHandler;
  }

  setup() {
    // Discord client errors
    this.client.on(Events.Error, (error) => {
      console.error('💥 Discord client error:', error);
      this.logError('client_error', error);
    });

    this.client.on(Events.Warn, (warning) => {
      console.warn('⚠️ Discord client warning:', warning);
      this.logWarning('client_warning', warning);
    });

    this.client.on(Events.Debug, (info) => {
      if (this.config.logging?.level === 'debug') {
        console.debug('🐛 Discord client debug:', info);
      }
    });

    // Rate limit events
    this.client.on(Events.RateLimited, (rateLimitData) => {
      console.warn('🚦 Rate limited:', rateLimitData);
      this.logWarning('rate_limited', rateLimitData);
    });

    // Shard events (if using sharding)
    this.client.on(Events.ShardError, (error, shardId) => {
      console.error(`💥 Shard ${shardId} error:`, error);
      this.logError('shard_error', { error: error.message, shardId });
    });

    this.client.on(Events.ShardDisconnect, (event, shardId) => {
      console.warn(`🔌 Shard ${shardId} disconnected:`, event);
      this.logWarning('shard_disconnect', { event, shardId });
    });

    this.client.on(Events.ShardReconnecting, (shardId) => {
      console.log(`🔄 Shard ${shardId} reconnecting...`);
    });

    this.client.on(Events.ShardReady, (shardId) => {
      console.log(`✅ Shard ${shardId} ready`);
    });

    this.client.on(Events.ShardResume, (shardId, replayedEvents) => {
      console.log(`✅ Shard ${shardId} resumed (${replayedEvents} events replayed)`);
    });

    // Process-level error handling
    this.setupProcessErrorHandling();
  }

  setupProcessErrorHandling() {
    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
      this.logError('unhandled_rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        promise: promise.toString()
      });
    });

    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('🚨 Uncaught Exception:', error);
      this.logError('uncaught_exception', {
        message: error.message,
        stack: error.stack,
        nodeId: this.config.nodeId
      });
      
      // Attempt graceful shutdown
      this.handleCriticalError(error);
    });

    // Warning events
    process.on('warning', (warning) => {
      console.warn('⚠️ Process warning:', warning);
      this.logWarning('process_warning', {
        name: warning.name,
        message: warning.message,
        stack: warning.stack
      });
    });

    // Graceful shutdown signals
    process.on('SIGTERM', () => {
      console.log('📡 Received SIGTERM, starting graceful shutdown...');
      this.handleGracefulShutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      console.log('📡 Received SIGINT, starting graceful shutdown...');
      this.handleGracefulShutdown('SIGINT');
    });
  }

  async logError(type, error) {
    try {
      // Record error metrics
      if (this.eventHandler.pointsSystem?.recordPerformanceMetric) {
        await this.eventHandler.pointsSystem.recordPerformanceMetric(`errors.${type}`, 1);
      }

      // Store error in Redis for monitoring
      if (this.redis) {
        const errorData = {
          type,
          error: typeof error === 'object' ? JSON.stringify(error) : error,
          nodeId: this.config.nodeId,
          timestamp: Date.now(),
          memory: process.memoryUsage(),
          uptime: process.uptime()
        };
        
        await this.redis.set(
          `error:${this.config.nodeId}:${Date.now()}`,
          JSON.stringify(errorData),
          300 // 5 minutes TTL
        );
      }
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
  }

  async logWarning(type, warning) {
    try {
      // Record warning metrics
      if (this.eventHandler.pointsSystem?.recordPerformanceMetric) {
        await this.eventHandler.pointsSystem.recordPerformanceMetric(`warnings.${type}`, 1);
      }

      // Store warning in Redis
      if (this.redis) {
        const warningData = {
          type,
          warning: typeof warning === 'object' ? JSON.stringify(warning) : warning,
          nodeId: this.config.nodeId,
          timestamp: Date.now()
        };
        
        await this.redis.set(
          `warning:${this.config.nodeId}:${Date.now()}`,
          JSON.stringify(warningData),
          300 // 5 minutes TTL
        );
      }
    } catch (logError) {
      console.error('Failed to log warning:', logError);
    }
  }

  async handleCriticalError(error) {
    console.error('🚨 Critical error detected, attempting graceful shutdown...');
    
    try {
      // Log the critical error
      await this.logError('critical_error', {
        message: error.message,
        stack: error.stack,
        nodeId: this.config.nodeId
      });

      // Attempt emergency shutdown
      if (this.eventHandler.maintenanceService?.handleEmergencyShutdown) {
        await this.eventHandler.maintenanceService.handleEmergencyShutdown();
      }

      // Give some time for cleanup
      setTimeout(() => {
        console.error('💥 Forcing exit due to critical error');
        process.exit(1);
      }, 5000);

    } catch (shutdownError) {
      console.error('Failed to handle critical error:', shutdownError);
      process.exit(1);
    }
  }

  async handleGracefulShutdown(signal) {
    console.log(`🛑 Graceful shutdown initiated by ${signal}`);
    
    try {
      // Update node status
      if (this.redis) {
        await this.redis.updateNodeHeartbeat(this.config.nodeId, {
          status: 'shutting_down',
          timestamp: Date.now()
        });
      }

      // Perform emergency shutdown
      if (this.eventHandler.maintenanceService?.handleEmergencyShutdown) {
        await this.eventHandler.maintenanceService.handleEmergencyShutdown();
      }

      // Close database connections
      if (this.eventHandler.database?.close) {
        await this.eventHandler.database.close();
      }

      // Close Redis connections
      if (this.redis?.quit) {
        await this.redis.quit();
      }

      // Destroy Discord client
      if (this.client) {
        this.client.destroy();
      }

      console.log('✅ Graceful shutdown completed');
      process.exit(0);

    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  // Get error statistics
  async getErrorStats() {
    try {
      if (!this.redis) return { errors: 0, warnings: 0 };

      const errorKeys = await this.redis.client.keys(`error:${this.config.nodeId}:*`);
      const warningKeys = await this.redis.client.keys(`warning:${this.config.nodeId}:*`);

      return {
        errors: errorKeys.length,
        warnings: warningKeys.length,
        nodeId: this.config.nodeId,
        uptime: process.uptime()
      };
    } catch (error) {
      console.error('Error getting error stats:', error);
      return { errors: 0, warnings: 0 };
    }
  }

  // Clear old error logs
  async clearOldErrors(maxAge = 3600000) { // 1 hour default
    try {
      if (!this.redis) return;

      const now = Date.now();
      const errorKeys = await this.redis.client.keys(`error:${this.config.nodeId}:*`);
      const warningKeys = await this.redis.client.keys(`warning:${this.config.nodeId}:*`);

      let cleared = 0;
      for (const key of [...errorKeys, ...warningKeys]) {
        const timestamp = parseInt(key.split(':').pop());
        if (now - timestamp > maxAge) {
          await this.redis.del(key);
          cleared++;
        }
      }

      if (cleared > 0) {
        console.log(`🧹 Cleared ${cleared} old error/warning logs`);
      }

      return cleared;
    } catch (error) {
      console.error('Error clearing old errors:', error);
      return 0;
    }
  }
}

module.exports = ErrorEvents;