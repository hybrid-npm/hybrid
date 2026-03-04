#!/bin/bash
# entrypoint.sh
# Entrypoint script for hybrid-agent
# 
# This script runs as ROOT and:
# 1. Creates /secrets/ directory with proper permissions
# 2. Injects secrets from environment variables into files
# 3. Sets proper permissions on secret files (0400, owned by app)
# 4. Unsets environment variables
# 5. Drops privileges to 'app' user
# 6. Executes the command

set -e

# Create secrets directory if it doesn't exist
if [ ! -d "/secrets" ]; then
    mkdir -p /secrets
    chmod 700 /secrets
    chown app:app /secrets
fi

# Inject wallet key if provided via environment
if [ -n "$AGENT_WALLET_KEY" ]; then
    echo "$AGENT_WALLET_KEY" > /secrets/wallet.key
    chmod 400 /secrets/wallet.key
    chown app:app /secrets/wallet.key
    unset AGENT_WALLET_KEY
    echo "[entrypoint] Wallet key injected and secured"
fi

# Inject agent secret if provided via environment
if [ -n "$AGENT_SECRET" ]; then
    echo "$AGENT_SECRET" > /secrets/agent.key
    chmod 400 /secrets/agent.key
    chown app:app /secrets/agent.key
    unset AGENT_SECRET
    echo "[entrypoint] Agent secret injected and secured"
fi

# Verify secrets directory permissions
chmod 700 /secrets
chown app:app /secrets

# If running as root, drop to 'app' user and execute CMD
if [ "$(id -u)" = "0" ]; then
    exec gosu app "$@"
fi

# Already running as non-root user, just execute
exec "$@"