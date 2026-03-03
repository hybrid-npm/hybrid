# hybrid/gateway

Production Cloudflare Workers gateway for Hybrid AI agents. Routes web requests to the agent container, manages container lifecycle (including the XMTP sidecar), and persists the XMTP database to Cloudflare R2.

## Overview

The gateway is the entry point for all production traffic. It runs as a Cloudflare Worker and uses a Durable Object (`Sandbox`) to manage a Docker container running the agent server and XMTP sidecar.

This package is the **Cloudflare deployment target** for the full Hybrid agent stack. It is deployed via `hybrid deploy cf` or `wrangler deploy`.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       hybrid/gateway                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Cloudflare Worker (edge)                                          │
│       │                                                            │
│       ├── GET /health  → checks container processes + server      │
│       └── POST /api/chat                                          │
│               │                                                    │
│               ▼                                                    │
│       ensureAgentServer()                                          │
│               │                                                    │
│               ├── sandbox.listProcesses()  (wait up to 30s)       │
│               ├── Check for server/index.js and xmtp.cjs          │
│               ├── HTTP health check on port 8454                  │
│               └── If unhealthy:                                    │
│                     kill all node processes                        │
│                     start server (wait for port 8454)             │
│                     start sidecar (wait for "Connected to XMTP")  │
│               │                                                    │
│               ▼                                                    │
│       sandbox.containerFetch() → port 8454 inside container       │
│               │                                                    │
│               ▼                                                    │
│       SSE passthrough → caller                                     │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

## HTTP Routes

### `POST /api/chat`

Main chat endpoint. Ensures the agent server and XMTP sidecar are running in the container, then proxies the request as a streaming SSE passthrough.

```http
POST https://your-agent.workers.dev/api/chat
Content-Type: application/json

{
  "messages": [{ "id": "1", "role": "user", "content": "Hello" }],
  "chatId": "conv-123",
  "userId": "0xalice..."
}
```

Response: Server-Sent Events stream (forwarded from agent server)

### `GET /health`

Checks the full stack: gateway, container processes, and agent server HTTP health.

```json
{
  "status": "healthy",
  "gateway": true,
  "container": true,
  "sidecar": true,
  "server": true,
  "timestamp": "2026-03-02T15:30:00.000Z"
}
```

## Container Lifecycle

The `ensureAgentServer()` function manages container process health:

1. **Wait for container**: Polls `sandbox.listProcesses()` up to 30 seconds (1s intervals)
2. **Check processes**: Looks for `server/index.js` (agent server) and `sidecar/index.js` (XMTP sidecar)
3. **Health check**: HTTP GET to port 8454 on the container
4. **If unhealthy**:
   - Kills all `node` processes in the container
   - Starts agent server: `node /app/dist/server/index.cjs` — waits for TCP port 8454
   - Starts XMTP sidecar: `node /app/dist/sidecar/index.cjs` — waits for `"Connected to XMTP"` log (30s timeout)
   - Final health check loop (10 retries, 500ms intervals)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AGENT_WALLET_KEY` | Private key for the agent's XMTP wallet (required) |
| `AGENT_SECRET` | Encryption key for XMTP database (required) |
| `XMTP_ENV` | XMTP environment: `dev` or `production` |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `ANTHROPIC_BASE_URL` | Override Anthropic base URL (auto-set for OpenRouter) |
| `ANTHROPIC_AUTH_TOKEN` | Auth token (auto-set from `OPENROUTER_API_KEY`) |
| `OPENROUTER_API_KEY` | OpenRouter API key (auto-configures Anthropic client) |

If `OPENROUTER_API_KEY` is set, the gateway automatically sets:
- `ANTHROPIC_BASE_URL=https://openrouter.ai/api`
- `ANTHROPIC_AUTH_TOKEN={OPENROUTER_API_KEY}`

## Wrangler Configuration

```jsonc
// wrangler.jsonc
{
  "name": "hybrid-agent",
  "durable_objects": {
    "bindings": [
      { "name": "AgentContainer", "class_name": "Sandbox" }
    ]
  },
  "containers": [
    {
      "class_name": "Sandbox",
      "instance_type": "standard-1",
      "max_instances": 50
    }
  ],
  "r2_buckets": [
    { "binding": "XMTP_STORAGE", "bucket_name": "hybrid-xmtp-databases" }
  ]
}
```

## R2 Database Persistence

The gateway binds the `XMTP_STORAGE` R2 bucket, which is used by `@hybrd/xmtp`'s `createXMTPClient()` to persist the encrypted XMTP SQLite database across container restarts:

1. On connect: download `<inboxId>.db3` from R2 to the container filesystem
2. On connect complete: upload updated `.db3` back to R2

This enables stateless containers while preserving XMTP conversation history and installation state.

## Durable Object

The `Sandbox` Durable Object is exported from `@cloudflare/sandbox` and re-exported from this package. Each `teamId` gets its own `Sandbox` instance (and therefore its own container).

```typescript
export { Sandbox } from "@cloudflare/sandbox"
```

## TypeScript Interface

```typescript
export interface GatewayEnv {
  AgentContainer: DurableObjectNamespace
  XMTP_STORAGE: R2Bucket
  AGENT_WALLET_KEY: string
  AGENT_SECRET: string
  XMTP_ENV: string
  ANTHROPIC_API_KEY?: string
  ANTHROPIC_BASE_URL?: string
  ANTHROPIC_AUTH_TOKEN?: string
  OPENROUTER_API_KEY?: string
}
```

## Deploying

```bash
# Via the CLI (builds agent + deploys gateway)
hybrid deploy cf

# Or directly
cd packages/gateway
wrangler deploy
```

## Relation to Other Packages

- Runs `packages/agent/dist/server/index.cjs` and `packages/agent/dist/xmtp.cjs` inside the container
- R2 storage is consumed by `@hybrd/xmtp`'s `getDbPath()` and `backupDbToPersistentStorage()`
- The simplified version of this gateway (without XMTP sidecar) is generated by `packages/create-hybrid` as `src/gateway/index.ts`
- `packages/cli` (`hybrid deploy cf`) builds the agent then calls `wrangler deploy` in this package

## License

MIT
