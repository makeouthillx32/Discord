# Makefile for Discord Bot
.PHONY: build run stop clean logs shell security-scan

# Default environment
ENV_FILE ?= .env

# Build the strong image
build:
	@echo "🔨 Building STRONG Discord bot image..."
	docker-compose build --no-cache --parallel

# Run everything
run:
	@echo "🚀 Starting Discord bot cluster..."
	docker-compose up -d

# Stop everything
stop:
	@echo "🛑 Stopping Discord bot cluster..."
	docker-compose down

# Clean everything (DANGEROUS - removes volumes)
clean:
	@echo "🧹 Cleaning everything..."
	docker-compose down -v --remove-orphans
	docker system prune -af

# View logs
logs:
	docker-compose logs -f

# Get shell in bot container
shell:
	docker-compose exec discord-bot-1 sh

# Security scan
security-scan:
	@echo "🔍 Running security scan..."
	docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
		-v $(PWD):/root/.cache/ aquasec/trivy image discord-bot

# Performance test
load-test:
	@echo "⚡ Running load test..."
	docker run --rm --network host \
		-v $(PWD)/loadtest.js:/loadtest.js \
		node:18-alpine node /loadtest.js

# Health check all services
health:
	@echo "❤️ Checking health of all services..."
	@curl -s http://localhost:3001/health | jq .
	@curl -s http://localhost:3002/health | jq .
	@curl -s http://localhost:3003/health | jq .
	@curl -s http://localhost/health | jq .

# Scale up
scale-up:
	@echo "📈 Scaling up bot instances..."
	docker-compose up -d --scale discord-bot-1=2 --scale discord-bot-2=2

# Scale down
scale-down:
	@echo "📉 Scaling down bot instances..."
	docker-compose up -d --scale discord-bot-1=1 --scale discord-bot-2=1

# Update bot (rolling update)
update:
	@echo "🔄 Performing rolling update..."
	docker-compose build discord-bot-1
	docker-compose up -d --no-deps discord-bot-1
	sleep 10
	docker-compose build discord-bot-2
	docker-compose up -d --no-deps discord-bot-2
	sleep 10
	docker-compose build discord-bot-3
	docker-compose up -d --no-deps discord-bot-3

# Backup Redis data
backup:
	@echo "💾 Backing up Redis data..."
	docker-compose exec redis redis-cli BGSAVE
	docker cp $$(docker-compose ps -q redis):/data/dump.rdb ./backup-$$(date +%Y%m%d_%H%M%S).rdb

# Monitor resources
monitor:
	@echo "📊 Resource monitoring..."
	docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"

# Quick deploy (build + run)
deploy: build run
	@echo "✅ Bot deployed successfully!"
	@echo "🔗 Health check: http://localhost/health"
	@echo "📊 Monitoring: http://localhost:9090"

# Production deployment
prod-deploy:
	@echo "🏭 Production deployment..."
	@if [ ! -f .env.prod ]; then echo "❌ .env.prod not found!"; exit 1; fi
	ENV_FILE=.env.prod docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build