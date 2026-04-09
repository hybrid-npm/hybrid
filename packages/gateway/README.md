# hybrid/gateway

Production Cloudflare Workers gateway for Hybrid AI agents. Routes web requests to the agent container, manages container lifecycle, and persists data to Cloudflare R2.

## Overview

The gateway is the entry point for all production traffic. It runs as a Cloudflare Worker and uses a Durable Object (`Sandbox`) to manage a Docker container running the agent server.

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
│               ├── Check for server/index.js                      │
│               ├── HTTP health check on port 8454                  │
│               └── If unhealthy:                                    │
│                     kill all node processes                        │
│                     start server (wait for port 8454)             │
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

Main chat endpoint. Ensures the agent server is running in the container, then proxies the request as a streaming SSE passthrough.

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
2. **Check processes**: Looks for `server/index.js` (agent server)
3. **Health check**: HTTP GET to port 8454 on the container
4. **If unhealthy**:
   - Kills all `node` processes in the container
   - Starts agent server: `node /app/dist/server/index.cjs` — waits for TCP port 8454
   - Final health check loop (10 retries, 500ms intervals)

## Environment Variables

| Variable | Description |
|----------|-------------|
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
    { "binding": "AGENT_STORAGE", "bucket_name": "hybrid-agent-storage" }
  ]
}
```

## R2 Data Persistence

The gateway binds an `AGENT_STORAGE` R2 bucket for persisting agent data across container restarts.

## Durable Object

The `Sandbox` Durable Object is exported from `@cloudflare/sandbox` and re-exported from this package. Each `teamId` gets its own `Sandbox` instance (and therefore its own container).

```typescript
export { Sandbox } from "@cloudflare/sandbox"
```

## TypeScript Interface

```typescript
export interface GatewayEnv {
  AgentContainer: DurableObjectNamespace
  AGENT_STORAGE: R2Bucket
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

- Runs `packages/agent/dist/server/index.cjs` inside the container
- R2 storage provides persistent data across container restarts
- `packages/cli` (`hybrid deploy cf`) builds the agent then calls `wrangler deploy` in this package

## License

MIT
