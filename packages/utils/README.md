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

### Date Formatting

```typescript
import { formatDate, formatRelativeDate } from "@hybrd/utils"

formatDate(new Date())                    // "Mar 2, 2026"
formatRelativeDate(new Date())            // "Today, 3:45 PM"
```

### Logger

Environment-aware logger. Debug output is suppressed unless `DEBUG` is set:

```typescript
import { logger } from "@hybrd/utils"

logger.debug("Verbose detail")    // Only logs if DEBUG env var is set
logger.log("General message")
logger.info("Info message")
logger.warn("Warning")
logger.error("Error occurred")
```

### Markdown

```typescript
import { stripMarkdown } from "@hybrd/utils"

const plain = await stripMarkdown("**bold** and _italic_ text")
```

### Object

```typescript
import { stringifyValues, pruneEmpty } from "@hybrd/utils"

stringifyValues({ a: 1, b: { nested: true } })
pruneEmpty({ a: 1, b: undefined, c: null, d: "" })  // { a: 1 }
```

### String

```typescript
import { truncate } from "@hybrd/utils"

truncate("A very long string that needs to be shortened", 20)
// "A very long string t..."
```

### URLs

Resolves the base URL for the agent service, with priority:  
`AGENT_URL` env → `http://localhost:8454`

```typescript
import { getUrl } from "@hybrd/utils"

getUrl()               // "http://localhost:8454"
getUrl("/api/chat")    // "http://localhost:8454/api/chat"
```

### UUID

Cross-platform UUID v4 generation:

```typescript
import { randomUUID } from "@hybrd/utils"

randomUUID()  // "550e8400-e29b-41d4-a716-446655440000"
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DEBUG` | Enable debug logging |
| `AGENT_URL` | Override agent service base URL |

## Testing

```bash
cd packages/utils
pnpm test
```

## License

MIT
