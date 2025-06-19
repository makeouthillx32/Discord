const crypto = require('crypto');

// 🔐 SECURITY VALIDATION
function validateSecurityKey() {
  const securityKey = process.env.SECURITY_KEY;
  
  if (!securityKey) {
    console.error('\n🚨 SECURITY ERROR: Missing SECURITY_KEY in environment variables!');
    console.error('📋 To generate a secure key, run one of these commands:');
    console.error('   Linux/Mac: openssl rand -hex 32');
    console.error('   Windows:   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    console.error('   Online:    https://www.allkeysgenerator.com/Random/Security-Encryption-Key-Generator.aspx');
    console.error('\n💡 Add this to your .env file: SECURITY_KEY=your_generated_key_here\n');
    process.exit(1);
  }
  
  if (securityKey === 'YOUR_SHA256_KEY_HERE_GENERATE_WITH_OPENSSL_RAND_HEX_32') {
    console.error('\n🚨 SECURITY ERROR: You must replace the default SECURITY_KEY!');
    console.error('📋 Generate a new key with: openssl rand -hex 32');
    console.error('💡 Then update your .env file with the generated key\n');
    process.exit(1);
  }
  
  if (securityKey.length !== 64) {
    console.error('\n🚨 SECURITY ERROR: SECURITY_KEY must be exactly 64 characters (32 bytes in hex)!');
    console.error('📋 Generate a proper key with: openssl rand -hex 32\n');
    process.exit(1);
  }
  
  if (!/^[a-f0-9]{64}$/i.test(securityKey)) {
    console.error('\n🚨 SECURITY ERROR: SECURITY_KEY must be valid hexadecimal!');
    console.error('📋 Generate a proper key with: openssl rand -hex 32\n');
    process.exit(1);
  }
  
  console.log('✅ Security key validated successfully');
  return securityKey;
}

// 🎯 POINTS SYSTEM CONFIGURATION
const POINTS_CONFIG = {
  MESSAGE_SENT: 1,           // Points per message
  REACTION_GIVEN: 1,         // Points for adding reactions
  REACTION_RECEIVED: 2,      // Points when others react to your message
  VOICE_MINUTE: 5,           // Points per minute in voice channel
  COMMAND_USED: 3,           // Points for using bot commands
  FIRST_MESSAGE_DAY: 10,     // Bonus for first message of the day
  LONG_MESSAGE: 5,           // Bonus for messages over 100 characters
  EMOJI_USED: 1,             // Points for using custom emojis
  THREAD_CREATED: 15,        // Points for creating threads
  INVITE_CREATED: 20,        // Points for creating invites
  LEVEL_MULTIPLIER: 100,     // Points needed = level * multiplier
  DAILY_BONUS: 50,           // Daily login bonus
  WEEKLY_BONUS: 200,         // Weekly activity bonus
  MONTHLY_BONUS: 1000        // Monthly activity bonus
};

// 🔧 MAIN CONFIGURATION
const config = {
  // Discord Configuration
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID, // Optional: for guild-specific commands
  
  // Database Configuration
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  postgresUrl: process.env.POSTGRES_URL || 'postgresql://bot_user:strong_password_here@localhost:5432/discord_bot',
  
  // Server Configuration
  port: process.env.PORT || 3000,
  nodeId: process.env.NODE_ID || Math.random().toString(36).substring(7),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Security Configuration
  securityKey: validateSecurityKey(),
  apiSecret: process.env.API_SECRET_KEY || 'default-webhook-secret',
  
  // Points System
  points: POINTS_CONFIG,
  
  // Rate Limiting
  rateLimit: {
    windowMs: 60000,      // 1 minute
    maxRequests: 100      // 100 requests per minute
  },
  
  // Features Toggle
  features: {
    pointsSystem: true,
    voiceTracking: true,
    musicBot: true,
    multiLanguageCommands: true,
    webhookEndpoints: true,
    adminEndpoints: true
  },
  
  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableFile: process.env.LOG_TO_FILE === 'true',
    enableConsole: true
  }
};

// 🔍 CONFIGURATION VALIDATION
function validateConfig() {
  const errors = [];
  
  if (!config.token) {
    errors.push('DISCORD_TOKEN is required! Get it from Discord Developer Portal.');
  }
  
  if (!config.clientId) {
    errors.push('DISCORD_CLIENT_ID is required! Get it from Discord Developer Portal.');
  }
  
  if (!process.env.POSTGRES_PASSWORD) {
    errors.push('POSTGRES_PASSWORD is required! Set a strong database password.');
  }
  
  if (errors.length > 0) {
    console.error('❌ Configuration errors:');
    errors.forEach(error => console.error(`   - ${error}`));
    process.exit(1);
  }
  
  console.log('✅ Configuration validated successfully');
}

// Validate configuration on load
validateConfig();

// 📊 LOG CONFIGURATION (without sensitive data)
console.log('🔧 Bot Configuration:');
console.log(`   Node ID: ${config.nodeId}`);
console.log(`   Environment: ${config.nodeEnv}`);
console.log(`   Client ID: ${config.clientId ? 'SET' : 'MISSING'}`);
console.log(`   Token: ${config.token ? 'SET' : 'MISSING'}`);
console.log(`   Redis URL: ${config.redisUrl}`);
console.log(`   Database: ${config.postgresUrl ? 'SET' : 'MISSING'}`);
console.log(`   Port: ${config.port}`);
console.log(`   Features: ${Object.entries(config.features).filter(([k,v]) => v).map(([k]) => k).join(', ')}`);

module.exports = config;