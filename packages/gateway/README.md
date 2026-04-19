# hybrid/gateway

> **DEPRECATED** — This Cloudflare Workers gateway is no longer the recommended deployment target for Hybrid agents.

## Migration

Deploy agents to Firecracker microVMs instead:

- **sprites**: `hybrid deploy sprites`
- **e2b**: `hybrid deploy e2b`
- **northflank**: `hybrid deploy northflank`

## Original Documentation

Production Cloudflare Workers gateway for Hybrid AI agents. Routes web requests to the agent container and manages container lifecycle.

### Architecture

```
Cloudflare Worker (edge)
    │
    ├── GET /health  → checks container processes + server
    └── POST /api/chat
            │
            ▼
    ensureAgentServer()
            │
            ├── sandbox.listProcesses()  (wait up to 30s)
            ├── Check for server/index.js
            ├── HTTP health check on port 8454
            └── If unhealthy: kill & restart
            │
            ▼
    sandbox.containerFetch() → port 8454 inside container
            │
            ▼
    SSE passthrough → caller
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `ANTHROPIC_BASE_URL` | Override Anthropic base URL (auto-set for OpenRouter) |
| `OPENROUTER_API_KEY` | OpenRouter API key (auto-configures Anthropic client) |
