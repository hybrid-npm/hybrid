---
name: memory
description: Multi-layer memory system for persistent storage and semantic search.
---

# Memory Storage

Persistent memory system with semantic search, PARA organization, and multi-user isolation.

## searchMemory

Search across all memory sources using hybrid vector + keyword search.

**Parameters:**
- `query` (string, required): Search query
- `maxResults` (number, optional, default: 10): Maximum results to return
- `minScore` (number, optional, default: 0.3): Minimum relevance score

**Example:**
```json
{
  "query": "project deadline",
  "maxResults": 5
}
```

## readMemoryFile

Read a specific memory file or section.

**Parameters:**
- `relPath` (string, required): Relative path to the memory file
- `from` (number, optional): Start line number
- `lines` (number, optional): Number of lines to read

**Example:**
```json
{
  "relPath": "MEMORY.md",
  "from": 1,
  "lines": 50
}
```

## logFact

Log a fact to the daily log for future reference.

**Parameters:**
- `content` (string, required): The fact to log

**Example:**
```json
{
  "content": "User prefers morning meetings"
}
```

## addMemory

Add information to the auto-memory system.

**Parameters:**
- `category` (string, required): Memory category
  - `preferences` - User preferences
  - `learnings` - Learned information
  - `decisions` - Decisions made
  - `context` - Context about current situation
  - `notes` - General notes
- `content` (string, required): Content to add
- `userId` (string, optional): User-specific memory

**Example:**
```json
{
  "category": "preferences",
  "content": "Timezone: America/Chicago"
}
```

## createEntity

Create a structured entity in PARA organization.

**Parameters:**
- `name` (string, required): Entity name
- `bucket` (string, required): PARA bucket
  - `projects` - Active projects
  - `areas` - Ongoing areas
  - `resources` - Reference resources
  - `archives` - Inactive items

**Example:**
```json
{
  "name": "Q1 Roadmap",
  "bucket": "projects"
}
```

## addFact

Add an atomic fact to a PARA entity.

**Parameters:**
- `entityPath` (string, required): Path to the entity
- `fact` (string, required): The fact to add
- `category` (string, required): Fact category
  - `milestone` - Key milestones
  - `status` - Current status
  - `relationship` - Relationships
  - `preference` - Preferences
  - `user-signal` - User signals

**Example:**
```json
{
  "entityPath": "projects/Q1 Roadmap",
  "fact": "Launch target: March 30",
  "category": "milestone"
}
```

## Memory Sources

| Source | Description |
|--------|-------------|
| `memory` | Shared MEMORY.md and memory/*.md files |
| `user` | Per-user isolated memory |
| `conversation` | Conversation history |

## PARA Buckets

- **Projects**: Active work with defined outcomes
- **Areas**: Ongoing responsibilities
- **Resources**: Reference material
- **Archives**: Inactive items

## Best Practices

- Log important facts using `logFact` for chronological tracking
- Use `addMemory` to store user preferences and context
- Organize long-term information in PARA entities
- Search memory before asking users for information already known
