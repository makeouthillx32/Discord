const { Events } = require('discord.js');

class MessageEvents {
  constructor(eventHandler) {
    this.client = eventHandler.client;
    this.config = eventHandler.config;
    this.commandLoader = eventHandler.commandLoader;
    this.eventHandler = eventHandler;
  }

  setup() {
    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return;
      
      try {
        // Handle prefix commands
        if (message.content.startsWith('m!')) {
          await this.handlePrefixCommand(message, 'm!', 'music');
          return;
        }
        
        // Handle other prefix commands
        const prefixMatches = message.content.match(/^([!\.\/\$\?]+)(\w+)/);
        if (prefixMatches) {
          const prefix = prefixMatches[1];
          const commandName = prefixMatches[2];
          await this.handlePrefixCommand(message, prefix, commandName);
          return;
        }
        
        // Award points for regular messages in guilds
        if (message.guild) {
          await this.handleMessagePoints(message);
        }
        
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    this.client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
      if (newMessage.author?.bot) return;
      console.log(`📝 Message edited by ${newMessage.author?.tag}`);
    });

    this.client.on(Events.MessageDelete, async (message) => {
      if (message.author?.bot) return;
      console.log(`🗑️ Message deleted from ${message.guild?.name}`);
    });
  }

  async handlePrefixCommand(message, prefix, commandName) {
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const actualCommand = args.shift().toLowerCase();
    
    const services = this.eventHandler.getServices();
    const success = await this.commandLoader.executePrefixCommand(message, actualCommand, args, services);
    
    if (success && message.guild) {
      await this.eventHandler.safeAwardPoints(
        message.author.id,
        message.guild.id,
        this.config.points.COMMAND_USED,
        'Prefix Command',
        'command',
        { command: `${prefix}${actualCommand}` }
      );
    }
  }

  async handleMessagePoints(message) {
    try {
      if (!this.eventHandler.pointsSystem) return;
      
      const { points, metadata } = await this.eventHandler.pointsSystem.calculateMessagePoints(message);
      
      await this.eventHandler.safeAwardPoints(
        message.author.id,
        message.guild.id,
        points,
        'Message',
        'message',
        metadata
      );
      
    } catch (error) {
      console.error('Error handling message points:', error);
    }
  }
}

module.exports = MessageEvents;