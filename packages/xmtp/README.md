# Enhanced XMTP SDK with Robust Reliability 🚀

This package provides an enhanced XMTP client with robust connection management, retry logic, and health monitoring capabilities.

## Links

- Main repo: [github.com/ian/hybrid](https://github.com/ian/hybrid)
- Website & docs: [hybrid.dev](https://hybrid.dev)

### XMTP Plugin Filters

You can scope which messages are processed by providing XMTP Agent SDK filters to the plugin. These are the same built-in filters and combinators documented in the Agent SDK.

```typescript
import { XMTPPlugin } from "@hybrd/xmtp"
import { filter } from "hybrid"

// As a standalone plugin instance
const xmtp = XMTPPlugin({
  filters: [
    filter.isText,
    filter.not(filter.isFromSelf),
    filter.startsWith("@agent")
  ]
})
```

When using the Hybrid server `listen()` helper, pass `filters` directly (the helper wires them into `XMTPPlugin` under the hood):

```typescript
await agent.listen({
  port: process.env.PORT || "8454",
  filters: [filter.isText, filter.startsWith("@agent")] 
})
```

See the Agent SDK documentation for all available filters and the `withFilter` helper: https://github.com/xmtp/xmtp-js/tree/main/sdks/agent-sdk#3-builtin-filters

## 🆙 Upgraded Features

- **XMTP Node SDK**: Upgraded to `^3.1.0` (latest version)
- **Enhanced Connection Management**: Automatic reconnection and health monitoring
- **Robust Retry Logic**: Exponential backoff and configurable retry strategies
- **Health Monitoring**: Real-time connection health tracking with metrics
- **Production Ready**: Built for scalable, reliable XMTP integrations

## 🏗️ Architecture Overview

Your system uses a **"Thin Listener + QStash Callbacks"** architecture that already provides excellent reliability:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ XMTP Network│───▶│Thin Server  │───▶│   QStash    │
│             │    │(Enhanced)   │    │ (Reliable)  │
└─────────────┘    └─────────────┘    └─────────────┘
                                              │
                                              ▼
                   ┌─────────────┐    ┌─────────────┐
                   │   Agent     │◀───│App/Webhook  │
                   │ Processing  │    │ (Scalable)  │
                   └─────────────┘    └─────────────┘
```

### ✅ Built-in Reliability Features

1. **QStash Automatic Retries**: Built-in exponential backoff
2. **No Persistent Connections**: Eliminates connection drop issues
3. **Horizontal Scalability**: Multiple instances supported
4. **Dead Letter Queues**: Failed messages are preserved
5. **At-least-once Delivery**: Messages guaranteed to be processed

## 🔧 Enhanced Connection Management

### Basic Usage

```typescript
import { 
  createSigner, 
  createXMTPConnectionManager,
  type XMTPConnectionConfig 
} from "@hybrd/xmtp"

// Enhanced connection with reliability features
const signer = createSigner(process.env.AGENT_WALLET_KEY!)

const connectionConfig: XMTPConnectionConfig = {
  maxRetries: 5,                    // Connection attempts
  retryDelayMs: 1000,              // Base retry delay
  healthCheckIntervalMs: 30000,     // Health check interval
  connectionTimeoutMs: 15000,       // Connection timeout
  reconnectOnFailure: true          // Auto-reconnect
}

const connectionManager = await createXMTPConnectionManager(
  signer, 
  connectionConfig
)

// Get health metrics
const health = connectionManager.getHealth()
console.log('Connection Health:', health)
```

### Advanced Production Usage

```typescript
import { RobustXMTPService } from "@hybrd/xmtp/scripts/enhanced-connection-example"

const service = new RobustXMTPService()
await service.start()

// Process messages with automatic retry/reconnection
await service.processMessage(conversationId, "Hello!")

// Monitor health
const health = service.getConnectionHealth()
if (!health?.isConnected) {
  console.warn("XMTP connection unhealthy")
}
```

## 🔄 Connection Health Monitoring

The enhanced client provides real-time health metrics:

```typescript
interface XMTPConnectionHealth {
  isConnected: boolean          // Current connection status
  lastHealthCheck: Date         // Last health check timestamp
  consecutiveFailures: number   // Failed health checks in a row
  totalReconnects: number       // Total reconnection attempts
  avgResponseTime: number       // Average response time in ms
}
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pnpm with-env pnpm --filter @hybrd/xmtp install
```

### 2. Run Enhanced Connection Demo

```bash
pnpm with-env pnpm --filter @hybrd/xmtp enhanced:demo
```

### 3. Integrate in Your Code

```typescript
// Replace basic XMTP client creation
// OLD:
const client = await createXMTPClient(signer)

// NEW: With enhanced reliability
const connectionManager = await createXMTPConnectionManager(signer, {
  maxRetries: 5,
  healthCheckIntervalMs: 30000,
  reconnectOnFailure: true
})
const client = connectionManager.getClient()
```

## 📊 Why Your Current Architecture is Already Robust

Your **QStash-based webhook system** already provides superior reliability compared to traditional streaming:

### Traditional Streaming Issues ❌
- Connection drops require manual reconnection
- Memory leaks from long-running connections  
- Difficult to scale horizontally
- Complex heartbeat/keepalive management
- Single point of failure

### Your QStash Architecture Benefits ✅
- **Automatic Retries**: QStash handles exponential backoff
- **No Connection Drops**: Stateless webhook calls
- **Horizontal Scaling**: Multiple app instances supported
- **Built-in Monitoring**: QStash provides delivery metrics
- **Dead Letter Queues**: Failed messages preserved
- **At-least-once Delivery**: Guaranteed message processing

## 🔧 Configuration Options

### Environment Variables

| Variable                 | Description                              | Default                                 |
| ------------------------ | ---------------------------------------- | --------------------------------------- |
| `XMTP_STORAGE_PATH`      | Custom path for XMTP database storage    | `.data/xmtp` (relative to project root) |
| `AGENT_WALLET_KEY`        | Private key for agent wallet              | Required                                |
| `AGENT_SECRET` | Encryption key for database              | Required for persistent mode            |
| `XMTP_ENV`               | XMTP environment (`dev` or `production`) | `dev`                                   |
| `PROJECT_ROOT`           | Override project root path               | Auto-detected                           |

### Connection Configuration

```typescript
interface XMTPConnectionConfig {
  maxRetries?: number              // Default: 5
  retryDelayMs?: number           // Default: 1000ms
  healthCheckIntervalMs?: number  // Default: 30000ms  
  connectionTimeoutMs?: number    // Default: 10000ms
  reconnectOnFailure?: boolean    // Default: true
}
```

### Custom Storage Location

You can specify a custom storage location for XMTP database files:

```bash
# Absolute path
export XMTP_STORAGE_PATH=/custom/path/to/xmtp/storage

# Relative path (relative to current working directory)
export XMTP_STORAGE_PATH=./custom/xmtp/storage

# Use with pnpm with-env
pnpm with-env your-xmtp-command
```

### Testing Custom Storage

Run the custom storage example to test your configuration:

```bash
# Test with default storage location
pnpm with-env pnpm --filter @hybrd/xmtp custom:storage

# Test with custom storage location
export XMTP_STORAGE_PATH=/tmp/my-custom-xmtp-storage
pnpm with-env pnpm --filter @hybrd/xmtp custom:storage

# Test with relative path
export XMTP_STORAGE_PATH=./my-xmtp-data
pnpm with-env pnpm --filter @hybrd/xmtp custom:storage
```

## 🛠️ Available Scripts

| Script             | Command                                      | Description                       |
| ------------------ | -------------------------------------------- | --------------------------------- |
| `keys`             | `pnpm --filter @hybrd/xmtp keys`             | Generate new XMTP wallet keys     |
| `register`         | `pnpm --filter @hybrd/xmtp register`         | Register wallet on XMTP network   |
| `revoke`           | `pnpm --filter @hybrd/xmtp revoke`           | Revoke old XMTP installations     |
| `enhanced:demo`    | `pnpm --filter @hybrd/xmtp enhanced:demo`    | Demo enhanced connection features |
| `test:messages`    | `pnpm --filter @hybrd/xmtp test:messages`    | Test message reception            |
| `refresh:identity` | `pnpm --filter @hybrd/xmtp refresh:identity` | Refresh XMTP identity             |
| `custom:storage`   | `pnpm --filter @hybrd/xmtp custom:storage`   | Test custom storage configuration |

> **Note**: Always use `pnpm with-env` to ensure environment variables are loaded:
> ```bash
> pnpm with-env pnpm --filter @hybrd/xmtp <script-name>
> ```

## 🎯 Best Practices

### 1. Use Connection Manager for Long-Running Services
```typescript
// For services that need persistent XMTP connections
const manager = await createXMTPConnectionManager(signer, config)
```

### 2. Leverage Your Existing QStash Architecture  
```typescript
// For message processing, your webhook system is ideal
// No changes needed - it's already robust!
```

### 3. Monitor Connection Health
```typescript
setInterval(() => {
  const health = connectionManager.getHealth()
  if (health.consecutiveFailures > 3) {
    console.warn("XMTP connection degraded")
  }
}, 60000)
```

### 4. Use Environment Variables
```typescript
// Always use the project's environment wrapper
pnpm with-env [your-command]
```

## 🧪 Testing

Run the enhanced connection demo to see health monitoring in action:

```bash
# Start the demo (runs for 2 minutes showing health checks)
pnpm with-env pnpm --filter @hybrd/xmtp enhanced:demo
```

## 🔍 Debugging

Enable debug logging:

```bash
DEBUG=xmtp-sdk* pnpm with-env pnpm --filter @hybrd/xmtp enhanced:demo
```

## 📈 Metrics & Monitoring

The enhanced client provides detailed metrics:

- **Connection Status**: Real-time connection state
- **Response Times**: Average XMTP response latency  
- **Failure Counts**: Track connection reliability
- **Reconnection Events**: Monitor stability over time

## 🚨 Migration Guide

### From Basic XMTP Client

```typescript
// Before
const client = await createXMTPClient(signer)

// After  
const manager = await createXMTPConnectionManager(signer)
const client = manager.getClient()

// Remember to cleanup
await manager.disconnect()
```

### Keep Your Webhook Architecture

**No changes needed!** Your QStash webhook system is already providing:
- ✅ Automatic retries with exponential backoff
- ✅ Reliable message delivery guarantees  
- ✅ Horizontal scalability
- ✅ Built-in monitoring and alerting
- ✅ Dead letter queue handling

## 📚 Additional Resources

- [XMTP Node SDK Documentation](https://xmtp.org/docs/build/get-started/overview)
- [QStash Documentation](https://upstash.com/docs/qstash)
- [Project Architecture](../../ARCHITECTURE.md)

---

Your system is already built with production-grade reliability. The enhanced XMTP client provides additional connection management features for edge cases, but your webhook-based architecture is the recommended approach for scalable XMTP integrations! 🎉 

# XMTP Package

This package provides XMTP client functionality and various resolvers for address, ENS, and basename resolution.

## Resolvers

### Master Resolver

The `Resolver` class provides a unified interface for all resolution types:

```typescript
import { Resolver } from '@hybrd/xmtp/resolver'
import { createPublicClient, http } from 'viem'
import { mainnet, base } from 'viem/chains'

// Create clients
const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http()
})

const baseClient = createPublicClient({
  chain: base,
  transport: http()
})

// Initialize the master resolver
const resolver = new Resolver({
  xmtpClient: yourXmtpClient,
  mainnetClient,
  baseClient,
  maxCacheSize: 1000,
  cacheTtl: 3600000 // 1 hour
})

// Universal name resolution
const address = await resolver.resolveName('vitalik.eth')
const basenameAddress = await resolver.resolveName('myname.base.eth')

// Universal reverse resolution  
const name = await resolver.resolveAddressToName('0x...')

// Get complete profile (ENS + basename data)
const profile = await resolver.getCompleteProfile('0x...')

// Individual resolver methods are also available
const ensName = await resolver.resolveENSName('vitalik.eth')
const basename = await resolver.getBasename('0x...')
const message = await resolver.findMessage('messageId')
```

### Individual Resolvers

You can also use individual resolvers directly:

- `AddressResolver` - XMTP address resolution
- `XmtpResolver` - XMTP message and address resolution with advanced features
- `ENSResolver` - ENS name resolution
- `BasenameResolver` - Basename resolution for Base network

```typescript
import { ENSResolver, BasenameResolver } from '@hybrd/xmtp/resolver'

const ensResolver = new ENSResolver({ mainnetClient })
const basenameResolver = new BasenameResolver({ publicClient: baseClient })
```  