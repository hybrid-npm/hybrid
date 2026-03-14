---
name: api-design
description: HTTP endpoints, SSE streaming, MCP tool servers, and API design patterns for Hybrid. Use when designing new endpoints, streaming responses, or integrating with the agent protocol.
---

# API Design

Hybrid uses HTTP for all inter-component communication with Server-Sent Events (SSE) for streaming responses.

## Agent Server API

**Base URL:** `http://localhost:8454`

### `POST /api/chat`

Execute agent and stream response.

#### Request

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

#### Response

Server-Sent Events stream:

```
data: {"type":"text","content":"Hello! How can I..."}
data: {"type":"tool-call-start","toolCallId":"tc1","toolName":"memory_search"}
data: {"type":"tool-call-delta","toolCallId":"tc1","argsTextDelta":"{\"query\":\""}
data: {"type":"tool-call-end","toolCallId":"tc1"}
data: {"type":"usage","inputTokens":450,"outputTokens":123,"totalCostUsd":0.0012}
data: [DONE]
```

#### Event Types

| Type | Description | Fields |
|------|-------------|--------|
| `text` | Text chunk | `content` |
| `tool-call-start` | Tool invocation started | `toolCallId`, `toolName` |
| `tool-call-delta` | Tool argument chunk | `toolCallId`, `argsTextDelta` |
| `tool-call-end` | Tool invocation complete | `toolCallId` |
| `usage` | Token usage | `inputTokens`, `outputTokens`, `totalCostUsd`, `numTurns` |
| `error` | Error occurred | `message` |

#### Example

```typescript
const response = await fetch("http://localhost:8454/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: [
      { id: "1", role: "user", content: "Hello!" }
    ],
    chatId: "conv-123",
    userId: "0xalice"
  })
})

const reader = response.body.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  
  const chunk = decoder.decode(value)
  const lines = chunk.split("\n").filter(l => l.startsWith("data: "))
  
  for (const line of lines) {
    if (line === "data: [DONE]") break
    
    const data = JSON.parse(line.slice(6))
    if (data.type === "text") {
      process.stdout.write(data.content)
    }
  }
}
```

### `GET /health`

Health check endpoint.

#### Response

```json
{
  "status": "healthy",
  "service": "hybrid-agent",
  "timestamp": "2026-03-02T15:30:00.000Z",
  "container": true,
  "sidecar": true,
  "server": true
}
```

---

## XMTP Sidecar API

**Base URL:** `http://localhost:8455`

### `POST /api/send`

Send outbound message from scheduler.

#### Request

```typescript
interface SendRequest {
  conversationId: string
  message: string
  metadata?: {
    accountId?: string
    threadId?: string
    replyToId?: string
  }
}
```

#### Response

```typescript
interface SendResponse {
  delivered: boolean
  messageId?: string
  error?: string
}
```

---

## SSE Streaming Pattern

### Encoding

```typescript
function encodeSSE(data: unknown): Uint8Array {
  const json = JSON.stringify(data)
  return new TextEncoder().encode(`data: ${json}\n\n`)
}

function encodeDone(): Uint8Array {
  return new TextEncoder().encode("data: [DONE]\n\n")
}
```

### Streaming in Hono

```typescript
app.post("/api/chat", async (c) => {
  const { messages, chatId, userId } = await c.req.json()
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of agent.stream(messages)) {
          controller.enqueue(encodeSSE(event))
        }
        controller.enqueue(encodeDone())
      } catch (error) {
        controller.enqueue(encodeSSE({ type: "error", message: error.message }))
      } finally {
        controller.close()
      }
    }
  })
  
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  })
})
```

### Client-Side Consumption

```typescript
async function* streamChat(messages: Message[]): AsyncGenerator<ChatEvent> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, chatId: "default" })
  })
  
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n\n")
    buffer = lines.pop()!
    
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6)
        if (data === "[DONE]") return
        yield JSON.parse(data)
      }
    }
  }
}

// Usage
for await (const event of streamChat(messages)) {
  if (event.type === "text") {
    process.stdout.write(event.content)
  }
}
```

---

## MCP Tool Server

The agent runs a unified MCP (Model Context Protocol) server for each request.

### Available Tools

| Tool | Category | Description |
|------|----------|-------------|
| `memory_search` | Memory | Search PARA memory |
| `memory_read` | Memory | Read memory file |
| `memory_write` | Memory | Write to memory |
| `memory_append` | Memory | Append to memory section |
| `para_create_entity` | Memory | Create PARA entity |
| `para_add_fact` | Memory | Add atomic fact |
| `para_search` | Memory | Search PARA graph |
| `schedule_task` | Scheduler | Create scheduled task |
| `list_tasks` | Scheduler | List scheduled tasks |
| `cancel_task` | Scheduler | Cancel task |
| `run_task` | Scheduler | Trigger task now |
| `file_read` | Files | Read workspace file |
| `file_write` | Files | Write workspace file |
| `file_edit` | Files | Edit file (find/replace) |
| `file_apply_patch` | Files | Apply unified diff |

### Tool Implementation

```typescript
import { createMemoryMcpServer } from "hybrid/agent"

const mcpServer = createMemoryMcpServer(workspaceDir, userId, role, acl)

// MCP server is attached to Claude Code SDK
const agent = new Agent({
  name: "my-agent",
  model: model,
  instructions: systemPrompt,
  tools: {
    ...mcpServer.tools,
    ...customTools
  }
})
```

### ACL Integration

```typescript
import { resolveUserRole } from "hybrid/agent"

// Resolve user role before creating MCP server
const { role, acl } = resolveUserRole(workspaceDir, userId)

// Tools respect role permissions:
// - Owner: all tools available
// - Guest: limited to own memory, no file operations

const mcpServer = createMemoryMcpServer(workspaceDir, userId, role, acl)
```

---

## Channel Adapter Protocol

All channel adapters implement the same interface:

```typescript
interface ChannelAdapter {
  readonly channel: ChannelId
  readonly port: number
  start(): Promise<void>
  stop(): Promise<void>
  trigger(req: TriggerRequest): Promise<TriggerResponse>
}

interface TriggerRequest {
  to: string
  message: string
  metadata?: {
    accountId?: string
    threadId?: string
    replyToId?: string
  }
}

interface TriggerResponse {
  delivered: boolean
  messageId?: string
  error?: string
}
```

### HTTP Trigger Endpoint

```typescript
// In adapter's HTTP server
app.post("/api/trigger", async (c) => {
  const request: TriggerRequest = await c.req.json()
  
  try {
    const response = await adapter.trigger(request)
    return c.json(response)
  } catch (error) {
    return c.json({ 
      delivered: false, 
      error: error.message 
    }, 500)
  }
})
```

### Dispatcher

```typescript
import { dispatchToChannel } from "@hybrd/channels"

// Called from scheduler
await dispatchToChannel({
  channel: "xmtp",
  to: "0xalice",
  message: "Your scheduled reminder"
})

// Internally: POST http://localhost:8455/api/trigger
```

---

## Request/Response Patterns

### Authentication

```typescript
// JWT for XMTP tool endpoints
import { generateXMTPToolsToken, validateXMTPToolsToken } from "@hybrd/xmtp"

// Generate
const token = generateXMTPToolsToken({
  action: "send",
  conversationId: "conv-123"
})

// Validate
app.use("/api/*", async (c, next) => {
  const token = c.req.header("Authorization")?.slice(7) // "Bearer ..."
  const payload = validateXMTPToolsToken(token)
  
  if (!payload) {
    return c.json({ error: "Invalid token" }, 401)
  }
  
  c.set("payload", payload)
  await next()
})
```

### Error Handling

```typescript
// Standard error response
interface ErrorResponse {
  error: string
  code: string
  details?: unknown
}

app.onError((err, c) => {
  console.error("Error:", err)
  
  if (err instanceof ValidationError) {
    return c.json({
      error: err.message,
      code: "VALIDATION_ERROR",
      details: err.fields
    }, 400)
  }
  
  if (err instanceof UnauthorizedError) {
    return c.json({
      error: "Unauthorized",
      code: "UNAUTHORIZED"
    }, 401)
  }
  
  return c.json({
    error: "Internal server error",
    code: "INTERNAL_ERROR"
  }, 500)
})
```

### Rate Limiting

```typescript
import { rateLimit } from "hono-rate-limiter"

app.use("/api/chat", rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  keyGenerator: (c) => c.get("userId") || c.req.header("X-Forwarded-For")
}))
```

---

## Hono Server Setup

```typescript
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"

const app = new Hono<{ Variables: { userId?: string } }>()

// Middleware
app.use("*", logger())
app.use("*", cors())

// Health check
app.get("/health", (c) => {
  return c.json({ status: "healthy", timestamp: new Date().toISOString() })
})

// Chat endpoint
app.post("/api/chat", async (c) => {
  const request: ChatRequest = await c.req.json()
  
  const stream = new ReadableStream({
    async start(controller) {
      // ... streaming logic
    }
  })
  
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache"
    }
  })
})

// Start server
export default app
```

---

## Webhook Patterns

### Scheduler Webhook

```typescript
// When scheduler triggers a job
interface SchedulerWebhook {
  jobId: string
  jobName: string
  payload: CronPayload
  delivery: CronDelivery
  timestamp: string
}

// POST to configured endpoint
await fetch(webhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(webhook)
})
```

### XMTP Webhook

```typescript
// For platforms that support webhooks
app.post("/webhooks/xmtp", async (c) => {
  const signature = c.req.header("X-XMTP-Signature")
  const body = await c.req.text()
  
  // Verify signature
  if (!verifySignature(signature, body)) {
    return c.json({ error: "Invalid signature" }, 401)
  }
  
  const event = JSON.parse(body)
  
  // Process XMTP event
  await handleXMTPEvent(event)
  
  return c.json({ received: true })
})
```

---

## Versioning

### API Version in Path

```typescript
const app = new Hono()

app.route("/v1", v1Routes)
app.route("/v2", v2Routes)

// v1 is current, v2 when breaking changes needed
```

### Version Header

```typescript
app.use("*", (c, next) => {
  const version = c.req.header("X-API-Version") || "1.0"
  c.set("apiVersion", version)
  return next()
})
```

---

## Testing

### Integration Test

```typescript
import { describe, it, expect } from "vitest"

describe("POST /api/chat", () => {
  it("streams text events", async () => {
    const response = await fetch("http://localhost:8454/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ id: "1", role: "user", content: "Hello" }],
        chatId: "test"
      })
    })
    
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("text/event-stream")
    
    // Consume stream
    const events = []
    for await (const event of parseSSE(response.body)) {
      events.push(event)
    }
    
    expect(events.some(e => e.type === "text")).toBe(true)
    expect(events[events.length - 1]).toEqual({ type: "done" })
  })
})
```

### Mock Agent

```typescript
import { Agent } from "@anthropic-ai/claude-agent-sdk"

function createMockAgent(): Agent {
  return new Agent({
    name: "test-agent",
    model: mockModel,
    instructions: "Test agent",
    tools: {
      echo: {
        description: "Echo input",
        inputSchema: z.object({ text: z.string() }),
        execute: async ({ input }) => ({ text: input.text })
      }
    }
  })
}
```

---

## Best Practices

### Stream Processing

1. **Use proper SSE format** — `data: {...}\n\n`
2. **Handle backpressure** — Don't buffer indefinitely
3. **Send heartbeats** — Keep connection alive
4. **Close properly** — Send `[DONE]` before closing

### Error Handling

1. **Log errors** — But don't leak internals
2. **Use error codes** — Machine-readable identifiers
3. **Include request ID** — For debugging
4. **Set proper status codes** — 400/401/403/500

### Performance

1. **Minimize latency** — Stream immediately
2. **Batch tool calls** — Reduce round trips
3. **Cache embeddings** — For memory search
4. **Use connection pooling** — For downstream services