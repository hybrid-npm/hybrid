# Hybrid

**A Firecracker-based AI agent framework built around Pi.**

Hybrid gives you AI agents that **sleep when idle and wake on demand**. Drop in your Pi-powered agent code, deploy to a Firecracker microVM provider, and pay only for compute when your agent is actually working.

## Why Hybrid

Traditional agent frameworks run 24/7, burning cash while waiting for the next message. Hybrid fixes that:

- **Sleep/wake agents** — Firecracker microVMs pause when idle, wake in seconds on incoming messages
- **Pi-powered** — Built around the Pi agent runtime with full tool/skill support
- **Multi-provider** — Deploy to sprites, E2B, Northflank, or Daytona — pick your provider at deploy time
- **Structured memory** — PARA knowledge graph with decay tiers, daily logs, and hybrid vector+keyword search
- **Agentic scheduler** — Cron, interval, and one-time jobs that deliver via channel adapters

## Quickstart

```bash
npm create hybrid my-agent
cd my-agent
cp .env.example .env   # fill in your API key
hybrid dev
```

## Deployment

Hybrid agents run on **Firecracker microVMs**. You pick the provider at deploy time via `hybrid deploy [platform]`:

| Provider | Sleep | Wake | Best For |
|----------|-------|------|----------|
| `sprites` | `sprite sleep` | Near-instant (< 2s) | Reference implementation |
| `e2b` | `sandbox.pause()` | Near-instant | Best dev experience after sprites |
| `northflank` | Auto-scale to 0 | On request (~5-15s) | Production-grade |
| `daytona` | `daytona stop` | ~30s | Dev environments |

### Deploy an Agent

```bash
# Deploy to sprites (default)
hybrid deploy

# Deploy to a specific provider
hybrid deploy sprites
hybrid deploy e2b
hybrid deploy northflank

# Control running agents
hybrid deploy sleep my-agent
hybrid deploy wake my-agent
hybrid deploy status my-agent
hybrid deploy logs my-agent --follow
hybrid deploy teardown my-agent
```

### Configuration

Pre-select your provider in `hybrid.config.ts`:

```typescript
export const config = {
  deploy: {
    platform: "sprites",    // default provider
    spriteName: "my-agent", // optional instance name
  }
}
```

All providers implement a uniform `DeployProvider` interface — provision, deploy, sleep, wake, logs, status, and teardown work the same way regardless of platform.

## Architecture

```
                     Incoming Message
                           │
                           ▼
              ┌────────────────────────┐
              │   Webhook Gateway      │
              │   (proxy/forwarder)    │
              └────────┬───────────────┘
                       │
                       ▼              if sleeping:
            ┌────────────────────┐    ┌──────────────┐
            │  Firecracker VM    │◄───┤  wake()      │
            │  ┌──────────────┐  │    └──────────────┘
            │  │ Agent Server │  │
            │  │ (port 8454)  │  │
            │  └──────────────┘  │
            └────────────────────┘
                       │
              idle timeout → sleep()
```

### Project Structure

```
my-agent/
├── package.json                 # Project dependencies
├── SOUL.md                      # Agent personality & identity
├── AGENTS.md                    # Workspace rules & memory system
├── .env.example                 # Environment template
├── skills/                      # Installed skills (SKILL.md files)
└── memory/                      # Agent memory (life/, logs/, MEMORY.md)
```

### Key Template Files

| File | Purpose |
|------|---------|
| `SOUL.md` | Agent personality, principles, and behavior style |
| `IDENTITY.md` | Name, creature type, vibe, emoji, avatar |
| `USER.md` | Human profile — name, preferences, context |
| `AGENTS.md` | Workspace rules, memory system, group chat behavior |
| `TOOLS.md` | Local notes — tool-specific configuration |
| `BOOTSTRAP.md` | First-run onboarding guide (deleted after setup) |
| `HEARTBEAT.md` | Periodic task checklist for proactive behavior |

## Memory

Hybrid has a 3-layer memory system, all indexed into SQLite for unified search:

### Layer 1 — PARA Knowledge Graph

Structured entity storage inspired by the PARA method. The agent creates named entities across four buckets — `projects`, `areas`, `resources`, `archives` — and attaches atomic facts with decay tiers:

```
memory/life/
  areas/people/Alice/
    items.json     ← all facts, including superseded ones
    summary.md     ← hot + warm facts only (for search indexing)
```

Decay tiers are computed automatically based on access patterns:

| Tier | Condition |
|------|-----------|
| Hot | Accessed in last 7 days, or 5+ accesses in 14 days |
| Warm | Accessed in last 30 days, or 10+ total accesses |
| Cold | Not accessed in 30+ days (excluded from search, never deleted) |

### Layer 2 — Daily Log

An append-only chronological log. Each day gets its own file:

```
memory/logs/2026-03-02.md
```

Entries tagged `[FACT]`, `[DECISION]`, or `[ACTION]` — never rewritten.

### Layer 3 — Auto Memory

A structured `MEMORY.md` with five sections: **User Preferences**, **Learnings**, **Decisions**, **Context**, **Notes**. The agent appends dated bullets as it learns.

### Search

Vector search (semantic, via sqlite-vec) and BM25 keyword search run in parallel, merged with a 70/30 weighting. Falls back to keyword-only if no embedding provider is configured.

## Scheduler

The scheduler lets agents schedule future actions for themselves:

```typescript
{ kind: "at", at: "2026-03-15T09:00:00Z" }           // One-time
{ kind: "every", everyMs: 3_600_000 }                // Every hour
{ kind: "cron", expr: "0 9 * * 1-5", tz: "America/New_York" }  // Weekdays at 9am
```

Jobs fire via precise `setTimeout` — no polling loop. Failed jobs back off exponentially. Stuck jobs (running > 2 hours) auto-unstick on restart.

## Agent Server

The agent runs on port 8454 as a Hono HTTP server that accepts chat requests and streams SSE responses:

```bash
# Development
hybrid dev

# Build for Firecracker deployment
hybrid build

# Deploy
hybrid deploy sprites
```

## Packages

| Package | Description |
|---------|-------------|
| [`hybrid/agent`](./packages/agent/README.md) | Agent runtime: Hono HTTP server with Pi-powered agent |
| [`hybrid/gateway`](./packages/gateway/README.md) | Cloudflare Workers gateway (deprecated) |
| [`@hybrd/memory`](./packages/memory/README.md) | 3-layer PARA memory, hybrid search |
| [`@hybrd/scheduler`](./packages/scheduler/README.md) | Agentic cron/interval/one-time scheduler |
| [`@hybrd/channels`](./packages/channels/README.md) | Channel adapter framework (Telegram, Slack, ...) |
| [`@hybrd/cli`](./packages/cli/README.md) | `hybrid` CLI: build, dev, deploy, skills |
| [`@hybrd/types`](./packages/types/README.md) | Shared TypeScript type definitions |
| [`@hybrd/utils`](./packages/utils/README.md) | Shared utilities |
| [`create-hybrid`](./packages/create-hybrid/README.md) | Project scaffolding (`npm create hybrid`) |

## Monorepo Development

```bash
pnpm install
pnpm build      # Build all packages
pnpm test       # Run tests
pnpm lint       # Lint (biome)
pnpm typecheck  # Type check
```

## License

MIT
