# Agent on Sprites (Firecracker microVMs)

An agent deployment target for Hybrid, running on Fly.io Sprites (Firecracker microVMs) that **sleep when idle and wake on demand**.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            YOUR PLATFORM                                │
│                                                                         │
│  ┌─────────────────┐    ┌──────────────────────────────────────────┐   │
│  │  Orchestration  │    │         User Dashboard                   │   │
│  │  • Create VMs   │    │  • View agent activity                   │   │
│  │  • List VMs     │    │  • Configure settings                    │   │
│  │  • Sleep/Wake   │    │  • Deploy updates                        │   │
│  └────────┬────────┘    └──────────────────┬───────────────────────┘   │
│           │                                │                           │
└───────────│────────────────────────────────│───────────────────────────┘
            │                                │
            │    SPRITES API                 │
            ▼                                ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                      AGENT SPRITE                                │
    │                    (per-user/per-agent)                          │
    │                                                                   │
    │   ┌─────────────────────────────────────────────────────────┐    │
    │   │                     Hybrid Agent                        │    │
    │   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │    │
    │   │  │  SOUL.md    │  │  MEMORY.md  │  │   Skills    │    │    │
    │   │  │  IDENTITY   │  │  PARA Graph │  │  SKILL.md   │    │    │
    │   │  └─────────────┘  └─────────────┘  └─────────────┘    │    │
    │   │                                                         │    │
    │   │  Agent Server (port 8454)                               │    │
    │   │  POST /api/chat → SSE stream                            │    │
    │   │  GET  /health    → health check                         │    │
    │   │                                                         │    │
    │   │  /home/sprite/agent/                                    │    │
    │   │  ├── workspace/                                         │    │
    │   │  ├── sessions/                                          │    │
    │   │  ├── memory/                                            │    │
    │   │  └── ...                                                 │    │
    │   └─────────────────────────────────────────────────────────┘    │
    │                                                                   │
    └─────────────────────────────────────────────────────────────────┘
```

## Sleep/Wake Model

Sprites provide a natural serverless model for AI agents:

| State | Description | Cost |
|-------|-------------|------|
| **Running** | Agent handles requests normally | Standard compute |
| **Sleeping** | VM paused, state preserved in memory | Minimal (storage only) |
| **Waking** | Triggered by incoming message via proxy | ~2s cold start |

```
Message arrives → Proxy wakes VM → Agent responds → Idle timeout → Sleep
```

## Security Model

### Isolation

Each agent runs in its own isolated Firecracker microVM:
- Separate filesystem per agent
- No cross-agent access
- Sleep state preserves memory contents

### VM Lifecycle

```
┌──────────┐   sleep    ┌──────────┐   message    ┌──────────┐
│ Running  │───────────►│ Sleeping │──────────────►│ Running  │
│          │            │          │  (auto-wake) │          │
│  Active  │            │  Paused  │              │  Active  │
└──────────┘            └──────────┘              └──────────┘
```

## Data Flow

### Agent Deployment

```
1. Build agent bundle (hybrid build)
2. Provision VM sprite (sprite create)
3. Deploy artifacts (sprite exec + tar upload)
4. Agent starts listening on port 8454
```

### Message Handling

```
Client → Webhook Proxy → Wake VM (if asleep) → Forward to agent:8454
                                                         │
                                                    SSE response
                                                         │
                                                    ← Client
```

### Cold Start

A sleeping VM wakes automatically when a message arrives via `sprite exec` proxy. The agent restores from preserved memory state — no re-authentication needed.

## API Reference

### Sprite CLI Commands

| Operation | Command |
|-----------|---------|
| auth check | `sprite list` (fails if not installed/authed) |
| provision | `sprite create -skip-console <name>` |
| deploy | `sprite exec -s <name> -file <tar>:/tmp/...` → extract |
| status | `sprite list` → parse state |
| sleep | `sprite sleep <name>` |
| wake | `sprite exec -s <name> -- echo` (proxy wakes VM) |
| logs | `sprite logs -s <name> -f` |
| endpoint | `https://<name>.sprites.dev` |
| teardown | `sprite delete <name>` |

## Quick Start

### 1. Install Dependencies

```bash
cd specs/sprites
npm install
```

### 2. Set Environment

```bash
export SPRITES_TOKEN=your-sprites-token
export FLY_ORG=your-org
```

### 3. Run Locally (Development)

```bash
# Terminal 1: Start agent server
npm run dev

# Terminal 2: Test agent
curl http://localhost:8080/health
curl -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}],"chatId":"test-1"}'
```

### 4. Run Tests

```bash
# Unit tests
npm test
```

## Deployment

### Deploy via Hybrid CLI

```bash
hybrid deploy sprites
```

### Manual Deploy

```bash
# Build
hybrid build

# Deploy to sprites
sprite create my-agent
sprite exec -s my-agent -file dist/agent.tar:/tmp/agent.tar
```

## Cost

Sprites sleep when idle, so you only pay when agents are actively working:

| Usage | Cost (per agent) |
|-------|-----------------|
| 4 hrs/day | ~$0.23 |
| 8 hrs/day | ~$0.46 |
| 24 hrs/day | ~$1.38 |
| **Monthly** | **$9-52** depending on usage |

Compare to running 24/7 on traditional VMs — agents that sleep 80% of the time save **~80% on compute costs**.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VAULT_URL` | Vault Sprite URL | Yes (if using vault) |
| `USER_ID` | User identifier | Yes |
| `PORT` | Agent server port | No (default: 8454) |

## Troubleshooting

### Agent not responding

**Solution**: Check if VM is sleeping. Wake manually: `hybrid deploy wake my-agent`

### Can't reach agent

**Solution**: Check `VAULT_URL` is correct and agent Sprite is running.

### Keys lost after restart

This is **expected** — cold start preserves state from preserved memory. Agent restores automatically on wake.

## Related

- [Firecracker Deploy Spec](../cli-deploy-firecracker/SPEC.md) — Full provider interface and implementation plan
- [Hybrid CLI](../../packages/cli/README.md) — `hybrid deploy` command docs

## License

MIT
