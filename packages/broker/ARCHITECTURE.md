# Stateful Connection Broker - Technical Specification

## Executive Summary

The **Stateful Connection Broker** is a long-running Node.js service that maintains persistent connections (WebSockets/TCP) to external providers while bridging events to stateless serverless handlers. It acts as a durable middleware layer between real-time provider connections and ephemeral compute.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL PROVIDERS                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │   XMTP   │  │ Telephony│  │  X.com   │  │ Farcaster│  │  Discord │      │
│  │    WS    │  │   TCP    │  │    WS    │  │    WS    │  │    WS    │      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│       │             │             │             │             │             │
└───────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┘
        │             │             │             │             │
        ▼             ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STATEFUL CONNECTION BROKER                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Provider Registry                               │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │   │
│  │  │XMTPProvider│  │TelcoProvider│ │ XProvider  │  │DiscProvider│    │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Event Normalizer                                  │   │
│  │           (Provider-specific → Internal Event Schema)                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Connection Manager                                │   │
│  │  • Socket lifecycle management                                       │   │
│  │  • Reconnection with exponential backoff                            │   │
│  │  • Health monitoring & heartbeats                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Request-Response Bridge                           │   │
│  │  • Correlation ID tracking                                           │   │
│  │  • Timeout management (1-5 min)                                     │   │
│  │  • Response routing                                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              STATE STORE (Redis)                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │  Session Store  │  │ Pending Requests│  │  Connection     │            │
│  │  socketId→      │  │ correlationId→  │  │  Metadata       │            │
│  │  sessionId      │  │  {timeout,ctx}  │  │  health/stats   │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HANDLER TRIGGER LAYER                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Handler Dispatcher                                │   │
│  │  • HTTP POST to serverless functions                                │   │
│  │  • gRPC for low-latency requirements                                │   │
│  │  • Cloud SDK invocation (Lambda, Cloud Run, etc.)                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       STATELESS SERVERLESS HANDLERS                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Handler  │  │ Handler  │  │ Handler  │  │ Handler  │  │ Handler  │     │
│  │ (1-5min) │  │ (1-5min) │  │ (1-5min) │  │ (1-5min) │  │ (1-5min) │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Flow

### Inbound Event Flow (Provider → Handler)

1. **Provider Connection**: External provider sends message via WebSocket/TCP
2. **Provider Adapter**: Provider-specific adapter receives raw payload
3. **Event Normalization**: Raw payload → `InternalEvent` schema
4. **Session Resolution**: Socket ID → Session ID mapping via Redis
5. **Request Registration**: Create correlation ID, store in pending requests
6. **Handler Dispatch**: Trigger serverless handler with normalized event
7. **Await Response**: Block on correlation ID (with timeout)

### Outbound Response Flow (Handler → Provider)

1. **Handler Response**: Serverless returns result via HTTP callback
2. **Correlation Lookup**: Find pending request by correlation ID
3. **Response Normalization**: `InternalResponse` → Provider-specific format
4. **Socket Routing**: Route to correct socket via session mapping
5. **Upstream Delivery**: Send response to provider connection
6. **Cleanup**: Remove pending request, update metrics

---

## 3. Core Components

### 3.1 Internal Event Schema

```typescript
interface InternalEvent {
  // Correlation & Routing
  correlationId: string          // UUID for request-response matching
  sessionId: string              // Persistent session identifier
  socketId: string               // Current connection identifier
  
  // Provider Metadata
  provider: ProviderType         // 'xmtp' | 'telephony' | 'x' | 'farcaster' | 'discord'
  providerEventType: string      // Original event type from provider
  
  // Normalized Payload
  eventType: NormalizedEventType // 'message' | 'reaction' | 'presence' | 'system'
  payload: {
    content: string | Buffer
    contentType: string          // 'text/plain' | 'application/json' | 'audio/wav'
    metadata: Record<string, unknown>
  }
  
  // Sender Information
  sender: {
    id: string                   // Provider-specific sender ID
    displayName?: string
    metadata?: Record<string, unknown>
  }
  
  // Conversation Context
  conversation: {
    id: string                   // Provider-specific conversation ID
    type: 'dm' | 'group' | 'channel'
    metadata?: Record<string, unknown>
  }
  
  // Timestamps
  timestamp: number              // Unix timestamp (ms)
  receivedAt: number             // Broker receive time
}
```

### 3.2 Internal Response Schema

```typescript
interface InternalResponse {
  correlationId: string
  success: boolean
  
  // Response Payload
  payload?: {
    content: string | Buffer
    contentType: string
    metadata?: Record<string, unknown>
  }
  
  // Error Information
  error?: {
    code: string
    message: string
    retryable: boolean
  }
  
  // Directives
  directives?: {
    suppressUpstream?: boolean   // Don't send response to provider
    delay?: number               // Delay before sending (ms)
    ttl?: number                 // Response validity (ms)
  }
  
  // Metrics
  handlerDuration: number        // Handler execution time (ms)
  timestamp: number
}
```

---

## 4. Concurrency Model

### Design Principles

1. **Non-blocking I/O**: All provider connections use async/await with Node.js event loop
2. **Connection Pooling**: Maintain connection pools per provider
3. **Backpressure Handling**: Queue overflow protection with configurable limits
4. **Graceful Degradation**: Circuit breakers for downstream failures

### Scaling Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    BROKER CLUSTER                                │
│                                                                  │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│   │ Broker 1 │  │ Broker 2 │  │ Broker 3 │  │ Broker N │      │
│   │ (1000    │  │ (1000    │  │ (1000    │  │ (1000    │      │
│   │  conns)  │  │  conns)  │  │  conns)  │  │  conns)  │      │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│        │             │             │             │              │
│        └─────────────┴──────┬──────┴─────────────┘              │
│                             │                                    │
│                    ┌────────▼────────┐                          │
│                    │  Redis Cluster  │                          │
│                    │  (shared state) │                          │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

### Connection Limits (per Broker Instance)

| Metric | Target | Max |
|--------|--------|-----|
| WebSocket connections | 1,000 | 5,000 |
| TCP connections | 500 | 2,000 |
| Pending requests | 10,000 | 50,000 |
| Memory usage | 512MB | 2GB |

---

## 5. State Store (Redis)

### Key Schemas

```
# Session mapping
session:{sessionId}:socket → socketId
socket:{socketId}:session → sessionId

# Connection metadata
connection:{socketId} → {
  provider: string
  connectedAt: number
  lastHeartbeat: number
  messageCount: number
}

# Pending requests (with TTL)
pending:{correlationId} → {
  sessionId: string
  socketId: string
  provider: string
  event: InternalEvent
  createdAt: number
  timeout: number
}

# Provider health
health:{provider}:{instanceId} → {
  status: 'healthy' | 'degraded' | 'unhealthy'
  lastCheck: number
  errorCount: number
}
```

### TTL Strategy

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `pending:*` | 6 minutes | Request timeout + buffer |
| `session:*` | 24 hours | Session persistence |
| `connection:*` | 1 hour | Connection metadata |
| `health:*` | 5 minutes | Health check freshness |

---

## 6. Handler Trigger Mechanisms

### 6.1 HTTP POST (Primary)

```typescript
interface HandlerRequest {
  method: 'POST'
  url: string                    // Handler endpoint
  headers: {
    'Content-Type': 'application/json'
    'X-Correlation-Id': string
    'X-Broker-Signature': string // HMAC signature
  }
  body: {
    event: InternalEvent
    callbackUrl: string          // Response callback
  }
  timeout: 300000                // 5 minutes
}
```

### 6.2 gRPC (Low-latency)

```protobuf
service BrokerHandler {
  rpc HandleEvent(InternalEvent) returns (InternalResponse);
  rpc StreamEvents(stream InternalEvent) returns (stream InternalResponse);
}
```

### 6.3 Cloud SDK (AWS Lambda / GCP Cloud Run)

```typescript
// AWS Lambda invocation
await lambda.invoke({
  FunctionName: 'message-handler',
  InvocationType: 'RequestResponse',
  Payload: JSON.stringify(event)
})

// GCP Cloud Run
await fetch(cloudRunUrl, {
  method: 'POST',
  body: JSON.stringify(event)
})
```

---

## 7. Reliability Features

### Reconnection Strategy

```typescript
const reconnectConfig = {
  initialDelay: 1000,      // 1 second
  maxDelay: 60000,         // 1 minute max
  multiplier: 2,           // Exponential backoff
  jitter: 0.1,             // 10% randomization
  maxAttempts: Infinity    // Never give up
}
```

### Health Monitoring

1. **Heartbeat**: Provider-specific keepalive messages
2. **Liveness Probe**: `/health/live` endpoint
3. **Readiness Probe**: `/health/ready` (all providers connected)
4. **Metrics**: Prometheus-compatible `/metrics` endpoint

### Circuit Breaker

```typescript
const circuitBreakerConfig = {
  failureThreshold: 5,     // Failures before opening
  successThreshold: 3,     // Successes to close
  timeout: 30000,          // Time in open state
  volumeThreshold: 10      // Min requests to evaluate
}
```

---

## 8. Observability

### Logging

- **Structured JSON logs** with correlation IDs
- **Log levels**: DEBUG, INFO, WARN, ERROR
- **Sensitive data redaction**

### Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `broker_connections_active` | Gauge | provider |
| `broker_events_received_total` | Counter | provider, event_type |
| `broker_events_dispatched_total` | Counter | provider, handler |
| `broker_handler_latency_seconds` | Histogram | handler |
| `broker_errors_total` | Counter | provider, error_type |

### Tracing

- OpenTelemetry integration
- Trace context propagation to handlers
- Span attributes: provider, event_type, correlation_id

---

## 9. Security

### Authentication

- **Provider credentials**: Securely stored in environment/secrets manager
- **Handler authentication**: HMAC signatures on all requests
- **mTLS**: Optional for high-security deployments

### Rate Limiting

```typescript
const rateLimitConfig = {
  perConnection: {
    messagesPerSecond: 10,
    burstSize: 50
  },
  perProvider: {
    messagesPerSecond: 1000,
    burstSize: 5000
  }
}
```

---

## 10. Technology Choices

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Node.js 22 | Existing ecosystem, async I/O |
| HTTP Server | Hono | Already in use, fast |
| State Store | Redis | Pub/sub, TTL, clustering |
| WebSocket | ws | Mature, performant |
| Serialization | JSON + msgpack | Interop + performance |
| Observability | OpenTelemetry | Standard, portable |
| Testing | Vitest | Already in monorepo |
