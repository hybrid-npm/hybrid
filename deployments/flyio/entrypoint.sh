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
# NOTE: If you used `fly secrets set AGENT_WALLET_KEY=...`, it will be scrubbed here.
# Use file-based secrets instead: fly ssh console, then write to /app/data/secrets/wallet.key
# Log warning to file (not stdout/stderr) so it doesn't interfere with
# commands run through the entrypoint while still leaving an audit trail.
if [ -n "$AGENT_WALLET_KEY" ]; then
    mkdir -p /app/data/logs
    echo "[$(date -Iseconds)] WARNING: AGENT_WALLET_KEY found in env — scrubbing. Use file-based secrets at $SECRETS_DIR/wallet.key instead." >> /app/data/logs/entrypoint.log 2>/dev/null || true
fi
unset AGENT_WALLET_KEY WALLET_KEY PRIVATE_KEY 2>/dev/null || true

# Ensure workspaces are writable by claude user (volume mount may reset perms)
if [ -d "/app/data/workspaces" ]; then
    chown -R app:app /app/data/workspaces
    chmod -R o+rwX /app/data/workspaces
fi

# Ensure code dirs are readable by claude user
chmod o+rx /app
chmod -R o+rX /app/node_modules /app/dist 2>/dev/null || true

# Use env -u to guarantee secret vars are stripped from the child process
# environment. Plain `unset` removes them from the shell, but Docker-injected
# vars can survive through exec in some runtimes. env -u is belt-and-suspenders.
ENV_STRIP="env -u AGENT_WALLET_KEY -u WALLET_KEY -u PRIVATE_KEY"

# If running as root, drop to 'app' user and execute CMD
if [ "$(id -u)" = "0" ]; then
    exec $ENV_STRIP gosu app "$@"
fi

# Already running as non-root user, just execute
exec $ENV_STRIP "$@"
