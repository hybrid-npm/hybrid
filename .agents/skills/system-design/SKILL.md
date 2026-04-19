---
name: system-design
description: Microservices patterns, container architecture, deployment targets (Fly.io, Cloudflare Workers), and system design decisions for Hybrid. Use when designing deployments, scaling strategies, or container configurations.
---

# System Design

Hybrid is designed for flexible deployment across multiple platforms with stateless containers and persistent storage.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                         │
│         Web Apps • Farcaster • Messaging Clients                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CHANNEL LAYER                                       │
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │  Telegram   │    │   Slack     │    │  WebSocket  │    │   Discord   │   │
│  │  (8456)     │    │  (8457)     │    │  (8458)     │    │  (8459)     │   │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘   │
│                                                                              │
│  All adapters communicate via HTTP IPC to agent server                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AGENT SERVER (8454)                               │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Hono HTTP Server                                  │    │
│  │  POST /api/chat → SSE stream                                        │    │
│  │  GET /health    → { status, services }                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Claude Code SDK                                   │    │
│  │  System Prompt ← Templates + Memory                                  │    │
│  │  Tools ← MCP Server (memory, scheduler)                              │    │
│  │  Response → SSE Stream                                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │
               ┌───────────────────────┼───────────────────────┐
               ▼                       ▼                       ▼
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│    @hybrd/memory      │  │   @hybrd/scheduler   │  │   External APIs      │
│                       │  │                      │  │                      │
│  SQLite + sqlite-vec  │  │  Precise timer       │  │  Anthropic API       │
│  PARA graph           │  │  SQLite storage      │  │  OpenRouter          │
│  Multi-user ACL       │  │  Channel delivery    │  │  Embedding providers │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

---

## Deployment Targets

### Fly.io (Primary)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Fly.io                                    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                     VM Instance                           │    │
│  │                                                           │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │  Agent Server (8454)                            │    │    │
│  │  │  - Hono HTTP server                             │    │    │
│  │  │  - Claude Code SDK                              │    │    │
│  │  │  - MCP tool servers                             │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  │                                                           │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │  Volume (persistent)                             │    │    │
│  │  │  - .hybrid/memory/                              │    │    │
│  │  │  - scheduler.db                                │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  │                                                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  fly.toml:                                                      │
│  [services]                                                     │
│    internal_port = 8454                                         │
│    [[services.ports]]                                           │
│      port = "443"                                               │
│      handlers = ["tls", "http"]                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits:**
- Persistent volume for SQLite databases
- Full Node.js runtime
- Easy scaling with `fly scale count`
- Regional deployment for latency

**Deploy:**
```bash
hybrid deploy fly
```

### Cloudflare Workers + Containers

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge Network                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Gateway Worker (edge)                        │    │
│  │                                                           │    │
│  │  GET /health → health check                               │    │
│  │  POST /api/chat → ensureAgentServer() → proxy            │    │
│  │                                                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          │                                       │
│                          ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           Sandbox Durable Object (per teamId)            │    │
│  │                                                           │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │  Container                                       │    │    │
│  │  │  - node dist/server/index.cjs                    │    │    │
│  │  │  - Processes started on-demand                   │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  │                                                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          │                                       │
│                          ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    R2 Bucket                              │    │
│  │  - Persisted data across container restarts               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  wrangler.jsonc:                                                │
│  {                                                               │
│    "durable_objects": {                                          │
│      "bindings": [{ "name": "AgentContainer", "class_name": "Sandbox" }]
│    },                                                            │
│    "containers": [{ "class_name": "Sandbox", "max_instances": 50 }],
│    "r2_buckets": [{ "binding": "AGENT_STORAGE", ... }]         │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits:**
- Edge deployment for low latency
- Automatic scaling (0 to N instances)
- R2 for stateless persistence
- No server management

**Deploy:**
```bash
hybrid deploy cf
```

### Node.js (Self-Hosted)

```
┌─────────────────────────────────────────────────────────────────┐
│                      Node.js Server                              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Process: Agent Server (8454)                            │    │
│  │  node dist/server/index.cjs                              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Filesystem:                                                    │
│  .hybrid/                                                       │
│  ├── dist/                                                      │
│  ├── memory/                                                    │
│  └── scheduler.db                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits:**
- Full control over environment
- Any cloud provider or bare metal
- Easy local development

**Deploy:**
```bash
hybrid build
# Ship .hybrid/ to server
node dist/server/index.cjs
```

---

## Container Lifecycle

### Fly.io

```yaml
# fly.toml
app = "my-agent"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[deploy]
  strategy = "rolling"

[mounts]
  source = "data"
  destination = "/app/.hybrid"

[services]
  internal_port = 8454
  [[services.ports]]
    port = "443"
    handlers = ["tls", "http"]
```

### Cloudflare Containers

```typescript
// Container lifecycle in gateway
async function ensureAgentServer(sandbox: Sandbox): Promise<boolean> {
  // 1. Wait for container (up to 30s)
  const processes = await sandbox.listProcesses()
  if (!processes) return false
  
   // 2. Check for server process
   const hasServer = processes.some(p => p.command.includes("server/index"))
  
  // 3. Health check
  const healthy = await healthCheck()
  
  // 4. If unhealthy, restart
  if (!healthy) {
    await sandbox.killAllProcesses()
     await sandbox.startProcess("node dist/server/index.cjs")
     await waitForPort(8454, { timeout: 30000 })
  }
  
  return true
}
```

---

## Persistence Patterns

### SQLite with Volume (Fly.io)

```
.hybrid/
│  ├── memory/
│   ├── ACL.md               # Access control
│   ├── MEMORY.md            # Auto memory
│   ├── users/               # Per-user memory
│   ├── life/                # PARA graph
│   └── logs/                 # Daily logs
└── scheduler.db             # Job storage
```

**Volume configuration:**
```bash
fly volumes create data --size 10 --region sjc
fly mounts set data --path /app/.hybrid
```

### R2 for Stateless (Cloudflare)

```typescript
// Persist agent data across container restarts
if (globalThis.AGENT_STORAGE) {
  const existing = await globalThis.AGENT_STORAGE.get(`agent-data.db`)
  if (existing) {
    await writeFile(dbPath, await existing.arrayBuffer())
  }
}

// After operations, upload to R2
if (globalThis.AGENT_STORAGE) {
  const dbContent = await readFile(dbPath)
  await globalThis.AGENT_STORAGE.put(`agent-data.db`, dbContent)
}
```

---

## Scaling Strategies

### Vertical Scaling (Fly.io)

```bash
# Increase VM size
fly scale vm shared-cpu-2x  # 2 CPU, 4GB RAM
fly scale vm dedicated-cpu-4x  # 4 CPU, 8GB RAM

# Increase volume size
fly volumes extend data --size 20
```

### Horizontal Scaling (Cloudflare)

```jsonc
// wrangler.jsonc
{
  "containers": [{
    "class_name": "Sandbox",
    "instance_type": "standard-1",
    "max_instances": 100  // Auto-scaling limit
  }]
}
```

### Multi-Region (Fly.io)

```bash
# Deploy to multiple regions
fly regions add sjc
fly regions add fra
fly regions add syd

# Regional volume
fly volumes create data --region sjc
fly volumes create data --region fra
```

---

## Network Architecture

### Port Allocation

| Service | Port | Purpose |
|---------|------|---------|
| Agent Server | 8454 | HTTP API |
| Telegram Adapter | 8456 | Telegram bridge (planned) |
| Slack Adapter | 8457 | Slack bridge (planned) |
| WebSocket Adapter | 8458 | WebSocket bridge (planned) |

### HTTP IPC Pattern

All communication between components uses HTTP:

```typescript
// Channel adapter → Agent server
await fetch("http://localhost:8454/api/chat", {
  method: "POST",
  body: JSON.stringify({ messages, chatId, userId })
})

// Scheduler → Channel adapter
await dispatchToChannel({
  channel: "telegram",
  to: "user-123",
  message: "Scheduled reminder"
})
```

**Why HTTP IPC?**
- Language agnostic (any process can call)
- Independently deployable adapters
- Easy debugging with curl
- No shared state between processes

---

## Security Model

### Secret Management

```bash
# Never commit to git
echo "OPENROUTER_API_KEY=sk-or-v1..." >> .env
echo ".env" >> .gitignore

# Use secrets in production
fly secrets set OPENROUTER_API_KEY=sk-or-v1...
# Or
wrangler secret put OPENROUTER_API_KEY
```

```typescript
// In agent server
const role = getRole(parseACL(workspaceDir), userId)

// Only owners can access file operations
if (role !== "owner" && tool.includes("file")) {
  throw new Error("Unauthorized: file operations require owner role")
}

// Guests can only read/write their own memory
if (role === "guest") {
  memoryPath = `.hybrid/memory/users/${userId}/`
}
```

### Path Sanitization

```typescript
// Block path traversal
function sanitizePath(path: string): string {
  const resolved = path.resolve(baseDir, path)
  if (!resolved.startsWith(baseDir)) {
    throw new Error("Path traversal blocked")
  }
  return resolved
}
```

---

## Monitoring

### Health Check

```typescript
// GET /health
{
  "status": "healthy",
  "timestamp": "2026-03-02T15:30:00.000Z",
  "services": {
    "server": true,
    "sidecar": true,
    "memory": true,
    "scheduler": true
  }
}
```

### Fly.io Metrics

```bash
# CPU usage
fly metrics

# Logs
fly logs

# Status
fly status
```

### Cloudflare Analytics

- Built-in Worker analytics
- Container logs via dashboard
- R2 bucket metrics

---

## Cost Estimation

### Fly.io

| Component | Cost |
|-----------|------|
| Shared-cpu-1x VM | ~$2/mo |
| 10GB Volume | ~$1/mo |
| Outbound bandwidth | ~$5/TB |
| **Estimated monthly** | **$3-10** |

### Cloudflare Workers

| Component | Cost |
|-----------|------|
| Workers requests | Free (100k/day) |
| Container time | ~$0.02/hour |
| R2 storage | ~$0.015/GB |
| **Estimated monthly** | **$5-20** |

---

## Failover & Recovery

### Scheduler Recovery

```typescript
// On startup, clear stale markers
scheduler.start()

// Jobs with runningAtMs > 2 hours ago are unstuck
// Missed jobs are run immediately
```

### Memory Recovery

```typescript
// SQLite is ACID
// No corruption risk on crash

// Rebuild index if needed
await manager.sync({ force: true })
```

---

## Development Workflow

### Local Development

```bash
# Terminal 1: Agent server
pnpm --filter hybrid/agent dev

# Or:
hybrid dev
```

### Testing

```bash
pnpm test           # Run all tests
pnpm --filter @hybrd/memory test  # Single package
```

### Debugging

```bash
# Enable debug logging
ANTHROPIC_LOG=debug hybrid dev

# Check processes
ps aux | grep node

# Check ports
lsof -i :8454
```