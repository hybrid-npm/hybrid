# @hybrd/memory

Multi-layer memory system for Hybrid AI agents with **100% OpenClaw compatibility** and extended features for multi-user isolation, PARA organization, and structured fact management.

## Overview

The memory system provides persistent storage and semantic search for agent knowledge. It implements the complete OpenClaw memory API while adding:

- **3-Layer PARA Memory Architecture** - Projects, Areas, Resources, Archives
- **Multi-User ACL System** - Owner/guest roles with wallet-based isolation
- **Atomic Fact Management** - Structured facts with decay tiers and supersession
- **Daily Log System** - Event, fact, decision, and action logging
- **Conversation Storage** - Per-user conversation history for context

## OpenClaw Compatibility

This memory system implements the complete OpenClaw MemoryIndexManager API:

### Core Types

```typescript
type MemorySource = "memory" | "sessions" | "user" | "conversation"

interface MemorySearchResult {
  path: string
  startLine: number
  endLine: number
  score: number
  snippet: string
  source: MemorySource
  citation?: string
  scope?: MemoryScope
}

interface MemorySearchManager {
  search(query: string, opts?: { maxResults?, minScore?, scope? }): Promise<MemorySearchResult[]>
  readFile(params: { relPath, from?, lines? }): Promise<{ text, path }>
  status(): MemoryProviderStatus
  sync?(params?: { reason?, force?, progress? }): Promise<void>
  probeEmbeddingAvailability(): Promise<{ ok, error? }>
  probeVectorAvailability(): Promise<boolean>
  close?(): Promise<void>
}
```

### Memory Sources

| Source | OpenClaw | Hybrid | Description |
|--------|:--------:|:------:|-------------|
| `memory` | ✅ | ✅ | MEMORY.md + memory/*.md files |
| `sessions` | ✅ | ✅ | Session transcripts |
| `user` | ❌ | ✅ | Per-user isolated memory |
| `conversation` | ❌ | ✅ | Conversation history |

### Embedding Providers

| Provider | OpenClaw | Hybrid |
|----------|:--------:|:------:|
| `openai` | ✅ | ✅ |
| `gemini` | ✅ | ✅ |
| `voyage` | ✅ | ✅ |
| `mistral` | ✅ | ✅ |
| `local` | ✅ | ✅ |
| `auto` | ✅ | ✅ |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Hybrid Memory Architecture                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Layer 1: PARA Memory (Structured)                 │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │    │
│  │  │  Projects   │  │   Areas     │  │  Resources  │  │  Archives   │ │    │
│  │  │  (Active)   │  │ (Ongoing)   │  │ (Reference) │  │  (Inactive) │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │    │
│  │                                                                       │    │
│  │  Each entity: { items.json, summary.md }                             │    │
│  │  Atomic facts with: category, status, decay tier, access count       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Layer 2: Daily Log (Chronological)                │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  logs/2026-03-01.md  →  [FACT] [DECISION] [ACTION] [EVENT]    │  │    │
│  │  │  logs/2026-03-02.md  →  Timestamped, append-only entries      │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Layer 3: Auto Memory (Categorized)                │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  MEMORY.md                                                     │  │    │
│  │  │  ## User Preferences  ## Learnings  ## Decisions              │  │    │
│  │  │  ## Context           ## Notes                                │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Memory Index (SQLite + Embeddings)               │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │    │
│  │  │  chunks table   │  │ chunks_fts (FTS5)│  │ embedding_cache    │ │    │
│  │  │  (content hash) │  │ (full-text)     │  │ (deduplication)    │ │    │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Features

### Hybrid Search

Combines vector similarity and BM25 keyword matching:

```typescript
const results = await manager.search("project deadline", {
  maxResults: 10,
  minScore: 0.5
})
```

### Multi-User ACL

Role-based access control for memory isolation:

```typescript
import { parseACL, getRole, addOwner } from "@hybrd/memory"

const acl = parseACL(workspaceDir)
const role = getRole(acl, userId)  // "owner" | "guest"

// Owners: read/write shared + any user memory
// Guests: read/write only their own user memory
```

### PARA Fact Management

Structured fact storage with decay tiers:

```typescript
import { createEntity, addFact, searchFacts, computeDecayTier } from "@hybrd/memory"

// Create entity in PARA bucket
await createEntity(workspaceDir, "Project Alpha", "projects", "projects")

// Add atomic fact
await addFact(workspaceDir, entityPath, "Deadline is March 15", "milestone")

// Search with decay awareness
const results = await searchFacts(workspaceDir, "deadline", {
  bucket: "projects",
  includeCold: false  // Exclude cold (old, unaccessed) facts
})

// Decay tiers: hot (< 7 days), warm (< 30 days), cold (> 30 days)
// High access count facts stay warm longer
```

### Daily Log System

Append-only chronological logging:

```typescript
import { logFact, logDecision, logAction, readLog } from "@hybrd/memory"

await logFact(workspaceDir, "User prefers dark mode")
await logDecision(workspaceDir, "Use PostgreSQL for persistence")
await logAction(workspaceDir, "Deployed v1.2.3 to production")

const todayLog = await readLog(workspaceDir, "2026-03-01")
```

### Auto Memory Categories

Categorized memory sections:

```typescript
import { appendToMemory, readMemorySection } from "@hybrd/memory"

await appendToMemory(workspaceDir, {
  category: "preferences",
  content: "Timezone: America/Chicago"
}, userId, role)

const preferences = await readMemorySection(workspaceDir, "preferences", userId, role)
```

## Directory Structure

```
.hybrid/memory/
├── ACL.md                    # Access control list
├── MEMORY.md                 # Shared auto-memory
├── users/
│   └── 0x.../               # Per-user memory
│       ├── MEMORY.md
│       └── conversations/
│           └── conv-id.json
├── conversations/           # All conversations
│   └── 0x.../
│       └── conv-id.json
├── life/                    # PARA system
│   ├── projects/
│   │   └── ProjectName/
│   │       ├── items.json   # Atomic facts
│   │       └── summary.md   # Generated summary
│   ├── areas/
│   ├── resources/
│   └── archives/
└── logs/                    # Daily logs
    ├── 2026-03-01.md
    └── 2026-03-02.md
```

## API Reference

### MemoryIndexManager

```typescript
import { MemoryIndexManager } from "@hybrd/memory"

const manager = await MemoryIndexManager.get({
  agentId: "main",
  workspaceDir: process.cwd(),
  config: resolvedConfig,
  userId: "0x...",
  conversationId: "conv-123"
})

// Search memory
const results = await manager.search("query", { maxResults: 10 })

// Read file snippet
const { text } = await manager.readFile({
  relPath: "memory/2026-03-01.md",
  from: 1,
  lines: 50
})

// Sync index
await manager.sync({ force: true })

// Check status
const status = manager.status()
// { backend, provider, model, files, chunks, vector, fts, ... }
```

### PARA Functions

```typescript
import {
  createEntity,
  addFact,
  supersedeFact,
  accessFact,
  searchFacts,
  generateSummary,
  rewriteSummaries,
  computeDecayTier
} from "@hybrd/memory"

// Entity management
await createEntity(workspaceDir, "EntityName", "projects", "projects")

// Fact management
await addFact(workspaceDir, entityPath, "New fact", "milestone")
await supersedeFact(workspaceDir, entityPath, oldFactId, "Updated fact")
await accessFact(entityPath, factId)  // Updates lastAccessed, accessCount

// Search and summary
const facts = await searchFacts(workspaceDir, "query", { bucket: "projects" })
const summary = await generateSummary(entityPath, entityName)

// Decay computation
const tier = computeDecayTier(fact)  // "hot" | "warm" | "cold"
```

### ACL Functions

```typescript
import {
  parseACL,
  getRole,
  addOwner,
  removeOwner,
  listOwners
} from "@hybrd/memory"

const acl = parseACL(workspaceDir)
const role = getRole(acl, walletAddress)

await addOwner(workspaceDir, "0x...")
await removeOwner(workspaceDir, "0x...")
const owners = listOwners(acl)
```

### Daily Log Functions

```typescript
import {
  logEvent,
  logFact,
  logDecision,
  logAction,
  readLog,
  extractFactsFromLog,
  extractDecisionsFromLog
} from "@hybrd/memory"

await logFact(workspaceDir, "Fact content")
await logDecision(workspaceDir, "Decision made")
await logAction(workspaceDir, "Action taken")

const log = await readLog(workspaceDir, "2026-03-01")
const facts = await extractFactsFromLog(workspaceDir, "2026-03-01")
const decisions = await extractDecisionsFromLog(workspaceDir, "2026-03-01")
```

### Conversation Functions

```typescript
import {
  saveConversation,
  loadConversation,
  listConversations,
  conversationToMemoryChunks
} from "@hybrd/memory"

await saveConversation({
  dir: memoryDir,
  userId: "0x...",
  conversationId: "conv-123",
  messages: [{ role: "user", content: "Hello" }]
})

const conversation = await loadConversation({
  dir: memoryDir,
  userId: "0x...",
  conversationId: "conv-123"
})

const conversations = await listConversations({ dir: memoryDir, userId: "0x..." })
```

## Configuration

```typescript
import { resolveMemoryConfig, getDefaultMemoryConfig } from "@hybrd/memory"

const config = resolveMemoryConfig({
  enabled: true,
  sources: ["memory", "user", "conversation"],
  extraPaths: ["../docs"],
  provider: "openai",
  model: "text-embedding-3-small",
  fallback: "local",
  store: {
    driver: "sqlite",
    path: "~/.hybrid/memory/{agentId}.sqlite",
    vector: { enabled: true }
  },
  chunking: {
    tokens: 400,
    overlap: 80
  },
  query: {
    maxResults: 10,
    minScore: 0.3,
    hybrid: {
      enabled: true,
      vectorWeight: 0.7,
      textWeight: 0.3
    }
  }
})
```

## Feature Comparison

| Feature | OpenClaw | Hybrid | Notes |
|---------|:--------:|:------:|-------|
| **Search** |
| Vector search | ✅ | ✅ | Identical |
| BM25/FTS search | ✅ | ✅ | Identical |
| Hybrid search | ✅ | ✅ | Identical |
| MMR re-ranking | ✅ | ❌ | Not implemented |
| Temporal decay | ✅ | ✅ | Via PARA decay tiers |
| **Memory Sources** |
| MEMORY.md | ✅ | ✅ | Identical |
| memory/*.md | ✅ | ✅ | Identical |
| Sessions | ✅ | ✅ | Identical |
| Per-user isolation | ❌ | ✅ | NEW |
| Conversation history | ❌ | ✅ | NEW |
| **Organization** |
| Daily logs | ✅ | ✅ | Identical |
| PARA buckets | ❌ | ✅ | NEW |
| Atomic facts | ❌ | ✅ | NEW |
| Fact decay tiers | ❌ | ✅ | NEW |
| Fact supersession | ❌ | ✅ | NEW |
| **Access Control** |
| ACL system | ❌ | ✅ | NEW |
| Owner/guest roles | ❌ | ✅ | NEW |
| Wallet-based auth | ❌ | ✅ | NEW |
| **Storage** |
| SQLite index | ✅ | ✅ | Identical |
| sqlite-vec | ✅ | ✅ | Identical |
| Embedding cache | ✅ | ✅ | Identical |
| **Providers** |
| OpenAI | ✅ | ✅ | Identical |
| Gemini | ✅ | ✅ | Identical |
| Voyage | ✅ | ✅ | Identical |
| Mistral | ✅ | ✅ | Identical |
| Local (node-llama-cpp) | ✅ | ✅ | Identical |
| **Backends** |
| Built-in SQLite | ✅ | ✅ | Identical |
| QMD sidecar | ✅ | ❌ | Not implemented |

## Hybrid-Specific Additions

### 1. 3-Layer PARA Memory System

OpenClaw uses flat memory files. Hybrid adds structured organization:

```
Layer 1: PARA (Projects/Areas/Resources/Archives)
         - Structured entity storage
         - Atomic facts with metadata
         - Decay tier computation

Layer 2: Daily Log
         - Chronological entries
         - Event/Fact/Decision/Action types
         - Timestamped, append-only

Layer 3: Auto Memory
         - Categorized sections
         - Preferences/Learnings/Decisions/Context/Notes
```

### 2. Multi-User ACL System

OpenClaw has single-user memory. Hybrid adds:

```typescript
// ACL.md in workspace root
## Owners

- 0xabc123...  # Added 2026-03-01
- 0xdef456...  # Added 2026-03-02

// Role permissions:
// Owner: read/write all memory
// Guest: read/write only own user memory
```

### 3. Atomic Fact Management

OpenClaw stores plain text. Hybrid adds structured facts:

```typescript
interface AtomicFact {
  id: string
  fact: string
  category: "relationship" | "milestone" | "status" | "preference" | "user-signal"
  timestamp: string
  source: string
  status: "active" | "superseded"
  supersededBy?: string       // Link to replacement fact
  relatedEntities: string[]
  lastAccessed: string
  accessCount: number         // Affects decay tier
}

// Decay tier computation:
// - accessCount >= 10: always "warm"
// - accessCount >= 5 && < 14 days: "hot"
// - < 7 days: "hot"
// - < 30 days: "warm"
// - > 30 days: "cold"
```

### 4. Per-User Memory Isolation

OpenClaw shares memory across all users. Hybrid isolates:

```
.hybrid/memory/
├── MEMORY.md              # Shared (owners only)
├── users/
│   ├── 0xalice/
│   │   └── MEMORY.md      # Alice's private memory
│   └── 0xbob/
│       └── MEMORY.md      # Bob's private memory
```

### 5. Conversation History Storage

OpenClaw indexes sessions. Hybrid adds structured conversation storage:

```typescript
interface ConversationEntry {
  id: string
  userId: string
  conversationId: string
  messages: Array<{ role, content, timestamp }>
  createdAt: number
  updatedAt: number
}

// Stored as JSON per conversation
// Can be chunked and indexed for search
```

## Usage Example

```typescript
import {
  MemoryIndexManager,
  resolveMemoryConfig,
  parseACL,
  getRole,
  logFact,
  addFact,
  createEntity
} from "@hybrd/memory"

// Initialize
const config = resolveMemoryConfig({ provider: "openai" })
const manager = await MemoryIndexManager.get({
  agentId: "main",
  workspaceDir: process.cwd(),
  config,
  userId: "0xalice"
})

// Check ACL
const acl = parseACL(process.cwd())
const role = getRole(acl, "0xalice")

// Log a fact
await logFact(process.cwd(), "User prefers morning meetings")

// Create PARA entity
await createEntity(process.cwd(), "Q1 Roadmap", "projects", "projects")

// Add structured fact
await addFact(
  process.cwd(),
  entityPath,
  "Launch target: March 30",
  "milestone"
)

// Search
const results = await manager.search("launch timeline", {
  maxResults: 5,
  scope: { type: "user", userId: "0xalice" }
})
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMORY_ENABLED` | `true` | Enable memory system |
| `MEMORY_PROVIDER` | `auto` | Embedding provider |
| `MEMORY_MODEL` | Provider default | Embedding model |
| `MEMORY_DB_PATH` | `~/.hybrid/memory/{agentId}.sqlite` | SQLite path |

## Testing

```bash
cd packages/memory
pnpm test
```

## License

MIT