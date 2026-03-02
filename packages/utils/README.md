# @hybrd/utils

General-purpose utility functions for the Hybrid AI agent framework. Compatible with Node.js, Cloudflare Workers, and browser environments.

## Overview

A collection of small helpers used across the monorepo. Includes environment detection, storage adapters, logging, date formatting, and cross-platform primitives.

## API Reference

### Array

```typescript
import { chunk, uniq, shuffle } from "@hybrd/utils"

chunk([1, 2, 3, 4, 5], 2)   // [[1, 2], [3, 4], [5]]
uniq([1, 1, 2, 3, 3])        // [1, 2, 3]
shuffle([1, 2, 3, 4])        // [3, 1, 4, 2] (random order)
```

### Cloudflare Environment Detection

Detects whether the code is running on Cloudflare Pages, Cloudflare Workers, or locally:

```typescript
import {
  getCloudflareEnvironment,
  getCloudflareStoragePath,
  getCloudflareServiceUrl
} from "@hybrd/utils"

const env = getCloudflareEnvironment()
// { isCloudflare: boolean, platform: 'pages' | 'workers' | 'local', storagePath: string }

// Returns '/tmp/xmtp' on Cloudflare, '.data/xmtp' locally
const storagePath = getCloudflareStoragePath("xmtp")

// Returns CF_PAGES_URL, CF_WORKER_URL, or 'http://localhost:3000'
const serviceUrl = getCloudflareServiceUrl(3000)
```

### Date Formatting

```typescript
import { formatDate, formatRelativeDate } from "@hybrd/utils"

formatDate(new Date())                    // "Mar 2, 2026"
formatDate("2026-01-15")                  // "Jan 15, 2026"

formatRelativeDate(new Date())            // "Today, 3:45 PM"
formatRelativeDate(yesterday)             // "Yesterday, 3:45 PM"
formatRelativeDate(lastWeek)              // "Feb 23, 3:45 PM"
formatRelativeDate(lastYear)              // "Feb 23, 2025"
```

### Logger

Environment-aware logger. Debug output is suppressed unless `DEBUG` or `XMTP_DEBUG` is set:

```typescript
import { logger } from "@hybrd/utils"

logger.debug("Verbose detail")    // Only logs if DEBUG or XMTP_DEBUG env var is set
logger.log("General message")
logger.info("Info message")
logger.warn("Warning")
logger.error("Error occurred")
```

### Markdown

```typescript
import { stripMarkdown } from "@hybrd/utils"

const plain = await stripMarkdown("**bold** and _italic_ text")
// "bold and italic text"
```

### Object

```typescript
import { stringifyValues, pruneEmpty } from "@hybrd/utils"

stringifyValues({ a: 1, b: { nested: true }, c: null })
// { a: "1", b: '{"nested":true}', c: "null" }

pruneEmpty({ a: 1, b: undefined, c: null, d: "" })
// { a: 1 }
```

### Storage

Auto-detects the available storage backend and returns an adapter:

```typescript
import { createStorageAdapter } from "@hybrd/utils"

const adapter = createStorageAdapter()
// Returns R2StorageAdapter if globalThis.XMTP_STORAGE exists (Cloudflare)
// Returns null if no storage is configured (local dev)

if (adapter) {
  await adapter.uploadFile("/local/path/file.db3", "remote/path/file.db3")
  await adapter.downloadFile("remote/path/file.db3", "/local/path/file.db3")
  const exists = await adapter.exists("remote/path/file.db3")
  await adapter.delete("remote/path/file.db3")
}
```

#### R2StorageAdapter

Used automatically on Cloudflare Workers when `globalThis.XMTP_STORAGE` is bound:

```typescript
import { R2StorageAdapter } from "@hybrd/utils"

const adapter = new R2StorageAdapter(env.XMTP_STORAGE)
await adapter.uploadFile(localPath, remotePath)
await adapter.downloadFile(remotePath, localPath)
```

### String

```typescript
import { truncate } from "@hybrd/utils"

truncate("A very long string that needs to be shortened", 20)
// "A very long string t..."
```

### URLs

Resolves the base URL for the agent service, with priority:  
`AGENT_URL` env → `RAILWAY_PUBLIC_DOMAIN` → `http://localhost:8454`

```typescript
import { getUrl } from "@hybrd/utils"

getUrl()               // "http://localhost:8454"
getUrl("/api/chat")    // "http://localhost:8454/api/chat"

// With AGENT_URL=https://my-agent.fly.dev
getUrl("/api/chat")    // "https://my-agent.fly.dev/api/chat"
```

### UUID

Cross-platform UUID v4 generation. Works in Node.js, Cloudflare Workers, and browsers:

```typescript
import { randomUUID } from "@hybrd/utils"

randomUUID()  // "550e8400-e29b-41d4-a716-446655440000"
```

Uses the `uuid` package rather than `node:crypto.randomUUID` for compatibility with environments where Node.js crypto is not available.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DEBUG` | Enable debug logging |
| `XMTP_DEBUG` | Enable debug logging (XMTP-specific alias) |
| `AGENT_URL` | Override agent service base URL |
| `RAILWAY_PUBLIC_DOMAIN` | Railway deployment domain (auto-set by Railway) |
| `CF_PAGES_BRANCH` | Set by Cloudflare Pages (used for environment detection) |
| `CF_WORKER_NAME` | Set by Cloudflare Workers (used for environment detection) |

## Testing

```bash
cd packages/utils
pnpm test
```

## License

MIT
