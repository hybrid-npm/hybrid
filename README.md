# Hybrid

**Drop-in OpenClaw replacement with native XMTP messaging.**

Hybrid is a TypeScript agent runtime with **100% OpenClaw feature parity** — your `SOUL.md`, `AGENTS.md`, memory files, and skills work without modification. On top of that, you get a decentralized messaging layer via XMTP, a 3-layer PARA memory system, multi-user access control, and a channel adapter framework for connecting to any network.

Port your OpenClaw instance in under 10 minutes. Deploy to Fly.io, Cloudflare Workers, or any Node.js host.

---

## Why Hybrid

OpenClaw gave agents persistent memory, skills, and a scheduler. Hybrid keeps all of that and adds the missing pieces for real-world multi-user deployment:

- **Messaging** — agents live on XMTP, a decentralized messaging protocol. Users reach your agent from any XMTP-compatible app, no account required beyond a wallet.
- **Multi-user memory** — each user's memory is isolated by wallet address. Owners get full access; guests get their own private slice.
- **Structured knowledge** — beyond flat markdown files, Hybrid adds a PARA-based entity graph with atomic facts, decay tiers, and fact supersession.
- **Channel adapters** — XMTP today, Telegram or Slack tomorrow. A uniform adapter interface with local HTTP IPC, so channels are independently deployable.

---

## OpenClaw Compatibility

Everything that works in OpenClaw works in Hybrid. Same files, same format, same behavior.

| | OpenClaw | Hybrid |
|--|:--:|:--:|
| `SOUL.md` + `AGENTS.md` config | ✅ | ✅ |
| `MEMORY.md` auto-memory | ✅ | ✅ |
| `memory/*.md` indexed files | ✅ | ✅ |
| Session transcripts (`.hybrid/memory/conversations/{userId}/{conversationId}.json`) | ✅ | ✅ |
| Vector search (sqlite-vec) | ✅ | ✅ |
| BM25 / FTS hybrid search | ✅ | ✅ |
| Embedding providers (openai, gemini, voyage, mistral, local, auto) | ✅ | ✅ |
| Daily logs (`.hybrid/memory/logs/YYYY-MM-DD.md`) | ✅ | ✅ |
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

## Quickstart

### Porting from OpenClaw

Your config files, memory, and skills work without modification.

**1. Scaffold into a new directory**

```bash
npm create hybrid my-agent
cd my-agent
```

**2. Copy your OpenClaw files over**

```bash
cp /path/to/openclaw/SOUL.md   ./SOUL.md
cp /path/to/openclaw/AGENTS.md ./AGENTS.md
cp /path/to/openclaw/MEMORY.md ./MEMORY.md
cp -r /path/to/openclaw/memory ./memory
cp -r /path/to/openclaw/skills ./skills
```

**3. Add new skills** (optional)

```bash
hybrid skills add github:cloudflare/skills/wrangler
hybrid skills add github:you/my-skill
```

**4. Set your env vars**

```bash
cp .env.example .env
```

Then fill in `.env`:

```env
OPENROUTER_API_KEY=your_key    # or ANTHROPIC_API_KEY

# XMTP identity — generate a wallet key for your agent
AGENT_WALLET_KEY=0x...
XMTP_ENV=production
```

**5. Register and run**

```bash
hybrid register    # one-time: registers your wallet on the XMTP network
hybrid dev
```

Your agent is reachable at its wallet address from any XMTP client. Send it a DM at [xmtp.chat](https://xmtp.chat).

---

## Onboarding

When you first create a Hybrid agent, it includes a `BOOTSTRAP.md` file that defines the first-run onboarding experience.

### First Run

1. **Configure ACL** — Add your wallet address to `ACL.md`:
   ```markdown
   ## Owners

   - 0xyour_wallet_address
   ```

2. **Start the agent**:
   ```bash
   pnpm dev
   ```

3. **Chat with your agent** — The agent will:
   - Ask about its identity (name, personality, emoji)
   - Learn about you (name, preferences, timezone)
   - Discuss boundaries and behavior
   - Delete `BOOTSTRAP.md` when complete

4. **Onboarding complete** — Your agent now has a unique identity!

### How It Works

- **Owner-only**: During onboarding, only the owner can interact with the agent
- **State tracking**: Progress is saved in `.hybrid/workspace-state.json`
- **Automatic completion**: The agent detects when `BOOTSTRAP.md` is deleted and marks onboarding complete
- **OpenClaw compatible**: Uses the same BOOTSTRAP.md format and flow

### Adding More Users

After onboarding, add more owners or guests to `ACL.md`:
- **Owners** can access all memory and modify agent configuration
- **Guests** get isolated memory and can only create their own user profile

### Multi-Tenant Profiles

Each user gets their own profile:
```
users/
├── 0xalice/
│   └── USER.md    ← Alice's preferences
└── 0xbob/
    └── USER.md    ← Bob's preferences
```

The agent maintains its identity (`IDENTITY.md`, `SOUL.md`) across all users.

---

### Starting fresh

```bash
npm create hybrid my-agent
cd my-agent
cp .env.example .env   # fill in OPENROUTER_API_KEY and AGENT_WALLET_KEY
hybrid register
hybrid dev
```

---

## Project Structure

Running `hybrid init <name>` generates this project structure:

```
my-agent/
├── package.json                 # Project config (name replaced)
├── .gitignore                   # Ignores credentials/, sessions/, memory/, etc.
├── .env.example                 # Environment template
│
├── credentials/                 # Access control
│   └── xmtp-allowFrom.json      # Created during init with owner wallet
│
├── skills/                      # Copied from core skills
│   ├── memory/SKILL.md
│   ├── xmtp/SKILL.md
│   └── skills-manager/SKILL.md
│
├── skills-lock.json             # Locks installed skill versions
│
└── [Agent Configuration Files]
    ├── SOUL.md                  # Agent personality & principles
    ├── IDENTITY.md              # Name, creature, vibe, emoji
    ├── USER.md                  # Human profile template
    ├── AGENTS.md                # Workspace rules & memory system
    ├── TOOLS.md                 # Local notes (cameras, SSH, etc.)
    ├── BOOTSTRAP.md             # First-run setup guide
    └── HEARTBEAT.md             # Periodic task checklist
```

### Key Files

| File | Purpose |
|------|---------|
| `SOUL.md` | Agent personality, principles, and behavior style |
| `IDENTITY.md` | Name, creature type, vibe, emoji, avatar |
| `USER.md` | Human profile — name, preferences, context |
| `AGENTS.md` | Workspace rules, memory system, group chat behavior |
| `TOOLS.md` | Local notes — camera names, SSH aliases, TTS voices |
| `BOOTSTRAP.md` | First-run onboarding guide (deleted after setup) |
| `HEARTBEAT.md` | Periodic task checklist for proactive behavior |

### Init Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    hybrid init <name>                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Copy templates/agent/ → <name>/                         │
│     - package.json (with name replaced)                     │
│     - SOUL.md, IDENTITY.md, USER.md, AGENTS.md             │
│     - TOOLS.md, BOOTSTRAP.md, HEARTBEAT.md                 │
│     - .gitignore, .env.example                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Copy core skills/ → <name>/skills/                      │
│     - memory/                                               │
│     - xmtp/                                                 │
│     - skills-manager/                                       │
│                                                             │
│     Create skills-lock.json with core skill references      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Prompt: "Enter your wallet address (owner):"           │
│                                                             │
│     Input: 0xAbC123...                                      │
│                                                             │
│     → Create credentials/xmtp-allowFrom.json               │
│       { "version": 1, "allowFrom": ["0xabc123..."] }       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Output:                                                    │
│                                                             │
│  ✅ Created agent at: my-agent/                             │
│                                                             │
│  Next steps:                                                │
│    cd my-agent                                              │
│    npm install  # or pnpm install                           │
│    hybrid dev   # Start development                         │
└─────────────────────────────────────────────────────────────┘
```

### Agent Runtime Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Process                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   SOUL.md   │    │  IDENTITY.md│    │   USER.md   │     │
│  │ Personality │    │ Who am I?   │    │ Human info  │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            ▼                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   System Prompt                       │   │
│  │  [IDENTITY] + [SOUL] + [AGENTS] + [TOOLS] + [USER]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│                            ▼                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Claude Agent SDK                        │   │
│  │  query({ prompt, options }) → conversation stream    │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│                            ▼                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Skills Layer                       │   │
│  │  ./skills/*/SKILL.md → Tool definitions              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Memory

Hybrid has a 3-layer memory system. All three layers are indexed together into SQLite for unified search.

### Layer 1 — PARA Knowledge Graph

Structured entity storage inspired by the [PARA method](https://fortelabs.com/blog/para/). The agent can create named entities in four buckets — `projects`, `areas`, `resources`, `archives` — and attach atomic facts to each one.

```
.hybrid/memory/life/
  areas/people/Alice/
    items.json     ← all facts, including superseded ones
    summary.md     ← hot + warm facts only, used for search indexing
```

Each fact has a **decay tier** based on how recently and how often it's been accessed:

| Tier | Condition |
|------|-----------|
| Hot | accessed in the last 7 days, or 5+ accesses in the last 14 days |
| Warm | accessed in the last 30 days, or 10+ total accesses |
| Cold | not accessed in 30+ days |

Cold facts are excluded from search and from `summary.md` — but never deleted. When a fact becomes outdated, **supersession** marks the old fact as `superseded` and links it to the new one. Both stay in `items.json` as a history trail.

### Layer 2 — Daily Log

An append-only chronological log. Each day gets its own file:

```
.hybrid/memory/logs/2026-03-02.md
```

The agent logs facts, decisions, and actions throughout a session. Entries are timestamped and tagged `[FACT]`, `[DECISION]`, or `[ACTION]`. Nothing is ever rewritten — the file only grows.

### Layer 3 — Auto Memory

A structured `MEMORY.md` with five fixed sections: **User Preferences**, **Learnings**, **Decisions**, **Context**, **Notes**. The agent appends dated bullet points to the relevant section as it learns things about the user.

### Per-User Isolation

Every user's memory is scoped to their wallet address:

```
.hybrid/memory/users/0xabc.../MEMORY.md    ← guest's private memory
MEMORY.md                                  ← shared memory (owners only)
```

Access control is defined in `ACL.md` at the project root:

```markdown
## Owners

- 0xabc123...    # Added 2026-03-01
```

Owners can read all memory — shared, per-user, and the `memory/` directory. Guests only read and write their own slice. If there's no ACL file, everyone is treated as an owner (to allow initial onboarding). Once you add your first owner to the ACL, all other users default to guest.

### Search

Queries run both **vector search** (semantic, via sqlite-vec) and **BM25 keyword search** (FTS5) in parallel. Results are merged with a 70/30 weighting by default and filtered by a minimum relevance score. If no embedding provider is configured, it falls back to keyword-only.

---

## Scheduler

The scheduler lets the agent take action on a time-based trigger — run a cron job, fire after an interval, or execute once at a specific time. Jobs are persisted to SQLite and survive restarts.

### Schedule Types

```typescript
// One-time — fires once at a specific time
{ kind: "at", at: "2026-03-15T09:00:00Z" }

// Interval — fires every N milliseconds
{ kind: "every", everyMs: 3_600_000 }  // every hour

// Cron — standard cron expression with optional timezone
{ kind: "cron", expr: "0 9 * * 1-5", tz: "America/New_York" }
```

### How It Works

The scheduler uses precise `setTimeout` calls — it computes the exact millisecond of the next job and sleeps until then. There's no fixed polling loop. A maintenance heartbeat runs at most every 60 seconds to handle edge cases.

When a job fires, the scheduler sends the agent an **agent turn** — a message it processes just like a user message. The agent's response can optionally be delivered to a recipient via a channel adapter (e.g. sent as an XMTP message).

```typescript
// Example job payload
{
  kind: "agentTurn",
  message: "Send the daily summary to the team",
  delivery: {
    mode: "announce",
    channel: "xmtp",
    to: "0xrecipient..."
  }
}
```

### Error Handling

Failed jobs back off exponentially before retrying:

| Consecutive failures | Delay before retry |
|---------------------|--------------------|
| 1 | 30 seconds |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 15 minutes |
| 5+ | 1 hour |

Jobs that appear stuck (running for more than 2 hours) are automatically unstuck on the next scheduler start.

---

## Architecture

```
                    XMTP network • HTTP • Scheduler callbacks
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │       Channel Adapters           │
                    │  @hybrd/channels  (port 8455)    │
                    │  XMTP adapter → HTTP IPC         │
                    └─────────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │        Agent Server              │
                    │  hybrid/agent  (port 8454)       │
                    │                                  │
                    │  SOUL.md + AGENTS.md             │
                    │  Memory search (vector + BM25)   │
                    │  MCP: memory tools               │
                    │  MCP: scheduler tools            │
                    │  Claude Code SDK → SSE stream    │
                    └─────────────────────────────────┘
                               │            │
               ┌───────────────┘            └───────────────┐
               ▼                                            ▼
┌──────────────────────────┐              ┌──────────────────────────────┐
│      @hybrd/memory        │              │       @hybrd/scheduler        │
│                           │              │                               │
│  Layer 1: PARA graph      │              │  cron / interval / one-time   │
│    projects / areas /     │              │  Precise timer, no polling    │
│    resources / archives   │              │  Exponential error backoff    │
│                           │              │  Delivers via channel adapter │
│  Layer 2: Daily log       │              └──────────────────────────────┘
│    logs/YYYY-MM-DD.md     │
│                           │
│  Layer 3: Auto memory     │
│    MEMORY.md              │
│                           │
│  SQLite + sqlite-vec      │
│  Multi-user ACL           │
└──────────────────────────┘
```

---

## Packages

| Package | Description |
|---------|-------------|
| [`hybrid/agent`](./packages/agent/README.md) | Agent runtime: HTTP server + XMTP sidecar |
| [`hybrid/gateway`](./packages/gateway/README.md) | Cloudflare Workers gateway + container lifecycle |
| [`@hybrd/memory`](./packages/memory/README.md) | 3-layer PARA memory, multi-user ACL, hybrid search |
| [`@hybrd/scheduler`](./packages/scheduler/README.md) | Agentic cron/interval/one-time scheduler |
| [`@hybrd/channels`](./packages/channels/README.md) | Channel adapter framework (XMTP, ...) |
| [`@hybrd/xmtp`](./packages/xmtp/README.md) | XMTP client, plugin, ENS/Basename resolvers |
| [`@hybrd/cli`](./packages/cli/README.md) | `hybrid` CLI: build, dev, deploy, skills |
| [`@hybrd/types`](./packages/types/README.md) | Shared TypeScript type definitions |
| [`@hybrd/utils`](./packages/utils/README.md) | Shared utilities |
| [`create-hybrid`](./packages/create-hybrid/README.md) | Project scaffolding (`npm create hybrid`) |

---

## Deployment

### Fly.io
```bash
hybrid deploy fly
```

### Cloudflare Workers + Containers
```bash
hybrid deploy cf
```

### Any Node.js host
```bash
hybrid build
# Ship .hybrid/ to your server and run start.sh
```

---

## Monorepo Development

```bash
pnpm install
pnpm build      # Build all packages
pnpm test       # Run tests
pnpm lint       # Lint (biome)
pnpm typecheck  # Type check
```

---

## License

MIT
