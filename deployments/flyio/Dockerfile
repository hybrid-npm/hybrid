FROM node:20-bookworm-slim

# Install sudo and gosu for privilege dropping
RUN apt-get update && \
    apt-get install -y sudo gosu && \
    rm -rf /var/lib/apt/lists/*

# Rename the default 'node' user to 'app' and create 'claude' user
# The node:20-bookworm-slim image already has a 'node' user with UID1000
RUN usermod -l app -d /home/app -m node && \
    groupmod -n app node && \
    useradd -m -u 1001 -s /bin/bash claude

# Allow 'app' to run commands as 'claude' without password
RUN echo "app ALL=(claude) NOPASSWD: ALL" > /etc/sudoers.d/app-claude && \
    chmod 440 /etc/sudoers.d/app-claude

WORKDIR /app

# Copy package files and install dependencies
COPY deployments/flyio/package.json package.json
RUN npm install

# Copy built agent code
COPY packages/agent/dist/ ./dist/agent/

# Copy agent docs
COPY packages/cli/templates/agent/AGENTS.md packages/cli/templates/agent/SOUL.md ./

# Create directory structure
# /app/data - persistent runtime data (mounted volume)
# /app/data/secrets - secret files (0700, app:app only — claude CANNOT access)
# /app/data/workspaces - isolated user workspaces (claude can read/write)
RUN mkdir -p /app/data/secrets \
    /app/data/memory/users \
    /app/data/memory/life/projects \
    /app/data/memory/life/areas \
    /app/data/memory/life/resources \
    /app/data/memory/life/archives \
    /app/data/memory/logs \
    /app/data/credentials \
    /app/data/xmtp \
    /app/data/workspaces && \
    chown -R app:app /app/data && \
    chmod 700 /app/data/secrets && \
    # Claude needs read access to /app (code, node_modules) and
    # read-write access to workspaces (where its cwd is set)
    chmod o+rx /app && \
    chmod -R o+rX /app/node_modules /app/dist && \
    chmod -R o+rwX /app/data/workspaces

# Copy privilege-drop wrapper script
COPY deployments/flyio/claude-wrapper.sh /usr/local/bin/claude-wrapper.sh
RUN chmod 755 /usr/local/bin/claude-wrapper.sh

# Copy entrypoint script (runs as root to set up secrets)
COPY deployments/flyio/entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh

ENV AGENT_PORT=4100
ENV DATA_ROOT=/app/data
EXPOSE 4100

# Entrypoint runs as root to set up secrets, then drops to 'app' user
ENTRYPOINT ["/entrypoint.sh"]
CMD ["sh", "-c", "node dist/agent/server/index.cjs & node dist/agent/xmtp.cjs & wait"]