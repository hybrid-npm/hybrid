# Containerized Agent

A Cloudflare Workers + Containers deployment for AI agents with XMTP messaging support.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              XMTP Network                                     │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           XMTP Sidecar (Gateway)                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Message Handlers                                                       │  │
│  │  • xmtp.on("text")      → Handle text messages                         │  │
│  │  • xmtp.on("reaction")  → Handle emoji reactions                       │  │
│  │  • xmtp.on("reply")     → Handle threaded replies                      │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Agent Behaviors (Middleware)                                           │  │
│  │  • filterMessages()  → Control which messages to process               │  │
│  │  • reactWith()       → Auto-react to incoming messages                 │  │
│  │  • threadedReply()   → Send replies as threads                         │  │
│  │  • executeBefore()   → Pre-response hooks                              │  │
│  │  • executeAfter()    → Post-response hooks                             │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  HTTP Client                                                            │  │
│  │  POST /api/chat { messages, chatId, teamId, systemPrompt }             │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      Cloudflare Worker (Gateway)                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Endpoints                                                              │  │
│  │  • GET  /health         → Health check                                  │  │
│  │  • POST /api/chat       → Chat endpoint (SSE streaming)                │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Sandbox Manager                                                        │  │
│  │  • getSandbox(teamId)    → Get/create Durable Object                    │  │
│  │  • ensureAgentServer()   → Start container if not running              │  │
│  │  • containerFetch()      → Proxy request to container                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                   Cloudflare Sandbox (Durable Object)                         │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Container (Docker Image: cloudflare/sandbox:0.7.0)                    │  │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │  │
│  │  │  Agent Server (Bun + Hono)                                       │  │  │
│  │  │  ┌────────────────────────────────────────────────────────────┐  │  │  │
│  │  │  │  Claude Agent SDK                                          │  │  │  │
│  │  │  │  • query({ prompt, options })                              │  │  │  │
│  │  │  │  • Model: claude-sonnet-4-20250514                         │  │  │  │
│  │  │  │  • Max turns: 25                                           │  │  │  │
│  │  │  │  • Permission mode: bypassPermissions                      │  │  │  │
│  │  │  └────────────────────────────────────────────────────────────┘  │  │  │
│  │  │                                                                    │  │  │
│  │  │  ┌────────────────────────────────────────────────────────────┐  │  │  │
│  │  │  │  Personality Files                                         │  │  │  │
│  │  │  │  • SOUL.md        → Core identity and principles           │  │  │  │
│  │  │  │  • AGENTS.md      → Behavioral guidelines                 │  │  │  │
│  │  │  └────────────────────────────────────────────────────────────┘  │  │  │
│  │  │                                                                    │  │  │
│  │  │  ┌────────────────────────────────────────────────────────────┐  │  │  │
│  │  │  │  SSE Event Types                                           │  │  │  │
│  │  │  │  • text           → Text content delta                     │  │  │  │
│  │  │  │  • tool-call-start → Tool use beginning                   │  │  │  │
│  │  │  │  • tool-call-delta → Tool arguments streaming             │  │  │  │
│  │  │  │  • tool-call-end   → Tool use complete                    │  │  │  │
│  │  │  │  • usage          → Token usage stats                      │  │  │  │
│  │  │  │  • error          → Error message                          │  │  │  │
│  │  │  └────────────────────────────────────────────────────────────┘  │  │  │
│  │  └──────────────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Communication Flow

```
1. XMTP Message Received
   └─► XMTP Sidecar receives message (text/reaction/reply)

2. Behavior Processing
   └─► Execute before behaviors (filter, react, etc.)
   └─► Check if message should be processed

3. Gateway Request
   └─► POST /api/chat to Cloudflare Worker
   └─► Gateway routes to team's sandbox container

4. Container Execution
   └─► Agent server receives request
   └─► Builds prompt with conversation history
   └─► Calls Claude Agent SDK
   └─► Streams SSE response back

5. Response Handling
   └─► Execute after behaviors
   └─► Send response via XMTP (threaded or regular)
```

## Agent Behaviors (XMTP Sidecar)

Behaviors are middleware that execute before/after agent responses. They live in the XMTP sidecar/gateway layer.

### Built-in Behaviors

| Behavior | Description |
|----------|-------------|
| `filterMessages(filterFn)` | Control which messages to process |
| `reactWith(emoji)` | Auto-react to incoming messages |
| `threadedReply()` | Send replies as threaded responses |

### Behavior Lifecycle

```typescript
// Before response generation
await behaviors.executeBefore(context)
  // → Can filter messages
  // → Can react to messages
  // → Can stop the chain (context.stopped = true)

// After response generation
await behaviors.executeAfter(context)
  // → Can modify response
  // → Can control send options (threaded, filtered)
```

### Behavior Context

```typescript
interface BehaviorContext {
  runtime: AgentRuntime       // Conversation, message, XMTP client
  client: XmtpClient          // XMTP client instance
  conversation: XmtpConversation
  message: XmtpMessage
  response?: string           // Agent's response (after only)
  sendOptions?: {
    threaded?: boolean        // Send as threaded reply
    filtered?: boolean        // Skip sending response
  }
  stopped?: boolean           // Chain was stopped
}
```

## Container Runner

The container runs an agent server using the Claude Agent SDK.

### Key Configuration

| Option | Value |
|--------|-------|
| Model | `claude-sonnet-4-20250514` |
| Max Turns | 25 |
| Permission Mode | `bypassPermissions` |
| Port | 4100 |

### Personality Files

- **SOUL.md** - Core identity, principles, and style
- **AGENTS.md** - Behavioral guidelines and constraints

### Conversation History

The server maintains a sliding window of the last 20 messages:

```
[system] ... earlier messages omitted ...
[user] previous message
[assistant] previous response
[user] current message
```

### SSE Event Types

| Event | Description |
|-------|-------------|
| `text` | Text content delta |
| `tool-call-start` | Tool use beginning (includes tool name) |
| `tool-call-delta` | Streaming tool arguments |
| `tool-call-end` | Tool use complete |
| `usage` | Token usage statistics |
| `error` | Error message |
| `[DONE]` | Stream complete |

## Key Files

| Path | Purpose |
|------|---------|
| `src/gateway/index.ts` | Cloudflare Worker gateway |
| `src/server/index.ts` | Container agent server |
| `src/dev-gateway.ts` | Local development gateway |
| `SOUL.md` | Agent identity and principles |
| `AGENTS.md` | Behavioral guidelines |
| `wrangler.jsonc` | Cloudflare Workers config |
| `Dockerfile` | Container image definition |
| `start.sh` | Container entry point |

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `ANTHROPIC_BASE_URL` | No | Claude API base URL |
| `ANTHROPIC_AUTH_TOKEN` | No | Alternative auth token |
| `OPENROUTER_API_KEY` | No | OpenRouter API key (fallback) |
| `XMTP_WALLET_KEY` | Yes | XMTP wallet private key |
| `XMTP_DB_ENCRYPTION_KEY` | Yes | Database encryption key |
| `XMTP_ENV` | No | XMTP environment (dev/production) |

## Development

```bash
# Run locally with dev gateway
pnpm dev

# Run container server only
pnpm dev:container

# Run gateway only
pnpm dev:gateway

# Build container
pnpm build

# Deploy to Cloudflare
pnpm deploy
```

## Deployment

The app deploys to Cloudflare Workers with Containers:

- **Gateway**: Cloudflare Worker (handles routing)
- **Sandbox**: Durable Object (manages container lifecycle)
- **Container**: Docker image running agent server
- **Storage**: R2 bucket for XMTP databases

### Scaling

- Max instances: 50 containers
- Instance type: `standard-1`
- Per-team isolation via Durable Object IDs
