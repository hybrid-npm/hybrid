#!/bin/bash
# entrypoint.sh
# Entrypoint script for hybrid-agent
#
# This script runs as ROOT and:
# 1. Ensures /app/data/secrets/ has correct permissions on the persistent volume
# 2. Drops privileges to 'app' user
# 3. Executes the command
#
# Secret files (wallet.key, agent.key) live on the persistent volume
# at /app/data/secrets/ and are provisioned once via `fly ssh console`.
# No environment variables are used for secrets.

set -e

# Ensure secrets directory exists on persistent volume with correct permissions
SECRETS_DIR="/app/data/secrets"
if [ ! -d "$SECRETS_DIR" ]; then
    mkdir -p "$SECRETS_DIR"
fi
chmod 700 "$SECRETS_DIR"
chown app:app "$SECRETS_DIR"

# Lock down any secret files present
if ls "$SECRETS_DIR"/*.key 1>/dev/null 2>&1; then
    chmod 400 "$SECRETS_DIR"/*.key
    chown app:app "$SECRETS_DIR"/*.key
fi

# Scrub any secret-related env vars that may have leaked in
unset AGENT_WALLET_KEY AGENT_SECRET WALLET_KEY PRIVATE_KEY 2>/dev/null || true

# Ensure workspaces are writable by claude user (volume mount may reset perms)
if [ -d "/app/workspaces" ]; then
    chown -R app:app /app/workspaces
    chmod -R o+rwX /app/workspaces
fi

# Ensure code dirs are readable by claude user
chmod o+rx /app
chmod -R o+rX /app/node_modules /app/dist 2>/dev/null || true

# If running as root, drop to 'app' user and execute CMD
if [ "$(id -u)" = "0" ]; then
    exec gosu app "$@"
fi

# Already running as non-root user, just execute
exec "$@"