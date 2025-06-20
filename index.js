// 🔧 CONFIGURATION
const crypto = require('crypto');

function validateSecurityKey() {
  const securityKey = process.env.SECURITY_KEY || 'temp-key-for-testing-only-replace-this-with-real-key-later';
  return securityKey.length >= 32 ? securityKey : 'temp-key-for-testing-only-replace-this-with-real-key-later';
}

const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID,
  redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
  postgresUrl: process.env.POSTGRES_URL || 'postgresql://bot_user:strong_password_here@postgres:5432/discord_bot',
  port: process.env.PORT || 3000,
  nodeId: process.env.NODE_ID || Math.random().toString(36).substring(7),
  nodeEnv: process.env.NODE_ENV || 'development',
  securityKey: validateSecurityKey(),
  apiSecret: process.env.API_SECRET_KEY || 'default-webhook-secret',
  points: {
    MESSAGE_SENT: 1,
    REACTION_GIVEN: 1,
    REACTION_RECEIVED: 2,
    VOICE_MINUTE: 5,
    COMMAND_USED: 3,
    FIRST_MESSAGE_DAY: 10,
    LONG_MESSAGE: 5,
    EMOJI_USED: 1,
    THREAD_CREATED: 15,
    INVITE_CREATED: 20,
    LEVEL_MULTIPLIER: 100,
    DAILY_BONUS: 50,
    WEEKLY_BONUS: 200,
    MONTHLY_BONUS: 1000
  },
  rateLimit: {
    windowMs: 60000,
    maxRequests: 100
  },
  features: {
    pointsSystem: true,
    voiceTracking: true,
    musicBot: true,
    multiLanguageCommands: false,
    webhookEndpoints: true,
    adminEndpoints: true
  },
  logging: {
    level: 'info',
    enableFile: false,
    enableConsole: true
  }
};

// Validation
if (!config.token) {
  console.error('❌ DISCORD_TOKEN is required!');
  process.exit(1);
}
if (!config.clientId) {
  console.error('❌ DISCORD_CLIENT_ID is required!');
  process.exit(1);
}

// 🤖 DISCORD CLIENT SETUP
const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');
const express = require('express');

// Import your existing services
const DatabaseService = require('./services/database');
const RedisService = require('./services/redis');
const PointsSystem = require('./services/pointsSystem');
const VoiceTracker = require('./services/voiceTracker');
const CommandLoader = require('./services/commandLoader');
const EventHandlers = require('./handlers/eventHandlers'); // This exists!

// Create Discord client with FIXED INTENTS
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,           // ← ADDED THIS - Required for guild cache
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildEmojisAndStickers
  ]
});

// Initialize services
let database, redis, pointsSystem, voiceTracker, commandLoader, eventHandlers;

// Express setup
const app = express();
app.use(express.json());

app.get('/health', async (req, res) => {
  const isReady = client.readyAt !== null;
  const ping = client.ws.ping;
  
  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'healthy' : 'unhealthy',
    nodeId: config.nodeId,
    ping: ping,
    uptime: process.uptime(),
    guilds: client.guilds.cache.size,
    commands: client.commands.size,
    features: config.features
  });
});

// Commands collection
client.commands = new Collection();

// 🚀 MAIN START FUNCTION
async function start() {
  try {
    console.log('🚀 Starting Advanced Discord Bot...');
    console.log(`🔧 Node: ${config.nodeId} | Environment: ${config.nodeEnv}`);
    
    // 1. Initialize Database
    try {
      console.log('🔄 Connecting to database...');
      database = new DatabaseService(config.postgresUrl);
      const dbConnected = await database.testConnection();
      console.log(dbConnected ? '✅ Database connected' : '⚠️ Database connection failed');
    } catch (error) {
      console.log('⚠️ Database connection failed:', error.message);
      database = null;
    }

    // 2. Initialize Redis
    try {
      console.log('🔄 Connecting to Redis...');
      redis = new RedisService(config.redisUrl);
      await redis.connect();
      console.log('✅ Redis connected');
    } catch (error) {
      console.log('⚠️ Redis connection failed:', error.message);
      redis = null;
    }

    // 3. Initialize Points System
    if (database && config.features.pointsSystem) {
      try {
        pointsSystem = new PointsSystem(database, redis, config);
        console.log('✅ Points system initialized');
      } catch (error) {
        console.log('⚠️ Points system failed to initialize:', error.message);
      }
    }

    // 4. Initialize Voice Tracker
    if (database && config.features.voiceTracking) {
      try {
        voiceTracker = new VoiceTracker(pointsSystem, database, redis);
        console.log('✅ Voice tracker initialized');
      } catch (error) {
        console.log('⚠️ Voice tracker failed to initialize:', error.message);
      }
    }

    // 5. Initialize Command Loader and Load Commands
    try {
      console.log('🔄 Initializing command loader...');
      commandLoader = new CommandLoader(config);
      const commandCount = await commandLoader.loadCommands(client);
      console.log(`✅ Command loader initialized - ${commandCount} commands loaded`);
      
      // Register commands with Discord
      await commandLoader.registerCommands();
      console.log('✅ Commands registered with Discord');
    } catch (error) {
      console.error('❌ Failed to initialize commands:', error);
      // Fall back to basic commands if command loading fails
      console.log('🔄 Loading fallback commands...');
      await loadFallbackCommands();
    }

    // 6. Initialize Event Handlers
    try {
      console.log('🔄 Setting up event handlers...');
      eventHandlers = new EventHandlers({
        client,
        config,
        database,
        redis,
        pointsSystem,
        voiceTracker,
        commandLoader
      });
      await eventHandlers.setup();
      console.log('✅ Event handlers initialized');
    } catch (error) {
      console.log('⚠️ Event handlers failed to initialize:', error.message);
      // Set up basic event handling if event handlers fail
      setupBasicEvents();
    }
    
    // 7. Start Express server
    app.listen(config.port, () => {
      console.log(`🌐 HTTP server running on port ${config.port}`);
    });
    
    // 8. Login to Discord
    console.log('🔄 Logging into Discord...');
    await client.login(config.token);
    
  } catch (error) {
    console.error('💥 Failed to start bot:', error);
    process.exit(1);
  }
}

// 🔄 FALLBACK COMMAND LOADING
async function loadFallbackCommands() {
  const { SlashCommandBuilder } = require('discord.js');
  
  const fallbackCommands = [
    {
      data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency'),
      async execute(interaction, { nodeId, client }) {
        const ping = client.ws.ping;
        await interaction.reply(`🏓 Pong! ${ping}ms | Node: ${nodeId}`);
      }
    },
    {
      data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Show bot status'),
      async execute(interaction, { nodeId, client }) {
        await interaction.reply({
          content: `📊 **Bot Status**\n` +
                   `🖥️ Node: ${nodeId}\n` +
                   `📡 Ping: ${client.ws.ping}ms\n` +
                   `🏠 Guilds: ${client.guilds.cache.size}\n` +
                   `👥 Users: ${client.users.cache.size}\n` +
                   `📝 Commands: ${client.commands.size}`
        });
      }
    }
  ];

  // Load fallback commands
  for (const command of fallbackCommands) {
    client.commands.set(command.data.name, command);
    console.log(`✅ Loaded fallback command: ${command.data.name}`);
  }

  // Register fallback commands
  const { REST, Routes } = require('discord.js');
  const rest = new REST({ version: '10' }).setToken(config.token);
  const commands = fallbackCommands.map(cmd => cmd.data.toJSON());
  
  try {
    if (config.guildId) {
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
    } else {
      await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    }
    console.log(`✅ Registered ${commands.length} fallback commands`);
  } catch (error) {
    console.error('❌ Failed to register fallback commands:', error);
  }
}

// 🔧 BASIC EVENT HANDLING (if EventHandlers fails)
function setupBasicEvents() {
  console.log('🔄 Setting up basic event handling...');
  
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`✅ Bot ready! Logged in as ${readyClient.user.tag}`);
    
    // Wait for guild cache to populate before showing count
    setTimeout(() => {
      const guildCount = readyClient.guilds.cache.size;
      console.log(`🏠 Serving ${guildCount} guilds`);
      
      if (guildCount > 0) {
        readyClient.guilds.cache.forEach(guild => {
          console.log(`  📍 Guild: ${guild.name} (${guild.id})`);
        });
      } else {
        console.log(`⚠️  No guilds found. Check bot permissions and Server Members Intent.`);
      }
    }, 2000);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      const services = {
        nodeId: config.nodeId,
        redis: redis,
        client: client,
        database: database,
        pointsSystem: pointsSystem,
        voiceTracker: voiceTracker
      };

      await command.execute(interaction, services);
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ Command error!', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ Command error!', ephemeral: true });
      }
    }
  });

  client.on(Events.Error, (error) => {
    console.error('Discord client error:', error);
  });

  console.log('✅ Basic event handling set up');
}

// 🛑 GRACEFUL SHUTDOWN
async function shutdown() {
  console.log('🛑 Shutting down gracefully...');
  
  try {
    if (voiceTracker) {
      await voiceTracker.forceEndAllSessions('Bot shutdown');
    }
    if (redis) {
      await redis.removeNode(config.nodeId);
      await redis.quit();
    }
    if (database) {
      await database.close();
    }
    if (client) {
      client.destroy();
    }
    
    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Shutdown error:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  shutdown();
});

// 🚀 START THE BOT
start().catch(error => {
  console.error('💥 Fatal startup error:', error);
  process.exit(1);
});