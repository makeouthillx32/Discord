# Multi-stage build for smaller, stronger image
FROM node:20-alpine AS builder

# Security: Install security updates and build dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init python3 make g++ gcc musl-dev linux-headers libtool autoconf automake && \
    ln -sf python3 /usr/bin/python

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev) with proper build tools
RUN npm install --production=false

# Copy source code
COPY . .

# Production stage
FROM node:20-alpine AS production

# Security updates and essential tools
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl ffmpeg && \
    rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /usr/src/app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S discord -u 1001 -G nodejs

# Copy only production files from builder
COPY --from=builder --chown=discord:nodejs /usr/src/app/node_modules ./node_modules
COPY --chown=discord:nodejs package*.json ./
COPY --chown=discord:nodejs *.js ./

# Copy ALL directories at once (SIMPLER APPROACH)
COPY --chown=discord:nodejs . .

# DEBUG: List what we actually copied
RUN echo "=== DEBUG: What's in the container ===" && \
    ls -la /usr/src/app/ && \
    echo "=== handlers directory ===" && \
    ls -la /usr/src/app/handlers/ || echo "handlers directory not found" && \
    echo "=== handlers/events directory ===" && \
    ls -la /usr/src/app/handlers/events/ || echo "handlers/events directory not found" && \
    echo "=== END DEBUG ==="

# Create commands directory structure at build time (in case some folders are missing)
RUN mkdir -p commands/admin commands/fun commands/social commands/utility commands/custom commands/entertainment

# Create handlers directory structure at build time
RUN mkdir -p handlers/events handlers/maintenance

# Security: Remove write permissions from app files (but keep commands readable)
RUN chmod -R 555 /usr/src/app && \
    chmod -R 755 /usr/src/app/node_modules

# Switch to non-root user
USER discord

# Expose port
EXPOSE 3000

# Environment variables for optimization (FIXED NODE_OPTIONS)
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

# Health check with better configuration
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node healthcheck.js || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the bot with optimized settings
CMD ["node", "index.js"]