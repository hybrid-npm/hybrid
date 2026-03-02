# @hybrd/channels

Channel adapter framework for Hybrid AI agents. Provides a pluggable, uniform interface for connecting different messaging networks to the agent, with local HTTP IPC for inter-process communication.

## Overview

The channels package abstracts the "listen for inbound + deliver outbound" pattern behind a `ChannelAdapter` interface. Currently ships with a full XMTP adapter; the architecture supports adding Telegram, Slack, and other channels.

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
│    │   XMTPAdapter       │  port 8455                              │
│    │   ─────────────     │                                         │
│    │   XmtpAgent         │  ← inbound messages from XMTP network  │
│    │   Express server    │  ← outbound trigger from scheduler      │
│    │   runAgentAndReply()│  → POST {agentUrl}/api/chat             │
│    └─────────────────────┘                                         │
│                                                                    │
│  DEFAULT_ADAPTER_PORTS = { xmtp: 8455, ... }                      │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

## Features

### dispatchToChannel

Send a message to a user via any registered channel:

```typescript
import { dispatchToChannel } from "@hybrd/channels"

const result = await dispatchToChannel({
  channel: "xmtp",
  to: "0x...",        // Target address or conversation ID
  message: "Hello from the scheduler!",
  metadata: {
    accountId: "0xagent...",
    threadId: "optional-thread-id"
  }
})

// { delivered: boolean, messageId?: string, error?: string }
```

This POSTs a `TriggerRequest` to the adapter's local HTTP server at `http://127.0.0.1:8455/api/trigger`.

### XMTPAdapter

The XMTP channel adapter. Handles both inbound messages from the XMTP network and outbound triggers from the scheduler.

```typescript
import { createXMTPAdapter } from "@hybrd/channels"

const adapter = await createXMTPAdapter({
  port: 8455,
  agentUrl: "http://localhost:8454",
  xmtpEnv: "dev",
  walletKey: process.env.AGENT_WALLET_KEY!,
  dbEncryptionKey: process.env.AGENT_SECRET!,
  dbPath: "./.xmtp"
})

await adapter.start()   // Connects to XMTP, starts HTTP server
await adapter.stop()    // Closes HTTP server
```

**Inbound flow** (XMTP → agent):
1. XMTP text message arrives
2. Deduplicates by message ID
3. Finds conversation, builds reply context
4. POSTs to `{agentUrl}/api/chat`
5. Reads SSE stream, assembles full response
6. Sends reply via `conversation.send(reply)`

**Outbound flow** (scheduler → XMTP):
1. `POST /api/trigger` received on adapter's HTTP server
2. Finds target conversation
3. Calls `runAgentAndReply()` — same flow as inbound

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
// { xmtp: 8455 }
```

## Running as a Standalone Process

The XMTP adapter can run as an independent process:

```bash
# Environment variables required:
# AGENT_WALLET_KEY, AGENT_SECRET, XMTP_ENV, PORT (optional)

node packages/channels/src/adapters/xmtp/index.js
```

Or from the adapter entry point — reads config from env vars, prints a banner, and starts the adapter.

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
- The `XMTPAdapter` is a clean factoring of the sidecar logic in `packages/agent/src/xmtp.ts`
- Communicates with `packages/agent` via HTTP — no direct imports from the agent package

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AGENT_WALLET_KEY` | Private key for the agent's XMTP wallet |
| `AGENT_SECRET` | Encryption key for XMTP database |
| `XMTP_ENV` | XMTP environment: `dev` or `production` |
| `AGENT_URL` | Base URL for the agent server (default: `http://localhost:8454`) |

## Testing

```bash
cd packages/channels
pnpm test
```

## License

MIT
