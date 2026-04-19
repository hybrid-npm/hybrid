FROM node:20-bookworm-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install --production

# Copy built agent runtime
COPY server/ ./server/

# Copy config files
COPY SOUL.md ./
COPY AGENTS.md ./
COPY IDENTITY.md ./
COPY TOOLS.md ./
COPY BOOT.md ./
COPY BOOTSTRAP.md ./
COPY HEARTBEAT.md ./
COPY USER.md ./

# Copy credentials (owner ACL)
COPY credentials/ ./credentials/ 2>/dev/null || true

# Create data directories
RUN mkdir -p /app/data/secrets \
    /app/data/memory/users \
    /app/data/memory/life/projects \
    /app/data/memory/life/areas \
    /app/data/memory/life/resources \
    /app/data/memory/life/archives \
    /app/data/memory/logs \
    /app/data/workspaces && \
    chown -R node:node /app/data

ENV AGENT_PORT=8454
ENV NODE_ENV=production
ENV DATA_ROOT=/app/data

EXPOSE 8454

USER node
CMD ["node", "server/index.cjs"]
