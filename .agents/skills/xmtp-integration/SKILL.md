---
name: xmtp-integration
description: XMTP client creation, messaging, resolvers, and plugin architecture for Hybrid agents. Use when working with XMTP integration, message handling, identity resolution, or channel adapters.
---

# XMTP Integration

XMTP (Extensible Message Transport Protocol) provides decentralized, wallet-based messaging for Hybrid agents. The `@hybrd/xmtp` package wraps `@xmtp/node-sdk` with production-ready features.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        @hybrd/xmtp                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   XMTPPlugin (plugin.ts)                    │  │
│  │  ┌─────────────────┐  ┌───────────────────────────────┐   │  │
│  │  │  XmtpAgent      │  │  XmtpClient (low-level)       │   │  │
│  │  │  (listener)     │  │  (resolvers, direct API)      │   │  │
│  │  └─────────────────┘  └───────────────────────────────┘   │  │
│  │                                                             │  │
│  │  Behavior chain: executeBefore → agent.generate → send     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   Client (client.ts)                       │  │
│  │  createXMTPClient() → retry loop:                          │  │
│  │  1. Download .db3 from R2 (if bound)                      │  │
│  │  2. Create Client with codecs                              │  │
│  │  3. On install limit: revoke old → retry                   │  │
│  │  4. On identity error: refresh → retry                     │  │
│  │  5. Upload .db3 to R2 after connect                        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   Resolvers (resolver/)                     │  │
│  │  Resolver → AddressResolver, ENSResolver, BasenameResolver  │  │
│  │              XmtpResolver (inbox IDs + message chains)      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Client Creation

### Basic Creation

```typescript
import { createXMTPClient } from "@hybrd/xmtp"

const client = await createXMTPClient(process.env.AGENT_WALLET_KEY!, {
  persist: true,
  maxRetries: 3,
  storagePath: ".xmtp"
})
```

### With R2 Persistence

For stateless containers (Cloudflare Workers):

```typescript
// In globalThis setup
globalThis.XMTP_STORAGE = env.XMTP_STORAGE // R2Bucket binding

// Client automatically:
// 1. Downloads <inboxId>.db3 from R2 before connect
// 2. Uploads updated .db3 after connect
const client = await createXMTPClient(walletKey)
```

### Configuration Options

```typescript
interface ClientOptions {
  persist?: boolean           // Enable persistence (default: true)
  maxRetries?: number         // Install limit retry attempts (default: 3)
  storagePath?: string        // Custom DB path
  codecs?: ContentCodec[]     // Additional content codecs
}
```

---

## User/Signer Creation

```typescript
import { createUser, createSigner } from "@hybrd/xmtp"

// Create viem wallet client on Sepolia
const user = createUser(process.env.AGENT_WALLET_KEY!)
// { key: "0x...", account: "0x...", wallet: WalletClient }

// Create XMTP-compatible signer
const signer = createSigner(process.env.AGENT_WALLET_KEY!)
// { getIdentifier(): Promise<Identifier>, signMessage(message): Promise<Signature> }
```

---

## Connection Manager

For long-running services with health monitoring:

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
// {
//   isConnected: boolean
//   lastHealthCheck: Date
//   consecutiveFailures: number
//   totalReconnects: number
//   avgResponseTime: number
// }

await manager.disconnect()
```

---

## XMTPPlugin

Integrates XMTP into the agent framework:

```typescript
import { XMTPPlugin } from "@hybrd/xmtp"

const plugin = XMTPPlugin()

await agent.listen({
  port: "8454",
  plugins: [plugin],
  behaviors: [myBehavior()]
})
```

### Message Flow

For each incoming message (text, reply, reaction):

1. Build conversation history (up to 20 messages)
2. Create `AgentRuntime` with conversation, message, xmtpClient
3. Run `behaviors.executeBefore(context)` — stops if `context.stopped = true`
4. Call `agent.generate(messages, { runtime })`
5. Set `context.response = reply`
6. Run `behaviors.executeAfter(context)` — stops if `context.stopped = true`
7. Send reply (plain text or threaded via `ContentTypeReply`)

---

## Resolver

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
  cacheTtl: 3_600_000 // 1 hour
})
```

### Name Resolution

```typescript
// Universal (tries ENS then Basename)
const address = await resolver.resolveName("vitalik.eth")
const address2 = await resolver.resolveName("myname.base.eth")

// ENS specifically
const ensProfile = await resolver.getENSProfile("vitalik.eth")
// { ensName, address, avatar, description, twitter, github, url }

// Basename specifically
const basename = await resolver.getBasename("0x...")
const basenameProfile = await resolver.resolveBasenameProfile("0x...")
```

### Address Resolution

```typescript
// Reverse resolution (tries Basename then ENS)
const name = await resolver.resolveAddressToName("0x...")

// Complete profile
const profile = await resolver.getCompleteProfile("0x...")
// { address, ensName, basename, ensProfile, basenameProfile }
```

### XMTP-Specific

```typescript
// Resolve inbox ID to address
const address = await resolver.resolveAddress(inboxId, conversationId)

// Create sender object
const sender = await resolver.createXmtpSender(inboxId, conversationId)
// { address, inboxId, name, basename? }
```

### Message Resolution

```typescript
// Find message by ID
const message = await resolver.findMessage(messageId)

// Find root message (traverses reply chain)
const rootMessage = await resolver.findRootMessage(messageId)
```

### Mention Extraction

```typescript
import { extractSubjects } from "@hybrd/xmtp"

// Extract @basename.eth and @name.base.eth mentions
const subjects = await extractSubjects(messageContent, basenameResolver, ensResolver)
// { "vitalik": "0x...", "myname": "0x..." }
```

---

## Individual Resolvers

```typescript
import { 
  AddressResolver, 
  ENSResolver, 
  BasenameResolver, 
  XmtpResolver 
} from "@hybrd/xmtp/resolver"

const ensResolver = new ENSResolver({ mainnetClient })
const basenameResolver = new BasenameResolver({ publicClient: baseClient })
const addressResolver = new AddressResolver({ xmtpClient })
const xmtpResolver = new XmtpResolver({ xmtpClient })
```

---

## JWT Utilities

Secure XMTP tool API endpoints with short-lived JWTs:

```typescript
import { 
  generateXMTPToolsToken, 
  validateXMTPToolsToken, 
  getValidatedPayload 
} from "@hybrd/xmtp"

// Generate 5-minute token
const token = generateXMTPToolsToken({
  action: "send",
  conversationId: "conv-123",
  content: "Hello!"
})

// Validate (returns null if invalid/expired)
const payload = validateXMTPToolsToken(token)

// Extract from Hono request
const payload = getValidatedPayload(honoContext)
```

### Static API Key Alternative

```typescript
// Environment variable
process.env.XMTP_API_KEY = "your-static-key"

// In request headers
Authorization: Bearer your-static-key
```

---

## Content Types

Registered codecs:

```typescript
import {
  ContentTypeText,
  ContentTypeReply,
  ContentTypeReaction,
  ContentTypeGroupUpdated,
  ContentTypeTransactionReference,
  ContentTypeWalletSendCalls
} from "@hybrd/xmtp"
```

---

## Database Path Resolution

```typescript
import { getDbPath } from "@hybrd/xmtp"

const dbPath = await getDbPath("my-agent", "/custom/storage")
// Priority: XMTP_STORAGE_PATH env → storagePath param → .hybrid/.xmtp/
// If XMTP_STORAGE (R2) in globalThis, downloads existing DB first
```

---

## Encryption Key Generation

```typescript
import { generateEncryptionKeyHex } from "@hybrd/xmtp"

const key = generateEncryptionKeyHex() // 32-byte random hex string
```

---

## Sidecar Implementation

The XMTP sidecar (port 8455) bridges XMTP network to the agent server:

### Inbound Flow

```typescript
// XmtpAgent listens for messages
xmtpAgent.on("text", async (message) => {
  // 1. Deduplicate by message ID
  if (processedIds.has(message.id)) return
  processedIds.add(message.id)
  
  // 2. Build conversation history
  const conversation = await message.conversation
  const history = await conversation.messages({ limit: 20 })
  
  // 3. POST to agent server
  const response = await fetch("http://localhost:8454/api/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: buildMessages(history),
      chatId: conversation.topic,
      userId: senderAddress
    })
  })
  
  // 4. Read SSE stream
  const reader = response.body.getReader()
  let fullResponse = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    fullResponse += decodeSSE(value)
  }
  
  // 5. Send reply
  await conversation.send(fullResponse)
})
```

### Outbound Flow

```typescript
// POST /api/send endpoint
app.post("/api/send", async (c) => {
  const { conversationId, message } = await c.req.json()
  
  // Find conversation
  const conversation = await client.conversations.find(conversationId)
  
  // Send message
  await conversation.send(message)
  
  return c.json({ delivered: true })
})
```

---

## Installation Limit Handling

XMTP has a limit on concurrent installations. Automatic recovery:

```typescript
async function createXMTPClient(key: string, options: ClientOptions) {
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    try {
      // Try to create client
      const client = await Client.create(signer, { env: xmtpEnv })
      return client
    } catch (error) {
      lastError = error
      
      // Check for installation limit
      if (error.message?.includes("installation limit")) {
        // Extract inbox ID from error
        const inboxId = extractInboxId(error.message)
        
        // Revoke old installations
        await Client.revokeInstallations(inboxId)
        
        // Retry
        continue
      }
      
      // Check for identity error
      if (error.message?.includes("identity")) {
        await refreshIdentity(key)
        continue
      }
      
      throw error
    }
  }
  
  throw lastError
}
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENT_WALLET_KEY` | Private key for XMTP wallet | Required |
| `XMTP_ENV` | Environment: `dev` or `production` | `dev` |
| `XMTP_STORAGE_PATH` | Custom path for DB files | `.hybrid/.xmtp/` |
| `XMTP_API_KEY` | Static API key for tools | Optional |
| `XMTP_DEBUG` | Enable debug logging | `false` |

---

## Scripts

### Register Wallet

```bash
hybrid register
# or
pnpm --filter @hybrd/xmtp register
```

One-time registration on XMTP network. Creates identity and logs inbox ID.

### Revoke Installations

```bash
# Revoke specific inbox
hybrid revoke <inboxId>

# Auto-detect and revoke all
hybrid revoke-all
```

Use when hitting installation limits.

---

## Re-exports

All `@xmtp/node-sdk` types and codecs are re-exported:

```typescript
import {
  Client,
  Signer,
  type XmtpEnv,
  // Content types
  ContentTypeReaction,
  ContentTypeReply,
  ContentTypeGroupUpdated,
  ContentTypeTransactionReference,
  ContentTypeWalletSendCalls,
  ContentTypeText
} from "@hybrd/xmtp"
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Installation limit | Too many devices | Run `hybrid revoke-all` |
| Identity error | Corrupted identity | Auto-refresh, retry |
| Connection timeout | Network issues | Retry with backoff |
| Invalid signature | Wrong key format | Verify hex format |

### Retry Logic

```typescript
const client = await createXMTPClient(key, {
  maxRetries: 3
})
```

---

## Testing

```bash
cd packages/xmtp
pnpm test
```

---

## Integration with Agent

### Plugin Setup

```typescript
// In agent server
import { XMTPPlugin } from "@hybrd/xmtp"

const agent = new Agent({
  name: "my-agent",
  model: myModel,
  instructions: myInstructions,
  tools: myTools
})

// Add XMTP plugin
agent.use(XMTPPlugin())

// Start listening
await agent.listen({ port: 8454 })
```

### Behavior Chain

```typescript
import { BehaviorObject } from "@hybrd/types"

const myBehavior = (): BehaviorObject => ({
  id: "my-behavior",
  async before(context) {
    // Pre-process message
    const { message, conversation } = context.runtime
    
    // Stop chain if needed
    if (shouldIgnore(message)) {
      context.stopped = true
      return
    }
  },
  async after(context) {
    // Post-process response
    const { response } = context
    
    // Modify response
    context.response = response?.trim()
  }
})
```

---

## Debugging

### Connection Issues

```bash
# Check wallet key format
echo $AGENT_WALLET_KEY | grep -E '^0x[0-9a-f]{64}$'

# Check environment
echo $XMTP_ENV

# Test connection
pnpm --filter @hybrd/xmtp test:connection
```

### Message Issues

```typescript
// Enable debug logging
process.env.XMTP_DEBUG = "true"

// Log all messages
xmtpAgent.on("text", (message) => {
  console.log("[XMTP]", message.senderInboxId, message.content)
})
```

### Database Issues

```bash
# Check DB exists
ls -la .hybrid/.xmtp/*.db3

# Check R2 bucket (Cloudflare)
wrangler r2 object list hybrid-xmtp-databases

# Download DB from R2
wrangler r2 object get hybrid-xmtp-databases/<inboxId>.db3
```