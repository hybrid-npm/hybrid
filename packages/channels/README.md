# @hybrd/channels

Channel adapter framework for Hybrid AI agents. Provides a pluggable, uniform interface for connecting different messaging networks to the agent, with local HTTP IPC for inter-process communication.

## Overview

The channels package abstracts the "listen for inbound + deliver outbound" pattern behind a `ChannelAdapter` interface. The architecture supports adding Telegram, Slack, and other channels.

Key design decisions:
- **Local HTTP IPC**: All communication between the scheduler/dispatcher and channel adapters uses `http://127.0.0.1` on fixed ports — adapters are independently deployable processes
- **Port-based routing**: Each channel has a reserved port in `DEFAULT_ADAPTER_PORTS`
- **Decoupled from agent**: Adapters communicate with the agent via HTTP only, no direct function calls

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       @hybrd/channels                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  dispatchToChannel()                                               │
│    │                                                               │
│    └── POST http://127.0.0.1:{port}/api/trigger                   │
│             │                                                      │
│             ▼                                                      │
│    ┌─────────────────────┐                                         │
│    │   ChannelAdapter    │  configurable port                      │
│    │   ─────────────     │                                         │
│    │   Messaging client  │  ← inbound messages from network       │
│    │   Express server    │  ← outbound trigger from scheduler      │
│    │   runAgentAndReply()│  → POST {agentUrl}/api/chat             │
│    └─────────────────────┘                                         │
│                                                                    │
│  DEFAULT_ADAPTER_PORTS = { telegram: 8456, ... }                   │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

## Features

### dispatchToChannel

Send a message to a user via any registered channel:

```typescript
import { dispatchToChannel } from "@hybrd/channels"

const result = await dispatchToChannel({
  channel: "telegram",
  to: "user-123",   // Target user or conversation ID
  message: "Hello from the scheduler!",
  metadata: {
    accountId: "0xagent...",
    threadId: "optional-thread-id"
  }
})

// { delivered: boolean, messageId?: string, error?: string }
```

This POSTs a `TriggerRequest` to the adapter's local HTTP server.

### Creating a Channel Adapter

Implement the `ChannelAdapter` interface for your messaging platform:

```typescript
import { createChannelAdapter } from "@hybrd/channels"

const adapter = await createChannelAdapter({
  port: 8456,
  agentUrl: "http://localhost:8454",
  channelConfig: { /* platform-specific config */ }
})

await adapter.start()
await adapter.stop()
```

### Programmatic Trigger

```typescript
// Trigger directly without HTTP
const result = await adapter.trigger({
  to: "0xconversation-id-or-address",
  message: "Scheduled reminder",
  metadata: { accountId: "0xagent..." }
})
```

## Default Ports

```typescript
import { DEFAULT_ADAPTER_PORTS } from "@hybrd/channels"

console.log(DEFAULT_ADAPTER_PORTS)
// { telegram: 8456, slack: 8457, ... }
```

## Running as a Standalone Process

Channel adapters can run as independent processes with environment-based configuration.

## Adding a New Channel

1. Reserve a port in `DEFAULT_ADAPTER_PORTS`
2. Implement the `ChannelAdapter` interface from `@hybrd/types`:

```typescript
import type { ChannelAdapter, TriggerRequest, TriggerResponse } from "@hybrd/types"

class TelegramAdapter implements ChannelAdapter {
  channel = "telegram" as const
  port = 8456

  async start(): Promise<void> {
    // Connect to Telegram, start local HTTP server on this.port
  }

  async stop(): Promise<void> {
    // Close HTTP server
  }

  async trigger(req: TriggerRequest): Promise<TriggerResponse> {
    // Send message to Telegram user
  }
}
```

3. Export from `packages/channels/src/adapters/telegram/`

## Relation to Other Packages

- Types (`ChannelAdapter`, `TriggerRequest`, `TriggerResponse`, `CronDelivery`) come from `@hybrd/types`
- `dispatchToChannel()` is the counterpart to `SchedulerService`'s delivery mechanism in `@hybrd/scheduler`
- Communicates with `packages/agent` via HTTP — no direct imports from the agent package

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AGENT_URL` | Base URL for the agent server (default: `http://localhost:8454`) |

## Testing

```bash
cd packages/channels
pnpm test
```

## License

MIT
