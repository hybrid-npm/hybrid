---
name: hybrid-architecture
description: Deep knowledge of Hybrid's agent runtime architecture, including agent server, XMTP sidecar, memory system, scheduler, and channel adapters. Use when working on core agent infrastructure, understanding data flow, or debugging system-level issues.
---

# Hybrid Architecture

Hybrid is a TypeScript agent runtime with 100% OpenClaw feature parity plus XMTP messaging, PARA memory, and multi-user ACL.

## System Overview

```
                     XMTP network • HTTP • Scheduler callbacks
                                       │
                                       ▼
                     ┌─────────────────────────────────┐
                     │       Channel Adapters           │
                     │  @hybrd/channels  (port 8455)    │
                     │  XMTP adapter → HTTP IPC         │
                     └─────────────────────────────────┘
                                       │
                                       ▼
                     ┌─────────────────────────────────┐
                     │        Agent Server              │
                     │  hybrid/agent  (port 8454)       │
                     │                                  │
                     │  SOUL.md + AGENTS.md             │
                     │  Memory search (vector + BM25)   │
                     │  MCP: memory tools               │
                     │  MCP: scheduler tools            │
                     │  Claude Code SDK → SSE stream    │
                     └─────────────────────────────────┘
                                │            │
                ┌───────────────┘            └───────────────┐
                ▼                                            ▼
┌──────────────────────────┐              ┌──────────────────────────────┐
│      @hybrd/memory        │              │       @hybrd/scheduler        │
│                           │              │                               │
│  Layer 1: PARA graph      │              │  cron / interval / one-time   │
│    projects / areas /     │              │  Precise timer, no polling    │
│    resources / archives   │              │  Exponential error backoff    │
│                           │              │  Delivers via channel adapter │
│  Layer 2: Daily log       │              └──────────────────────────────┘
│    logs/YYYY-MM-DD.md     │
│                           │
│  Layer 3: Auto memory     │
│    MEMORY.md              │
│                           │
│  SQLite + sqlite-vec      │
│  Multi-user ACL           │
└──────────────────────────┘
```

## Packages

| Package | Purpose | Key Entry Points |
|---------|---------|-----------------|
| `hybrid/agent` | Agent runtime | `src/server/index.ts`, `src/xmtp.ts` |
| `@hybrd/xmtp` | XMTP client | `src/client.ts`, `src/plugin.ts` |
| `@hybrd/memory` | PARA memory | `src/index.ts`, `src/para.ts` |
| `@hybrd/scheduler` | Time-based triggers | `src/index.ts` |
| `@hybrd/channels` | Channel adapters | `src/adapters/xmtp.ts` |
| `@hybrd/types` | Shared types | All type definitions |
| `@hybrd/cli` | CLI commands | `src/index.ts` |
| `hybrid/gateway` | CF Workers gateway | `src/index.ts` |

---

## Agent Server (hybrid/agent)

### HTTP API

**Port 8454**

#### `POST /api/chat`

Run the agent and stream a response:

```typescript
interface ChatRequest {
  messages: Array<{
    id: string
    role: "system" | "user" | "assistant"
    content: string
  }>
  chatId: string
  userId?: string
  teamId?: string
  systemPrompt?: string
}
```

Response: Server-Sent Events stream

```
data: {"type":"text","content":"I can help with..."}
data: {"type":"tool-call-start","toolCallId":"tc1","toolName":"memory_search"}
data: {"type":"tool-call-delta","toolCallId":"tc1","argsTextDelta":"\"query\":\""}
data: {"type":"tool-call-end","toolCallId":"tc1"}
data: {"type":"usage","inputTokens":450,"outputTokens":123,"totalCostUsd":0.0012}
data: [DONE]
```

#### `GET /health`

```json
{ "status": "healthy" }
```

### System Prompt Construction

Order of prompt assembly:

1. `IDENTITY.md` — Agent identity (name, emoji, avatar)
2. `SOUL.md` — Agent personality and core truths
3. Custom system prompt (if provided in request)
4. `AGENTS.md` — Behavioral guidelines and workspace rules
5. `TOOLS.md` — Local tool and environment notes
6. `USER.md` — User profile (multi-tenant support)
7. Current timestamp
8. Conversation history as `<conversation_history>` XML block
9. Memory search results from `@hybrid/memory`

### MCP Tool Server

The agent runs a unified MCP server providing:

- **Memory tools** — Read/write PARA memory, daily logs, auto memory
- **ACL tools** — Owner management, pairing requests
- **File tools** — OpenClaw-compatible read/write/edit/apply_patch

### File Operations Security

- Only owners can access file operations
- All paths restricted to `./workspace/{userId}/`
- Path traversal (`../`) blocked
- Symlink escapes prevented
- Each user has isolated workspace

---

## XMTP Sidecar

### Port 8455

The XMTP sidecar bridges XMTP network messages to the agent server.

**Inbound flow:**
1. XMTP text message arrives
2. Deduplicates by message ID
3. Finds conversation, builds reply context
4. POSTs to `http://localhost:8454/api/chat`
5. Reads SSE stream, assembles full response
6. Sends reply via `conversation.send(reply)`

**Outbound flow:**
1. `POST /api/send` received on sidecar HTTP server
2. Finds target conversation
3. Calls `runAgentAndReply()`

### Installation Limit Handling

Automatic recovery when XMTP installation limit is reached:

1. Extract inbox ID from error message
2. Call `Client.revokeInstallations()`
3. Retry connection

### Message Deduplication

In-memory `Set<string>` of processed message IDs with LRU eviction. Prevents double-processing during restarts or duplicate delivery.

### Database Persistence

When `XMTP_STORAGE` (R2) is in globalThis:
1. Download `<inboxId>.db3` from R2 before connect
2. Upload updated `.db3` after connect complete

---

## Memory System (@hybrd/memory)

### 3-Layer PARA Architecture

**Layer 1: PARA Knowledge Graph**
```
.hybrid/memory/life/
  projects/ProjectName/
    items.json     ← All facts (including superseded)
    summary.md     ← Hot + warm facts only
  areas/
  resources/
  archives/
```

Each fact has:
- `category`: relationship | milestone | status | preference | user-signal
- `status`: active | superseded
- `decayTier`: hot | warm | cold
- `accessCount`: Affects decay tier
- `lastAccessed`: Timestamp

**Decay tier computation:**
- `accessCount >= 10` → always "warm"
- `accessCount >= 5 && < 14 days` → "hot"
- `< 7 days` → "hot"
- `< 30 days` → "warm"
- `> 30 days` → "cold"

**Layer 2: Daily Log**
```
.hybrid/memory/logs/2026-03-02.md
```
Append-only, timestamped entries: `[FACT]`, `[DECISION]`, `[ACTION]`, `[EVENT]`

**Layer 3: Auto Memory**
```
MEMORY.md
  ## User Preferences
  ## Learnings
  ## Decisions
  ## Context
  ## Notes
```

### Hybrid Search

Combines vector similarity (sqlite-vec) + BM25 keyword matching (FTS5):

```typescript
const results = await manager.search("project deadline", {
  maxResults: 10,
  minScore: 0.5
})
// 70% vector weight, 30% text weight (default)
```

### Multi-User ACL

```
.hybrid/memory/
├── ACL.md              # Access control list
├── MEMORY.md           # Shared (owners only)
└── users/
    ├── 0xalice/
    │   └── MEMORY.md   # Alice's private memory
    └── 0xbob/
        └── MEMORY.md   # Bob's private memory
```

```typescript
const acl = parseACL(workspaceDir)
const role = getRole(acl, userId)  // "owner" | "guest"
// Owner: read/write all memory
// Guest: read/write only own user memory
```

---

## Scheduler (@hybrd/scheduler)

### Schedule Types

```typescript
type CronSchedule =
  | { kind: "at"; at: string }                    // One-time at ISO timestamp
  | { kind: "every"; everyMs: number; anchorMs?: number }  // Interval
  | { kind: "cron"; expr: string; tz?: string; staggerMs?: number }  // Cron
```

### Precise Timer

Arms timer to exact next wake time (no polling):

```typescript
private armTimer(): void {
  const nextAt = this.nextWakeAtMs()
  if (!nextAt) return
  const delay = Math.max(0, nextAt - Date.now())
  this.state.timer = setTimeout(() => this.onTimer(), delay)
}
```

### Error Backoff

| Consecutive Failures | Delay Before Retry |
|---------------------|--------------------|
| 1 | 30 seconds |
| 2 | 60 seconds |
| 3 | 5 minutes |
| 4 | 15 minutes |
| 5+ | 1 hour |

### Job Definition

```typescript
interface CronJob {
  id: string
  name: string
  enabled: boolean
  deleteAfterRun?: boolean
  schedule: CronSchedule
  payload: CronPayload
  delivery?: CronDelivery
  state: CronJobState
}

type CronPayload =
  | { kind: "systemEvent"; text: string }
  | { kind: "agentTurn"; message: string; model?: string; ... }
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `schedule_task` | Create scheduled task |
| `list_tasks` | List with pagination/filtering |
| `cancel_task` | Remove task |
| `get_task` | Get task details |
| `run_task` | Manually trigger |

---

## Channel Adapters (@hybrd/channels)

### Interface

```typescript
interface ChannelAdapter {
  channel: ChannelId
  port: number
  start(): Promise<void>
  stop(): Promise<void>
  trigger(req: TriggerRequest): Promise<TriggerResponse>
}
```

### Default Ports

```typescript
const DEFAULT_ADAPTER_PORTS = {
  xmtp: 8455
  // telegram: 8456 (planned)
  // slack: 8457 (planned)
}
```

### HTTP IPC

All communication uses `http://127.0.0.1:{port}/api/trigger`:

```typescript
// Dispatch from scheduler
await dispatchToChannel({
  channel: "xmtp",
  to: "0x...",
  message: "Scheduled reminder"
})
```

---

## Gateway (hybrid/gateway)

### Cloudflare Workers Architecture

```
Cloudflare Worker (edge)
    │
    ├── GET /health  → container + server health check
    └── POST /api/chat
            │
            ▼
    ensureAgentServer()
            │
            ├── sandbox.listProcesses() (wait up to 30s)
            ├── Check for server + sidecar
            ├── HTTP health check on port 8454
            └── If unhealthy:
                  kill node processes
                  start server (wait for port 8454)
                  start sidecar (wait for "Connected to XMTP")
            │
            ▼
    sandbox.containerFetch() → port 8454
            │
            ▼
    SSE passthrough → caller
```

### Durable Object

Each `teamId` gets its own `Sandbox` instance:

```typescript
export { Sandbox } from "@cloudflare/sandbox"
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENT_WALLET_KEY` | Yes | XMTP wallet private key |
| `XMTP_ENV` | Yes | `dev` or `production` |
| `ANTHROPIC_API_KEY` | Either | For Claude direct |
| `OPENROUTER_API_KEY` | Either | Auto-configures Anthropic client |

---

## Types (@hybrd/types)

All shared type definitions. Zero runtime except `BehaviorRegistryImpl`.

### Key Types

```typescript
// Agent
interface Agent<TRuntimeExtension, TPluginContext> { ... }
interface AgentConfig<TRuntimeExtension> { ... }

// Tool
interface Tool<TInput, TOutput, TRuntimeExtension> { ... }

// Plugin
interface Plugin<T> { name, description?, apply(app, context) }

// Behavior
interface BehaviorObject<TRuntimeExtension> {
  id: string
  before?(context): Promise<void>
  after?(context): Promise<void>
}

// Runtime
interface AgentRuntime {
  conversation: XmtpConversation
  message: XmtpMessage
  xmtpClient: XmtpClient
  scheduler?: unknown
}

// Channel
interface ChannelAdapter { ... }
interface TriggerRequest { to, message, metadata? }
interface TriggerResponse { delivered, messageId?, error? }

// Schedule
type CronSchedule = { kind: "at" | "every" | "cron", ... }
interface CronJob { ... }
```

---

## CLI (@hybrd/cli)

### Commands

```bash
hybrid init [name]           # Create new agent project
hybrid build [--target]      # Build to .hybrid/
hybrid dev                   # Start development server
hybrid deploy [platform]     # Deploy (fly, cf, railway)
hybrid register              # Register XMTP wallet
hybrid revoke <inboxId>      # Revoke specific installations
hybrid revoke-all            # Revoke all installations
hybrid install <source>      # Install skill (github, npm, local)
hybrid uninstall <name>      # Remove skill
hybrid skills                # List installed skills
```

### Build Pipeline

```
hybrid build
    │
    ├── pnpm --filter hybrid/agent build
    ├── Create .hybrid/
    ├── Copy dist/ → .hybrid/dist/
    ├── Copy SOUL.md, AGENTS.md, agent.ts
    ├── Copy core skills → .hybrid/skills/core/
    ├── Copy ./skills/ → .hybrid/skills/ext/
    ├── Write skills_lock.json
    └── Generate: package.json, Dockerfile, fly.toml, start.sh
```

---

## Deployment Targets

### Fly.io

```bash
hybrid deploy fly
# Runs: fly deploy from .hybrid/
```

### Cloudflare Workers

```bash
hybrid deploy cf
# Builds: packages/gateway
# Runs: wrangler deploy
```

### Node.js

```bash
hybrid build
# Ship .hybrid/ to server
# Run: node dist/server/index.cjs
```

---

## Key Patterns

### Behavior Chain

Behaviors implement middleware pattern:

```typescript
// before() runs before agent.generate()
// after() runs after response is ready
// Set context.stopped = true to short-circuit

const myBehavior = (): BehaviorObject => ({
  id: "my-behavior",
  async before(context) {
    // Pre-processing
  },
  async after(context) {
    // Post-processing
  }
})
```

### Plugin System

Plugins extend the Hono HTTP server:

```typescript
interface Plugin<T> {
  name: string
  apply: (app: Hono, context: T) => void | Promise<void>
}

// Usage
agent.use(myPlugin())
```

### Conversation History

XMTP sidecar fetches up to 20 recent messages:

```typescript
const messages = await conversation.messages({ limit: 20 })
const history = messages
  .filter(m => m.contentType.sameAs(ContentTypeText))
  .map(m => ({ role: m.senderInboxId === myInboxId ? "assistant" : "user", content: m.content }))
```

---

## Environment Variables

### Agent Server

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `ANTHROPIC_BASE_URL` | Override base URL (auto-set for OpenRouter) |
| `OPENROUTER_API_KEY` | OpenRouter key (auto-configures) |
| `AGENT_WALLET_KEY` | XMTP wallet private key |
| `XMTP_ENV` | `dev` or `production` |
| `PROJECT_ROOT` | Override workspace root |
| `PORT` | Agent server port (default: 8454) |

### Memory

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMORY_ENABLED` | `true` | Enable memory |
| `MEMORY_PROVIDER` | `auto` | Embedding provider |
| `MEMORY_MODEL` | Provider default | Embedding model |
| `MEMORY_DB_PATH` | `~/.hybrid/memory/{agentId}.sqlite` | SQLite path |

### Scheduler

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHEDULER_ENABLED` | `true` | Enable scheduler |
| `SCHEDULER_DB_PATH` | `./data/scheduler.db` | SQLite path |
| `SCHEDULER_TIMEZONE` | System TZ | Default timezone |

---

## Troubleshooting

### XMTP Connection Issues

1. Check `AGENT_WALLET_KEY` is valid hex
2. Check `XMTP_ENV` matches expected network
3. If installation limit reached, run `hybrid revoke-all`
4. Check R2 bucket exists if using Cloudflare gateway

### Memory Search Not Working

1. Check embedding provider is configured
2. Run `manager.sync({ force: true })` to rebuild index
3. Check `MEMORY_ENABLED=true`
4. Verify `MEMORY_DB_PATH` is writable

### Scheduler Jobs Not Running

1. Check `SCHEDULER_ENABLED=true`
2. Verify SQLite database exists
3. Check job `enabled: true`
4. Look for errors in job state

### Build Failures

1. Run `pnpm build:packages` first
2. Check TypeScript errors with `pnpm typecheck`
3. Verify all dependencies installed
4. Check Biome lint with `pnpm lint`