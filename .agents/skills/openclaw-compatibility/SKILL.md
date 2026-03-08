---
name: openclaw-compatibility
description: OpenClaw template format, memory conventions, and compatibility requirements for Hybrid. Use when working with agent templates, memory files, or ensuring OpenClaw feature parity.
---

# OpenClaw Compatibility

Hybrid maintains 100% feature parity with OpenClaw. All templates, memory formats, and behaviors work identically.

## Template Files

Templates are markdown files loaded in a specific order to build the agent's system prompt.

### Loading Order

1. `IDENTITY.md` — Agent identity (name, emoji, avatar)
2. `SOUL.md` — Personality and core truths
3. Custom system prompt (if provided in request)
4. `AGENTS.md` — Behavioral guidelines and workspace rules
5. `TOOLS.md` — Local tool and environment notes
6. `USER.md` — User profile (multi-tenant support)
7. Current timestamp
8. Conversation history
9. Memory search results

### IDENTITY.md

Agent identity metadata:

```markdown
# IDENTITY.md - Who Am I?

* **Name:** MyName
* **Creature:** AI assistant
* **Vibe:** Helpful, precise, slightly witty
* **Emoji:** 🤖
* **Avatar:** avatars/my-avatar.png

***

Additional identity notes.
```

**Location:** Project root or `.hybrid/IDENTITY.md`

### SOUL.md

Core personality and behavior:

```markdown
# SOUL.md - Who You Are

## Core Truths

**Be genuinely helpful.** Skip filler words. Just help.

**Have opinions.** An assistant with no personality is boring.

**Be resourceful before asking.** Try to figure it out first.

## Boundaries

* Private things stay private.
* Ask before external actions.
* Never send half-baked messages.

## Vibe

Concise when needed, thorough when it matters.

***

*This file evolves as you learn.*
```

**Location:** Project root

### AGENTS.md

Workspace-specific rules and memory management:

```markdown
# AGENTS.md - Your Workspace

## First Run

If `BOOTSTRAP.md` exists, follow it, then delete it.

## Every Session

1. Read `SOUL.md`
2. Read `USER.md`
3. Read `memory/YYYY-MM-DD.md` (today + yesterday)
4. If main session: read `MEMORY.md`

## Memory

* **Daily notes:** `memory/YYYY-MM-DD.md` — raw logs
* **Long-term:** `MEMORY.md` — curated memories

### MEMORY.md Security

* ONLY load in main session
* DO NOT load in group chats or shared contexts
* Contains personal context

## Safety

* No exfiltration
* Ask before destructive actions
* `trash` > `rm`

## Group Chats

Respond when directly mentioned or can add value.
Stay silent for casual ban.
Don't triple-tap.
```

**Location:** Project root

### USER.md

User profile for personalization:

```markdown
# USER.md - About Your Human

* **Name:** Alice
* **What to call them:** Alice
* **Pronouns:** she/her
* **Timezone:** America/Chicago
* **Notes:** Building a startup, prefers concise responses

## Context

Working on: [project details]
Prefers: [communication style]
Annoyed by: [pet peeves]
```

**Location:** Project root or `users/{userId}/USER.md`

### Multi-Tenant USER.md

```
PROJECT_ROOT/
├── USER.md              # Default/fallback
└── users/
    ├── 0xalice/
    │   └── USER.md      # Alice's profile
    └── 0xbob/
        └── USER.md      # Bob's profile
```

Resolution:
1. If `userId` provided → check `users/{userId}/USER.md`
2. Fallback to root `USER.md`

### TOOLS.md

Local environment notes:

```markdown
# TOOLS.md - Local Notes

## SSH Hosts

- home-server → 192.168.1.100, user: admin
- work-server → 10.0.0.50, user: deploy

## Preferred Voices

- Default: "Nova" (warm, slightly British)
- Fallback: "Echo"

## Environment

- Node 22.x
- pnpm 9.x
```

### BOOT.md

Startup instructions:

```markdown
# BOOT.md

On startup:
1. Check git status
2. Read recent memory files
3. Ask: "What should we work on?"
```

### BOOTSTRAP.md

First-run setup wizard. Delete after completion:

```markdown
# BOOTSTRAP.md - Hello, World

You just woke up. Time to figure out who you are.

## The Conversation

Start with: "Hey. I just came online. Who am I? Who are you?"

Then figure out:
1. Your name
2. Your nature
3. Your vibe
4. Your emoji

## After Setup

Update:
* `IDENTITY.md` — name, creature, vibe, emoji
* `USER.md` — their info

## When Done

Delete this file.
```

### HEARTBEAT.md

Periodic tasks. Empty file means no heartbeat:

```markdown
# HEARTBEAT.md

## Daily Checks

- Check emails for urgent messages
- Review calendar for upcoming events
- Check weather if relevant

## Track State

`memory/heartbeat-state.json`:
{
  "lastChecks": {
    "email": 1703275200,
    "calendar": 1703260800
  }
}
```

---

## Memory System

### File Structure

```
.hybrid/memory/
├── ACL.md                    # Access control
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
│   │       └── summary.md   # Hot/warm facts
│   ├── areas/
│   ├── resources/
│   └── archives/
└── logs/                    # Daily logs
    ├── 2026-03-01.md
    └── 2026-03-02.md
```

### MEMORY.md Format

```markdown
# MEMORY.md

## User Preferences

- **Timezone:** America/Chicago
- **Communication style:** Concise, technical
- **Preferred name:** Alice

## Learnings

- 2026-03-01: Prefers morning meetings
- 2026-03-02: Uses vim for editing

## Decisions

- 2026-03-01: Decided to use PostgreSQL for persistence

## Context

- Working on: Hybrid agent framework
- Tech stack: TypeScript, XMTP, SQLite

## Notes

- [Additional notes]
```

### Daily Log Format

`memory/2026-03-02.md`:

```markdown
# 2026-03-02

## [FACT] 09:15
User prefers dark mode for all applications.

## [DECISION] 10:30
Switched from MongoDB to PostgreSQL for better SQL support.

## [ACTION] 14:00
Deployed v1.2.3 to production.

## [EVENT] 16:45
Received feature request for multi-user memory isolation.
```

### PARA System

**Projects** — Active work with clear completion criteria
**Areas** — Ongoing responsibilities without end dates
**Resources** — Reference materials, topics of interest
**Archives** — Inactive items

```typescript
// Entity structure
interface Entity {
  name: string
  bucket: "projects" | "areas" | "resources" | "archives"
  items: AtomicFact[]
}

interface AtomicFact {
  id: string
  fact: string
  category: "relationship" | "milestone" | "status" | "preference" | "user-signal"
  timestamp: string
  source: string
  status: "active" | "superseded"
  supersededBy?: string
  relatedEntities: string[]
  lastAccessed: string
  accessCount: number
}
```

### Decay Tiers

| Tier | Condition | Search Inclusion |
|------|-----------|------------------|
| Hot | Accessed < 7 days OR 5+ accesses in 14 days | Always |
| Warm | Accessed < 30 days OR 10+ total accesses | Always |
| Cold | Not accessed in 30+ days | Excluded |

---

## Access Control (ACL.md)

```markdown
# ACL.md

## Owners

- 0xabc123...  # Added 2026-03-01
- 0xdef456...  # Added 2026-03-02

## Guests

- 0x789...    # Added 2026-03-03
```

### Permissions

| Role | Shared Memory | User Memory | File Ops |
|------|---------------|-------------|----------|
| Owner | Read/Write | All users | Yes |
| Guest | No | Own only | No |

### Resolution

```typescript
import { parseACL, getRole } from "@hybrd/memory"

const acl = parseACL(workspaceDir)
const role = getRole(acl, userId)

if (role === "owner") {
  // Full access
} else {
  // Guest: own memory only
}
```

---

## Feature Parity Table

| Feature | OpenClaw | Hybrid |
|---------|:--------:|:------:|
| `SOUL.md` + `AGENTS.md` config | ✅ | ✅ |
| `MEMORY.md` auto-memory | ✅ | ✅ |
| `memory/*.md` indexed files | ✅ | ✅ |
| Session transcripts | ✅ | ✅ |
| Vector search (sqlite-vec) | ✅ | ✅ |
| BM25 / FTS hybrid search | ✅ | ✅ |
| Embedding providers (openai, gemini, voyage, mistral, local, auto) | ✅ | ✅ |
| Daily logs | ✅ | ✅ |
| Skills (`SKILL.md` format) | ✅ | ✅ |
| Scheduler (cron / every / at) | ✅ | ✅ |
| **Per-user memory isolation** | ❌ | ✅ |
| **PARA knowledge graph** | ❌ | ✅ |
| **Atomic facts + decay tiers** | ❌ | ✅ |
| **Fact supersession** | ❌ | ✅ |
| **Multi-user ACL (wallet-based)** | ❌ | ✅ |
| **XMTP native messaging** | ❌ | ✅ |
| **Channel adapter framework** | ❌ | ✅ |
| **ENS + Basename resolution** | ❌ | ✅ |

---

## Skills System

### SKILL.md Format

```markdown
---
name: my-skill
description: What this skill does. Shown in skill listings.
---

# Skill Title

Detailed description of the skill and how to use it.

## Commands

### `command_name`

Description of what it does.

```bash
skill-command --option value
```

## Examples

...

## Notes

...
```

### Skill Locations

```
.hybrid/skills/
├── core/                    # Built-in skills
│   ├── memory/SKILL.md
│   └── xmtp/SKILL.md
└── ext/                     # User-installed skills
    └── my-skill/SKILL.md
```

### Installation

```bash
hybrid install github:user/repo
hybrid install @scope/skill-package
hybrid install ./local/path
```

---

## Memory API

### Search

```typescript
import { MemoryIndexManager } from "@hybrd/memory"

const manager = await MemoryIndexManager.get({
  agentId: "main",
  workspaceDir: process.cwd(),
  config: resolvedConfig,
  userId: "0xalice"
})

const results = await manager.search("project deadline", {
  maxResults: 10,
  minScore: 0.5,
  scope: { type: "user", userId: "0xalice" }
})
```

### PARA Operations

```typescript
import { createEntity, addFact, searchFacts } from "@hybrd/memory"

// Create entity
await createEntity(workspaceDir, "Project Alpha", "projects", "projects")

// Add fact
await addFact(workspaceDir, entityPath, "Deadline is March 15", "milestone")

// Search
const results = await searchFacts(workspaceDir, "deadline", {
  bucket: "projects",
  includeCold: false
})
```

### Daily Log

```typescript
import { logFact, logDecision, readLog } from "@hybrd/memory"

await logFact(workspaceDir, "User prefers morning meetings")
await logDecision(workspaceDir, "Use PostgreSQL for persistence")

const log = await readLog(workspaceDir, "2026-03-02")
```

---

## Porting from OpenClaw

### 1. Copy Config Files

```bash
cp /path/to/openclaw/SOUL.md ./SOUL.md
cp /path/to/openclaw/AGENTS.md ./AGENTS.md
cp /path/to/openclaw/MEMORY.md ./MEMORY.md
cp -r /path/to/openclaw/memory ./memory
cp -r /path/to/openclaw/skills ./skills
```

### 2. Set Environment

```bash
cp .env.example .env
# Edit .env:
# OPENROUTER_API_KEY=your_key
# AGENT_WALLET_KEY=0x...
# XMTP_ENV=production
```

### 3. Register and Run

```bash
hybrid register    # One-time XMTP registration
hybrid dev         # Start development server
```

### 4. Add XMTP Identity (New)

```bash
# Generate wallet key
openssl rand -hex 32 | sed 's/^/0x/'

# Set in .env
AGENT_WALLET_KEY=0x...

# Register on XMTP network
hybrid register
```

---

## Compatibility Notes

### What Works Identically

- All template file formats
- Memory file formats
- Skill definitions
- Scheduler syntax
- Search queries

### Hybrid Additions

- Per-user memory isolation via `users/{userId}/MEMORY.md`
- ACL.md for owner/guest roles
- PARA system in `.hybrid/memory/life/`
- Atomic facts with decay tiers
- XMTP messaging via channel adapters

### Not Implemented

- QMD sidecar (OpenClaw-specific memory backend)
- MMR re-ranking (planned)

---

## Debugging

### Memory Not Found

```bash
# Check file exists
ls -la .hybrid/memory/MEMORY.md

# Check index
sqlite3 .hybrid/memory/main.sqlite "SELECT COUNT(*) FROM chunks"

# Force rebuild
await manager.sync({ force: true })
```

### ACL Issues

```bash
# Check ACL file
cat .hybrid/memory/ACL.md

# Verify user role
const role = getRole(parseACL(workspaceDir), userId)
```

### Search Returns Empty

1. Check embedding provider is configured
2. Verify `MEMORY_ENABLED=true`
3. Run `manager.probeEmbeddingAvailability()`
4. Check `minScore` threshold (try lowering)