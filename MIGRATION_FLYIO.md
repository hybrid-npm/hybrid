# Cloudflare Containers → Fly.io Migration

## Current State

- **Agent**: `agent/Dockerfile` - Node.js app using `@xmtp/agent-sdk`, hono, @anthropic-ai/claude-code
- **Currently deployed**: Cloudflare Workers + Containers
- **Architecture**: Gateway (Worker) + Server (Container) + Sidecar (XMTP)

## Completed Setup

- Added `opencode.json` with Fly.io MCP server config for OpenCode
- Created `specs/sprites/` with full Sprites architecture:
  - Vault Service (`src/vault/vault-service.ts`) - Zero-knowledge encryption
  - Agent Storage (`src/agent/agent-storage.ts`) - Encrypted storage wrapper
  - Agent Entry (`src/agent/agent.ts`) - Example agent implementation
  - Provision Script (`src/shared/provision.ts`) - User onboarding
  - XMTP Integration (`src/shared/xmtp.ts`) - XMTP messaging
  - Sprites Client (`src/shared/sprites-client.ts`) - Sprites SDK wrapper
- Installed `@fly/sprites` SDK

## Next Steps

### Option A: Fly Machines (Already Deployed)

```bash
# Deploy to Fly Machines (already set up)
fly deploy --depot=false

# Set secrets
fly secrets set AGENT_WALLET_KEY=xxx AGENT_SECRET=xxx XMTP_ENV=production OPENROUTER_API_KEY=xxx
```

### Option B: Sprites (Recommended)

Sprites provide:
- Instant wake (1-2s vs 30s+ for containers)
- Auto-sleep when idle (no cost when not in use)
- Persistent storage built-in (100GB)
- Pre-installed Node.js, Claude Code, etc.
- Checkpoint/restore capability

```bash
# Install Sprites CLI
curl https://sprites.dev/install.sh | bash

# Login
sprite login

# Create a sprite pair for your agent
sprite create hybrid-agent
sprite create hybrid-vault

# Or use the SDK
SPRITES_TOKEN=xxx npx tsx specs/sprites/src/shared/provision.ts provision user-123 "0xsignature..."
```

### Environment Variables

For Sprites, set via environment or pass via SDK:

- `SPRITES_TOKEN` - Required for Sprites API (get from `fly tokens org`)
- `VAULT_URL` - Set to your vault sprite URL (e.g., `https://vault-user.sprites.app`)
- Agent variables passed via Sprites environment config

### MCP Tools Available

Once the MCP server is configured, you can ask OpenCode/Claude to:
- `fly-apps-list` - List Fly apps
- `fly-machines-list` - List machines
- `fly-secrets` - Manage secrets
- `fly-logs` - View logs

## Architecture Decision

### Use Fly Machines when:
- Need persistent always-on service
- Require full control over deployment
- Have steady traffic

### Use Sprites when:
- Want instant cold starts
- Want automatic sleep/wake (cost savings)
- Need persistent storage without volumes
- Running AI agents (pre-installed tools)
- Want checkpoint/restore capability

## Files Created/Modified

- `fly.toml` - Fly Machines config
- `agent/Dockerfile` - Updated for Fly.io
- `specs/sprites/src/shared/sprites-client.ts` - New: Sprites SDK wrapper
- `specs/sprites/package.json` - Added @fly/sprites dependency
- `opencode.json` - Fly MCP config
