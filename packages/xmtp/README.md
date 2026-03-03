# @hybrd/xmtp

XMTP integration library for Hybrid AI agents. Provides client creation with R2 database persistence, an `XMTPPlugin` for the agent framework, ENS/Basename/address resolvers, and JWT utilities.

## Overview

This package handles all XMTP network connectivity for Hybrid agents:

- **Client creation** with installation revocation, retry logic, and Cloudflare R2 database sync
- **XMTPPlugin** integrating XMTP into the `Agent` + `Plugin` framework architecture
- **Resolvers** for XMTP inbox IDs, ENS names, and Base network Basenames
- **JWT utilities** for securing XMTP tool API endpoints
- **Scripts** for wallet registration and installation management

## OpenClaw Compatibility

This package is a Hybrid-native XMTP integration, not derived from the OpenClaw SDK. It wraps `@xmtp/node-sdk` and `@xmtp/agent-sdk` with production-ready reliability features.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        @hybrd/xmtp                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   XMTPPlugin (plugin.ts)                     │  │
│  │  ┌────────────────────┐   ┌────────────────────────────┐    │  │
│  │  │  XmtpAgent         │   │  XmtpClient (low-level)    │    │  │
│  │  │  (event listener)  │   │  (resolvers, direct API)   │    │  │
│  │  └────────────────────┘   └────────────────────────────┘    │  │
│  │                                                               │  │
│  │  Behavior chain: executeBefore → agent.generate → send       │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   Client (client.ts)                         │  │
│  │  createXMTPClient() → retry loop:                           │  │
│  │  1. Download .db3 from R2 (if XMTP_STORAGE bound)           │  │
│  │  2. Create Client with codecs                                │  │
│  │  3. On install limit: revoke old → retry                     │  │
│  │  4. On identity error: refresh identity → retry              │  │
│  │  5. Upload .db3 to R2 after connect                          │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   Resolvers (resolver/)                       │  │
│  │  Resolver → AddressResolver, ENSResolver, BasenameResolver   │  │
│  │              XmtpResolver (inbox IDs + message chains)       │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

## Features

### Client Creation

```typescript
import { createXMTPClient } from "@hybrd/xmtp"

const client = await createXMTPClient(process.env.AGENT_WALLET_KEY!, {
  persist: true,         // Persist conversations locally
  maxRetries: 3,         // Installation revocation retry limit
  storagePath: ".xmtp"  // Custom DB storage path
})
```

**Automatic resilience:**
- If the installation limit is reached, revokes old installations and retries
- If an identity association error occurs, refreshes identity and retries
- If `XMTP_STORAGE` (Cloudflare R2) is in `globalThis`, downloads the `.db3` database before connecting and uploads it after — enabling stateless containers to persist XMTP state

Registered content type codecs: `Text`, `Reply`, `Reaction`, `WalletSendCalls`, `TransactionReference`

### User/Signer Creation

```typescript
import { createUser, createSigner } from "@hybrd/xmtp"

const user = createUser(process.env.AGENT_WALLET_KEY!)
// { key, account, wallet }  — viem wallet client on Sepolia

const signer = createSigner(process.env.AGENT_WALLET_KEY!)
// XMTP Signer: { getIdentifier(), signMessage() }
```

### Connection Manager

For long-running services that need health monitoring and auto-reconnection:

```typescript
import { XMTPConnectionManager } from "@hybrd/xmtp"

const manager = new XMTPConnectionManager(process.env.AGENT_WALLET_KEY!, {
  maxRetries: 5,
  retryDelayMs: 1000,
  healthCheckIntervalMs: 30000,
  connectionTimeoutMs: 15000,
  reconnectOnFailure: true
})

const client = await manager.connect()

const health = manager.getHealth()
// { isConnected, lastHealthCheck, consecutiveFailures, totalReconnects, avgResponseTime }

await manager.disconnect()
```

### XMTPPlugin

Integrates XMTP into the agent framework's `Plugin` architecture:

```typescript
import { XMTPPlugin } from "@hybrd/xmtp"

// Applied via agent.use() or agent.listen()
const plugin = XMTPPlugin()

await agent.listen({
  port: "8454",
  plugins: [plugin],
  behaviors: [myBehavior()]
})
```

For each incoming message (text, reply, reaction), the plugin:
1. Builds conversation history (up to 20 messages)
2. Creates `AgentRuntime` with conversation, message, and xmtpClient
3. Runs `behaviors.executeBefore(context)` — stops chain if `context.stopped = true`
4. Calls `agent.generate(messages, { runtime })`
5. Sets `context.response = reply`
6. Runs `behaviors.executeAfter(context)` — stops chain if `context.stopped = true`
7. Sends reply (plain text or threaded via `ContentTypeReply`)

### Resolver

Universal name and address resolution across XMTP, ENS, and Basenames:

```typescript
import { Resolver } from "@hybrd/xmtp"
import { createPublicClient, http } from "viem"
import { mainnet, base } from "viem/chains"

const resolver = new Resolver({
  xmtpClient,
  mainnetClient: createPublicClient({ chain: mainnet, transport: http() }),
  baseClient: createPublicClient({ chain: base, transport: http() }),
  maxCacheSize: 1000,
  cacheTtl: 3_600_000   // 1 hour
})

// Universal resolution (tries ENS then Basename)
const address = await resolver.resolveName("vitalik.eth")
const address2 = await resolver.resolveName("myname.base.eth")

// Reverse resolution (tries Basename then ENS)
const name = await resolver.resolveAddressToName("0x...")

// Complete profile
const profile = await resolver.getCompleteProfile("0x...")
// { address, ensName, basename, ensProfile, basenameProfile }

// XMTP-specific
const address3 = await resolver.resolveAddress(inboxId, conversationId)
const sender = await resolver.createXmtpSender(inboxId, conversationId)
// { address, inboxId, name, basename? }

// ENS
const ensProfile = await resolver.getENSProfile("vitalik.eth")
// { ensName, address, avatar, description, twitter, github, url }

// Basenames (Base network)
const basename = await resolver.getBasename("0x...")
const basenameProfile = await resolver.resolveBasenameProfile("0x...")

// Message resolution
const message = await resolver.findMessage(messageId)
const rootMessage = await resolver.findRootMessage(messageId)   // Traverses reply chain
```

#### Individual Resolvers

```typescript
import { AddressResolver, ENSResolver, BasenameResolver, XmtpResolver } from "@hybrd/xmtp/resolver"

const ensResolver = new ENSResolver({ mainnetClient })
const basenameResolver = new BasenameResolver({ publicClient: baseClient })
const addressResolver = new AddressResolver({ xmtpClient })
const xmtpResolver = new XmtpResolver({ xmtpClient })
```

### JWT Utilities

Secure XMTP tool API endpoints with short-lived JWTs:

```typescript
import { generateXMTPToolsToken, validateXMTPToolsToken, getValidatedPayload } from "@hybrd/xmtp"

// Generate a 5-minute token (signed with AGENT_SECRET)
const token = generateXMTPToolsToken({
  action: "send",
  conversationId: "conv-123",
  content: "Hello!"
})

// Validate (returns null if invalid or expired)
const payload = validateXMTPToolsToken(token)

// Extract from Hono request context (Authorization: Bearer or ?token=)
const payload = getValidatedPayload(honoContext)
```

`XMTP_API_KEY` env var is also accepted as a static alternative to JWT.

### Mention Extraction

```typescript
import { extractSubjects } from "@hybrd/xmtp"

// Extracts @basename.eth and @name.base.eth mentions and resolves to addresses
const subjects = await extractSubjects(messageContent, basenameResolver, ensResolver)
// { "vitalik": "0x...", "myname": "0x..." }
```

## Scripts

```bash
# Register wallet on XMTP network
hybrid register

# Revoke specific inbox installations
hybrid revoke <inboxId>

# Auto-detect inbox ID and revoke all installations
hybrid revoke-all
```

Or run directly:

```bash
pnpm --filter @hybrd/xmtp register
pnpm --filter @hybrd/xmtp revoke
pnpm --filter @hybrd/xmtp revoke-all
```

## Re-exports

This package re-exports the complete `@xmtp/node-sdk` surface and all content type codecs:

```typescript
import {
  Client,
  Signer,
  type XmtpEnv,
  // Content types:
  ContentTypeReaction,
  ContentTypeReply,
  ContentTypeGroupUpdated,
  ContentTypeTransactionReference,
  ContentTypeWalletSendCalls,
  ContentTypeText
} from "@hybrd/xmtp"
```

## Database Path Resolution

```typescript
import { getDbPath } from "@hybrd/xmtp"

const dbPath = await getDbPath("my-agent", "/custom/storage")
// Priority: XMTP_STORAGE_PATH env → storagePath param → .hybrid/.xmtp/
// If XMTP_STORAGE (R2) is in globalThis, downloads existing DB first
```

## Encryption Key Generation

```typescript
import { generateEncryptionKeyHex } from "@hybrd/xmtp"

const key = generateEncryptionKeyHex()  // 32-byte random hex string
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AGENT_WALLET_KEY` | Private key for the agent wallet (required) |
| `AGENT_SECRET` | Encryption key for XMTP database (required for persist mode) |
| `XMTP_ENV` | XMTP environment: `dev` or `production` (default: `dev`) |
| `XMTP_STORAGE_PATH` | Custom path for XMTP database files |
| `XMTP_API_KEY` | Static API key for XMTP tool endpoints (alternative to JWT) |
| `XMTP_DEBUG` | Enable debug logging |

## Testing

```bash
cd packages/xmtp
pnpm test
```

## License

MIT
