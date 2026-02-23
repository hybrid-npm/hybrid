# Containerized Agent

A Cloudflare Sandbox-based agent using Claude Agent SDK with XMTP integration.

## Architecture

Two implementations available:

1. **Hybrid Core** (`packages/core`) - General-purpose agent framework using Vercel AI SDK
2. **Containerized Agent** (`apps/agent`) - Cloudflare Sandbox-based agent using Claude Agent SDK

### Core Concepts

| Concept | Purpose |
|---------|---------|
| **Agent** | Central class - handles generate/stream/listen, loads plugins |
| **Runtime** | Context passed to tools/behaviors (XMTP conversation, message, client) |
| **Tool** | Type-safe function with Zod schemas (blockchain, XMTP messaging) |
| **Behavior** | Middleware hooks (`before`/`after` response generation) |
| **Plugin** | Extends HTTP server with functionality |

### Data Flow (Hybrid Core)

```
XMTP Network → XMTPPlugin → before behaviors → Agent.generate() → after behaviors → Send response
```

### Data Flow (Containerized)

```
HTTP Request → Gateway (Worker) → Sandbox (Durable Object) → Container (Claude SDK) → SSE Stream
```

## Containerized Agent Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                     │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Gateway (Hono App)                    │  │
│  │  • /health - Health check                         │  │
│  │  • /api/chat - Chat endpoint                      │  │
│  └─────────────────┬─────────────────────────────────┘  │
│                    │                                     │
│                    ▼                                     │
│  ┌───────────────────────────────────────────────────┐  │
│  │          Cloudflare Sandbox (Durable Object)       │  │
│  │  ┌───────────────────────────────────────────────┐ │  │
│  │  │         Container (Docker Image)              │ │  │
│  │  │  ┌─────────────────────────────────────────┐  │ │  │
│  │  │  │  Claude Agent Server (Bun + Hono)       │  │ │  │
│  │  │  │  • Uses Claude Agent SDK                │  │ │  │
│  │  │  │  • SSE streaming responses              │  │ │  │
│  │  │  │  • Loads INSTRUCTIONS.md + SOUL.md      │  │ │  │
│  │  │  └─────────────────────────────────────────┘  │ │  │
│  │  └───────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Key Components

- **Gateway** (`src/gateway/index.ts`) - Routes requests to sandbox containers
- **Container Server** (`src/server/index.ts`) - Claude Agent SDK integration with SSE streaming
- **SOUL.md** - Core identity and principles
- **INSTRUCTIONS.md** - Behavioral guidelines

## XMTP Integration

- Persistent database storage with encryption
- Multi-source address resolution (ENS, Basename, XMTP)
- Health monitoring with auto-reconnect
- Message types: text, reaction, reply

## Key Files

| Path | Purpose |
|------|---------|
| `src/gateway/` | Cloudflare Worker gateway |
| `src/server/` | Claude Agent SDK container server |
| `SOUL.md` | Agent personality/identity |
| `INSTRUCTIONS.md` | Behavioral instructions |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `ANTHROPIC_BASE_URL` | Claude API base URL |
| `ANTHROPIC_AUTH_TOKEN` | Claude auth token |
| `XMTP_WALLET_KEY` | XMTP wallet private key |
| `XMTP_DB_ENCRYPTION_KEY` | Database encryption |
| `XMTP_ENV` | XMTP environment (dev/production) |

## Development

```bash
# Install dependencies
pnpm install

# Run locally
pnpm dev

# Deploy to Cloudflare
pnpm deploy
```
