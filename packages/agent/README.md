# hybrid/agent

The runtime agent package for deployed Hybrid AI agents. Not published to npm — this is the actual process that runs in production.

## Overview

The agent package runs two concurrent processes:

1. **Agent Server** — A Hono HTTP server that accepts chat requests, drives the Claude Code SDK to generate responses, and streams Server-Sent Events (SSE) back to callers.
2. **XMTP Sidecar** — Connects to the XMTP messaging network, bridges inbound messages to the agent server, and exposes an HTTP endpoint for outbound message delivery.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        hybrid/agent                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │               Agent Server (port 8454)                       │  │
│  │                                                               │  │
│  │  SOUL.md + AGENTS.md                                         │  │
│  │       ↓                                                       │  │
│  │  POST /api/chat                                               │  │
│  │       ↓                                                       │  │
│  │  Memory search → system prompt → conversation history        │  │
│  │       ↓                                                       │  │
│  │  MCP servers: memory tools + scheduler tools                 │  │
│  │       ↓                                                       │  │
│  │  claude-agent-sdk query() → SSE stream                       │  │
│  │  { text, tool-call-start, tool-call-delta, tool-call-end,    │  │
│  │    usage, error }                                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │               XMTP Sidecar (port 8455)                       │  │
│  │                                                               │  │
│  │  XMTP network → Agent.create() → "text" events              │  │
│  │       ↓                                                       │  │
│  │  Fetch conversation history (up to 20 msgs)                  │  │
│  │       ↓                                                       │  │
│  │  POST /api/chat (agent server)                               │  │
│  │       ↓                                                       │  │
│  │  Assemble SSE stream → conversation.send(reply)              │  │
│  │                                                               │  │
│  │  POST /api/send  ← scheduler outbound delivery               │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

## Exported Types

From `src/index.ts`:

```typescript
interface Message {
  id: string
  role: "system" | "user" | "assistant"
  content: string
}

interface ChatRequest {
  messages: Message[]
  chatId: string
  userId?: string
  teamId?: string
  systemPrompt?: string
}

interface ChatResponse {
  type: "text" | "usage" | "error" | "tool-call-start" | "tool-call-delta" | "tool-call-end"
  content?: string
  inputTokens?: number
  outputTokens?: number
  totalCostUsd?: number
  numTurns?: number
  toolCallId?: string
  toolName?: string
  argsTextDelta?: string
}

interface HealthResponse {
  status: "healthy" | "unhealthy"
  service?: string
  timestamp?: string
  container?: boolean
  sidecar?: boolean
  server?: boolean
  gateway?: boolean
  message?: string
}

function encodeSSE(data: unknown): Uint8Array
function encodeDone(): Uint8Array
```

## HTTP API

### Agent Server (port 8454)

#### `POST /api/chat`

Run the agent and stream a response:

```http
POST http://localhost:8454/api/chat
Content-Type: application/json

{
  "messages": [
    { "id": "1", "role": "user", "content": "What can you help me with?" }
  ],
  "chatId": "conv-123",
  "userId": "0xalice...",
  "teamId": "team-xyz"
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

### XMTP Sidecar (port 8455)

#### `POST /api/send`

Deliver an outbound message from the scheduler to a specific XMTP conversation:

```http
POST http://localhost:8455/api/send
Content-Type: application/json

{
  "conversationId": "conv-abc",
  "message": "Your scheduled reminder"
}
```

## Agent Prompt Construction

On each `/api/chat` request, the server builds the system prompt in this order:

1. `SOUL.md` — Agent personality (loaded from `PROJECT_ROOT`)
2. `AGENTS.md` — Agent instructions and behavioral guidelines
3. Current timestamp
4. Conversation history as `<conversation_history>` XML block
5. Memory search results from `@hybrid/memory` (seeded from last user message)

## MCP Tool Servers

The agent runs two MCP (Model Context Protocol) servers for each request:

- **Memory tools** — `createMemoryMcpServer()` from `src/memory-tools.ts`. Provides read/write access to PARA memory, daily logs, and auto-memory. Scoped by user role (owner vs guest) from `ACL.md`.
- **Scheduler tools** — `SchedulerService` from `@hybrd/scheduler`. Provides `schedule`, `list`, `update`, `cancel` tools.

```typescript
import { createMemoryMcpServer, resolveUserRole } from "hybrid/agent"

const { role, acl } = resolveUserRole(workspaceDir, userId)
const mcpServer = createMemoryMcpServer(workspaceDir, userId, role, acl)
```

## Scheduler Integration

The `SchedulerService` is initialized on startup and backed by SQLite. Job callbacks:
- **Run**: POSTs to `/api/chat` with the job's payload as the user message
- **Delivery**: Routes outbound messages to the XMTP sidecar via `POST /api/send`

## Model Configuration

Supports both Anthropic direct and OpenRouter:

```env
# Anthropic direct
ANTHROPIC_API_KEY=sk-ant-...

# OpenRouter (auto-detected)
OPENROUTER_API_KEY=sk-or-...
```

If `OPENROUTER_API_KEY` is set, `ANTHROPIC_BASE_URL` is automatically set to `https://openrouter.ai/api`.

## Skills System

Skills are markdown files (`SKILL.md`) that provide tools and context to the agent. They live in:

```
.hybrid/
├── skills/
│   ├── core/          # Built-in skills (memory, xmtp)
│   │   ├── memory/SKILL.md
│   │   └── xmtp/SKILL.md
│   └── ext/           # User-installed skills
│       └── my-skill/SKILL.md
```

Skills are injected into the agent's system prompt as available tools/capabilities.

## XMTP Installation Limit Handling

The XMTP sidecar automatically handles installation limit errors on connect:

1. Extracts the inbox ID from the error message
2. Calls `Client.revokeInstallations()` to remove old installations
3. Retries the connection

## Message Deduplication

The sidecar maintains an in-memory `Set<string>` of processed message IDs with LRU eviction to prevent double-processing in case of restarts or duplicate delivery.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `ANTHROPIC_BASE_URL` | Override Anthropic base URL (auto-set for OpenRouter) |
| `OPENROUTER_API_KEY` | OpenRouter API key (auto-configures Anthropic client) |
| `AGENT_WALLET_KEY` | Private key for XMTP wallet |
| `AGENT_SECRET` | Encryption key for XMTP database |
| `XMTP_ENV` | XMTP environment: `dev` or `production` |
| `PROJECT_ROOT` | Override workspace root path |
| `PORT` | Agent server port (default: `8454`) |

## Building

```bash
cd packages/agent
pnpm build
```

Outputs to `dist/`:
- `dist/server/index.cjs` — Full Claude Code SDK agent server
- `dist/server/simple.cjs` — Lightweight server (OpenAI-compatible, no Claude Code subprocess)
- `dist/xmtp.cjs` — XMTP sidecar

## License

MIT
