FROM node:20-bookworm-slim

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --production

# Copy source
COPY agent-storage.ts agent.ts ./

# Create directories for agent data
RUN mkdir -p /home/sprite/agent/data && \
    mkdir -p /home/sprite/agent/workspace

# Create service user
RUN useradd -m -s /bin/bash sprite && \
    chown -R sprite:sprite /app && \
    chown -R sprite:sprite /home/sprite/agent

USER sprite

# Environment variables (set at runtime)
ENV VAULT_URL=""
ENV USER_ID=""

WORKDIR /home/sprite/agent

CMD ["node", "/app/agent.ts"]
