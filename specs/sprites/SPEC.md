# Sprites Architecture Specification

## Overview

Hybrid agents deploy to **Fly.io Sprites** (Firecracker microVMs) that sleep when idle and wake on demand. The agent runs inside the Sprite with full filesystem access and is woken automatically by a proxy when incoming messages arrive.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         YOUR PLATFORM                           │
│                                                                 │
│  ┌─────────────────┐    ┌──────────────────────────────────┐   │
│  │  Orchestration  │    │         User Dashboard           │   │
│  │  • Create VMs   │    │  • View agent activity           │   │
│  │  • List VMs     │    │  • Configure settings            │   │
│  │  • Sleep/Wake   │    │  • Manage lifecycle              │   │
│  └────────┬────────┘    └──────────────┬───────────────────┘   │
│           │                            │                       │
└───────────│────────────────────────────│───────────────────────┘
            │                            │
            │    SPRITES API             │
            ▼                            ▼
    ┌─────────────────────────────────────────────────────────┐
    │                      AGENT SPRITE                        │
    │                    (per-user/per-agent)                   │
    │                                                           │
    │   ┌─────────────────────────────────────────────────┐    │
    │   │                     Hybrid Agent                 │    │
    │   │  ┌───────────┐  ┌───────────┐  ┌─────────────┐ │    │
    │   │  │ SOUL.md   │  │ MEMORY.md │  │   Skills    │ │    │
    │   │  │ IDENTITY  │  │ PARA Graph│  │  SKILL.md   │ │    │
    │   │  └───────────┘  └───────────┘  └─────────────┘ │    │
    │   │                                                  │    │
    │   │  Agent Server (port 8454)                       │    │
    │   │  POST /api/chat → SSE stream                    │    │
    │   │  GET  /health    → health check                 │    │
    │   │                                                  │    │
    │   │  /home/sprite/agent/                             │    │
    │   │  ├── workspace/                                  │    │
    │   │  ├── sessions/                                   │    │
    │   │  ├── memory/                                     │    │
    │   │  └── ...                                          │    │
    │   └─────────────────────────────────────────────────┘    │
    │                                                           │
    └─────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

### Deployment

```
1. Build agent bundle (hybrid build)
   ┌────────────────┐     ┌────────────────┐     ┌──────────────────┐
   │  Local dev     │────►│  hybrid build  │────►│  dist/           │
   │                │     │                │     │  (agent bundle)  │
   └────────────────┘     └────────────────┘     └──────────────────┘

2. Provision Sprite
   ┌────────────────┐     ┌────────────────┐
   │  hybrid deploy  │────►│  sprite create  │──►  Agent Sprite created
   │  sprites       │     │  -skip-console  │
   └────────────────┘     └────────────────┘

3. Deploy artifacts
   ┌────────────────┐     ┌────────────────┐
   │  tar upload     │────►│  sprite exec    │──►  Agent starts on :8454
   │  + extract      │     │  -file          │
   └────────────────┘     └────────────────┘
```

### Agent Operation

```
Client → Webhook Proxy → sprite exec (wakes VM if asleep) → Agent :8454
                                                                    │
                                                               SSE response
                                                                    │
                                                               ← Client

After idle timeout: sprite sleep
```

### Cold Start

```
1. HTTP request arrives at proxy endpoint
2. Agent Sprite wakes (sprite exec triggers cold start, ~2s)
3. Proxy forwards request to agent:8454
4. Agent processes request and streams SSE response
5. After idle timeout, Sprite sleeps again
```

## Security Architecture

### Isolation

Each agent runs in its own isolated Firecracker microVM:
- Separate filesystem per agent
- No cross-agent access
- Sleep state preserves memory contents (VM RAM frozen)

```
┌────────────────────────────────────────────────────────────────────┐
│                       SECURITY MODEL                               │
│                                                                    │
│  ATTACK SURFACE:                                                  │
│                                                                    │
│  ┌────────────────────────┐    ┌─────────────────────────────┐    │
│  │     YOUR PLATFORM      │    │      SPRITES INFRASTRUCTURE   │    │
│  │                        │    │                               │    │
│  │  ┌──────────┐          │    │  ┌─────────────┐              │    │
│  │  │Database   │         │    │  │Agent Sprite │              │    │
│  │  │(metadata) │         │    │  │(user data)  │              │    │
│  │  └────┬─────┘         │    │  └──────┬──────┘              │    │
│  │       │                │    │         │                      │    │
│  │       ▼                │    │         ▼                      │    │
│  │  CAN SEE: User IDs    │    │  CAN SEE: Files, memory       │    │
│  │  CANNOT SEE: Agent    │    │  CANNOT SEE: Other agents     │    │
│  │  data                 │    │                               │    │
│  └────────────────────────┘    └─────────────────────────────┘    │
│                                                                    │
│  THREATS PROTECTED AGAINST:                                       │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                                                            │   │
│  │  1. Platform operator reading agent data                   │   │
│  │     └─► Each Sprite is an isolated VM                      │   │
│  │                                                            │   │
│  │  2. Cross-agent data access                                │   │
│  │     └─► Firecracker provides strong isolation              │   │
│  │                                                            │   │
│  │  3. Disk compromise                                        │   │
│  │     └─► VM memory frozen during sleep, no shared disk      │   │
│  │                                                            │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## Components

### Agent Sprite

The AI agent execution environment with full filesystem access.

**Location**: `/home/sprite/agent/`

**Responsibilities**:
- Run Hybrid agent (Claude Code SDK / Pi agent)
- Manage user workspace files
- Maintain memory (PARA graph, daily logs, auto-memory)
- Handle scheduled jobs

**Filesystem**:
```
/home/sprite/agent/
├── workspace/         # User's working files
├── sessions/          # Session data
├── memory/            # PARA memory + daily logs
├── .hybrid/skills/    # Built-in + installed skills
├── SOUL.md            # Agent personality
├── AGENTS.md          # Workspace rules
└── start.sh           # Startup script
```

### Scheduler

SQLite-backed scheduler running inside the agent process:
- Cron, interval, and one-time jobs
- Precise timer (no polling)
- Survives sleep/wake cycles

## VM Lifecycle

```
┌──────────┐   sleep    ┌──────────┐   message    ┌──────────┐
│ Running  │───────────►│ Sleeping │──────────────►│ Running  │
│          │            │          │  (auto-wake) │          │
│  Active  │            │  Paused  │              │  Active  │
└──────────┘            └──────────┘              └──────────┘
    │                                                │
    │  < idle timeout                                │  ~2s wake
    │  sprite sleep                                  │  sprite exec
```

## Agent State

| State | Preserved During Sleep? | How |
|-------|------------------------|-----|
| Filesystem | ✅ Yes | VM memory is frozen |
| Memory state | ✅ Yes | VM pause preserves RAM |
| Network connections | ❌ No | Restarted on wake |
| Scheduler jobs | ✅ Yes | SQLite persisted |

## Cost Estimation

Sprites sleep when idle, so you only pay when agents are actively working:

| Resource | Rate (per Sprite-hr) |
|----------|---------------------|
| CPU | $0.07/CPU-hr |
| Memory | $0.04375/GB-hr |
| Storage | $0.000027/GB-hr |

| Usage | Cost (per agent) |
|-------|-----------------|
| 4 hrs/day | ~$0.23 |
| 8 hrs/day | ~$0.46 |
| 24 hrs/day | ~$1.38 |
| **Monthly** | **$9-52** depending on usage |

Compare to running 24/7 on traditional VMs — agents that sleep 80% of the time save **~80% on compute costs**.

## Deployment

### Creating Agent Sprites

```typescript
async function deployAgent(name: string, distDir: string) {
  // 1. Create Agent Sprite
  const sprite = await sprites.create(name);
  
  // 2. Deploy built artifacts
  const tarball = await createTarball(distDir);
  await sprite.exec(tarball, '/tmp/agent.tar');
  await sprite.exec('tar -xf /tmp/agent.tar -C /home/sprite/agent/');
  
  // 3. Start agent server
  await sprite.exec('sh /home/sprite/agent/start.sh');
  
  return { sprite, endpoint: `https://${name}.sprites.dev` };
}
```

### Service Startup

Agent starts and listens on port 8454:

```bash
# Agent server
node dist/server/index.cjs
```

## Related

- [CLI Deploy Firecracker Spec](../cli-deploy-firecracker/SPEC.md) — Full provider interface
