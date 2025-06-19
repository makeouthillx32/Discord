const { Events } = require('discord.js');
const LifecycleEvents = require('../events/lifecycleEvents');
const MessageEvents = require('../events/messageEvents');
const InteractionEvents = require('../events/interactionEvents');
const VoiceEvents = require('../events/voiceEvents');
const ReactionEvents = require('../events/reactionEvents');
const GuildEvents = require('../events/guildEvents');
const ErrorEvents = require('../events/errorEvents');
const MaintenanceService = require('../events/maintenance/maintenanceService');

class EventHandlers {
  constructor({ client, config, database, redis, pointsSystem, voiceTracker, commandLoader }) {
    this.client = client;
    this.config = config;
    this.database = database;
    this.redis = redis;
    this.pointsSystem = pointsSystem;
    this.voiceTracker = voiceTracker;
    this.commandLoader = commandLoader;
    
    // Initialize event modules
    this.lifecycleEvents = new LifecycleEvents(this);
    this.messageEvents = new MessageEvents(this);
    this.interactionEvents = new InteractionEvents(this);
    this.voiceEvents = new VoiceEvents(this);
    this.reactionEvents = new ReactionEvents(this);
    this.guildEvents = new GuildEvents(this);
    this.errorEvents = new ErrorEvents(this);
    this.maintenanceService = new MaintenanceService(this);
  }

  async setup() {
    console.log('📡 Setting up Discord event handlers...');

    // Setup all event modules
    this.lifecycleEvents.setup();
    this.messageEvents.setup();
    this.interactionEvents.setup();
    this.voiceEvents.setup();
    this.reactionEvents.setup();
    this.guildEvents.setup();
    this.errorEvents.setup();
    
    // Start maintenance
    this.maintenanceService.start();

    console.log('✅ Event handlers configured');
  }

  // Utility methods for event modules to use
  getServices() {
    return {
      nodeId: this.config.nodeId,
      redis: this.redis,
      client: this.client,
      database: this.database,
      pointsSystem: this.pointsSystem,
      voiceTracker: this.voiceTracker
    };
  }

  async safeAwardPoints(userId, guildId, points, reason, activityType, metadata = {}) {
    if (!this.pointsSystem || !guildId) return false;
    
    try {
      await this.pointsSystem.awardPoints(userId, guildId, points, reason, activityType, {
        ...metadata,
        nodeId: this.config.nodeId
      });
      return true;
    } catch (error) {
      console.error('Error awarding points:', error);
      return false;
    }
  }

  getEventStats() {
    return {
      nodeId: this.config.nodeId,
      handlersRegistered: 9,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    };
  }
}

module.exports = EventHandlers;