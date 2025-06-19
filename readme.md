# Discord Bot Environment Configuration
# Copy this to .env and fill in your actual values

# 🔐 SECURITY KEY - REQUIRED!
# Generate with: openssl rand -hex 32
# Or online: https://www.allkeysgenerator.com/Random/Security-Encryption-Key-Generator.aspx
SECURITY_KEY=YOUR_SHA256_KEY_HERE_GENERATE_WITH_OPENSSL_RAND_HEX_32

# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_GUILD_ID=your_discord_guild_id_here_optional

# Database Configuration
POSTGRES_PASSWORD=your_super_strong_database_password_here
POSTGRES_USER=bot_user
POSTGRES_DB=discord_bot
POSTGRES_URL=postgresql://bot_user:your_super_strong_database_password_here@postgres:5432/discord_bot

# Redis Configuration
REDIS_URL=redis://redis:6379

# Server Configuration
PORT=3000
NODE_ENV=production

# API Security (Optional - for webhooks and API endpoints)
API_SECRET_KEY=your_api_secret_key_for_webhooks_here

# Bot Configuration
BOT_PREFIX=!
MAX_POINTS_PER_MESSAGE=10
POINTS_DECAY_DAYS=90