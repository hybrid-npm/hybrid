# ============================================================================
# Makefile - Convenience commands for Sprites platform
# ============================================================================

.PHONY: help install dev dev:agent build test docker-build docker-up docker-down clean lint format

# Colors
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[0;33m
BLUE := \033[0;34m
NC := \033[0m # No Color

# Default target
help:
	@echo ""
	@echo "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
	@echo "${BLUE}║               SPRITES PLATFORM - COMMANDS                   ║${NC}"
	@echo "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
	@echo ""
	@echo "${GREEN}Development:${NC}"
	@echo "  make install        Install dependencies"
	@echo "  make dev           Start vault in development mode"
	@echo "  make dev:agent     Start agent in development mode"
	@echo "  make build         Build TypeScript"
	@echo ""
	@echo "${GREEN}Testing:${NC}"
	@echo "  make test          Run unit tests"
	@echo "  make test:watch    Run tests in watch mode"
	@echo "  make test:coverage Run tests with coverage"
	@echo ""
	@echo "${GREEN}Docker:${NC}"
	@echo "  make docker-build  Build Docker images"
	@echo "  make docker-up    Start services with docker-compose"
	@echo "  make docker-down  Stop Docker services"
	@echo "  make docker-logs  View Docker logs"
	@echo ""
	@echo "${GREEN}Code Quality:${NC}"
	@echo "  make lint         Run ESLint"
	@echo "  make format       Format code with Prettier"
	@echo ""
	@echo "${GREEN}Utilities:${NC}"
	@echo "  make clean        Clean build artifacts"
	@echo "  make cli          Run CLI client"
	@echo "  make provision   Run provisioning script"
	@echo ""
	@echo "${GREEN}Environment:${NC}"
	@echo "  VAULT_URL         Vault URL (default: http://localhost:8080)"
	@echo "  FLY_ORG           Fly organization slug"
	@echo ""

# ============================================================================
# Development
# ============================================================================

install:
	@echo "${GREEN}Installing dependencies...${NC}"
	npm install

dev:
	@echo "${GREEN}Starting vault in development mode...${NC}"
	@echo "${YELLOW}Press Ctrl+C to stop${NC}"
	npx tsx src/vault/vault-service.ts

dev:agent:
	@echo "${GREEN}Starting agent in development mode...${NC}"
	@echo "${YELLOW}Make sure VAULT_URL is set${NC}"
	@echo "${YELLOW}Press Ctrl+C to stop${NC}"
	npx tsx src/agent/agent.ts

build:
	@echo "${GREEN}Building TypeScript...${NC}"
	npm run build

# ============================================================================
# Testing
# ============================================================================

test:
	@echo "${GREEN}Running tests...${NC}"
	npx vitest run

test:watch:
	@echo "${GREEN}Running tests in watch mode...${NC}"
	npx vitest

test:coverage:
	@echo "${GREEN}Running tests with coverage...${NC}"
	npx vitest run --coverage

# ============================================================================
# Docker
# ============================================================================

docker-build:
	@echo "${GREEN}Building Docker images...${NC}"
	docker build -t hybrid/vault:latest -f Dockerfile.vault .
	docker build -t hybrid/agent:latest -f Dockerfile.agent .
	@echo "${GREEN}Built: hybrid/vault:latest${NC}"
	@echo "${GREEN}Built: hybrid/agent:latest${NC}"

docker-up:
	@echo "${GREEN}Starting Docker services...${NC}"
	docker-compose up -d
	@echo "${GREEN}Services started!${NC}"
	@echo "${YELLOW}Vault:   http://localhost:8080${NC}"
	@echo "${YELLOW}Agent:   http://localhost:3000${NC}"

docker-down:
	@echo "${GREEN}Stopping Docker services...${NC}"
	docker-compose down

docker-logs:
	docker-compose logs -f

# ============================================================================
# Code Quality
# ============================================================================

lint:
	@echo "${GREEN}Running linter...${NC}"
	npm run lint || echo "${YELLOW}Linting not configured${NC}"

format:
	@echo "${GREEN}Formatting code...${NC}"
	npm run format || echo "${YELLOW}Formatting not configured${NC}"

# ============================================================================
# Utilities
# ============================================================================

clean:
	@echo "${GREEN}Cleaning build artifacts...${NC}"
	rm -rf dist coverage node_modules
	rm -f *.log
	@echo "${GREEN}Clean!${NC}"

cli:
	@echo "${GREEN}Running CLI client...${NC}"
	npx tsx src/client.ts

provision:
	@echo "${GREEN}Running provision script...${NC}"
	@echo "${YELLOW}Usage: make provision USER=123 SIG=0xabc...${NC}"
	@if [ -z "$(USER)" ]; then \
		echo "${RED}Error: USER is required${NC}"; \
		echo "Usage: make provision USER=user123 SIG=0x..."; \
		exit 1; \
	fi
	@if [ -z "$(SIG)" ]; then \
		echo "${RED}Error: SIG is required${NC}"; \
		echo "Usage: make provision USER=user123 SIG=0x..."; \
		exit 1; \
	fi
	npx tsx src/shared/provision.ts provision $(USER) $(SIG)

# Default make command
.DEFAULT_GOAL := help
