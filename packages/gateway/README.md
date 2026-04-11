# hybrid/gateway

> **DEPRECATED** — This package is deprecated as part of HYBRID-137 (Core Decoupling).
> The Cloudflare Workers gateway is no longer the recommended deployment target.
> Use Fly.io, Railway, or Sprites instead. See `packages/cli/src/cli.ts` for supported deploy targets.

## Status

This package will be removed in a future release. No new features will be added.

## Migration

If you are currently using this gateway, migrate to one of the supported deployment targets:

- **Fly.io**: `hybrid deploy fly`
- **Railway**: `hybrid deploy railway` (coming soon)
- **Sprites**: `hybrid deploy sprites` (coming soon)

## Original Documentation

Production Cloudflare Workers gateway for Hybrid AI agents. Routes web requests to the agent container, manages container lifecycle, and persists data to Cloudflare R2.

### Architecture

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

### HTTP Routes

#### `POST /api/chat`

Main chat endpoint. Ensures the agent server is running in the container, then proxies the request as a streaming SSE passthrough.

#### `GET /health`

Checks the full stack: gateway, container processes, and agent server HTTP health.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `ANTHROPIC_BASE_URL` | Override Anthropic base URL (auto-set for OpenRouter) |
| `ANTHROPIC_AUTH_TOKEN` | Auth token (auto-set from `OPENROUTER_API_KEY`) |
| `OPENROUTER_API_KEY` | OpenRouter API key (auto-configures Anthropic client) |
