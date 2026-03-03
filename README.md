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
| **Conversation history storage** | ❌ | ✅ |
| **PARA knowledge graph** | ❌ | ✅ |
| **Atomic facts + decay tiers** | ❌ | ✅ |
| **Fact supersession** | ❌ | ✅ |
| **Multi-user ACL (wallet-based)** | ❌ | ✅ |
| **XMTP native messaging** | ❌ | ✅ |
| **Channel adapter framework** | ❌ | ✅ |
| **ENS + Basename resolution** | ❌ | ✅ |

---

## Porting from OpenClaw

Your config files are read verbatim — no reformatting, no migration scripts.

### 1. Scaffold a new agent

```bash
npm create hybrid my-agent
cd my-agent
```

### 2. Copy your OpenClaw config

```bash
cp /path/to/openclaw/SOUL.md    ./SOUL.md
cp /path/to/openclaw/AGENTS.md  ./AGENTS.md
cp /path/to/openclaw/MEMORY.md  ./MEMORY.md
cp -r /path/to/openclaw/memory/ ./memory/
```

### 3. Copy your skills

```bash
# Local skills
cp -r /path/to/openclaw/skills/my-skill ./skills/my-skill
hybrid skills add ./skills/my-skill

# Or install from GitHub
hybrid skills add github:you/my-skill
```

### 4. Add the new env vars

```env
# Same as OpenClaw
OPENROUTER_API_KEY=your_key    # or ANTHROPIC_API_KEY

# New: XMTP identity
AGENT_WALLET_KEY=0x...         # Private key for your agent's wallet
XMTP_ENV=production

# AGENT_SECRET is optional — automatically derived from AGENT_WALLET_KEY
# via BIP-32 at m/44'/60'/0'/0/41. Set explicitly only if you need to override.
# AGENT_SECRET=...
```

### 5. Register and run

```bash
hybrid register    # One-time: registers wallet on XMTP network
hybrid dev         # Start the agent
```

That's it. Your agent is now reachable at your wallet address on any XMTP client, with all your existing memory, skills, and personality intact.

---

## What's New After Porting

**XMTP messaging** — users reach your agent from [xmtp.chat](https://xmtp.chat) or any XMTP-compatible app by DMing your wallet address. Reactions, replies, and threaded conversations work out of the box.

**Per-user memory** — each sender's memory lives in `.hybrid/memory/users/0x.../MEMORY.md`. Owners (wallets in `ACL.md`) can read everything; guests only see their own slice.

**[PARA knowledge graph](https://fortelabs.com/blog/para/)** — beyond flat `MEMORY.md`, the agent can create structured entities (`projects/`, `areas/`, `resources/`, `archives/`) with atomic facts. Facts have decay tiers: hot (<7d), warm (<30d), cold (>30d). High-access facts stay warm longer. Facts are never deleted — only superseded (old fact is marked `superseded` and linked to the new one; both persist in `items.json`).

**Channel adapters** — the scheduler can deliver messages to any registered channel. Add Telegram, Slack, or a custom webhook by implementing `ChannelAdapter` and registering a port.

---

## Quickstart (fresh agent)

```bash
npm create hybrid my-agent
cd my-agent

# Fill in .env
OPENROUTER_API_KEY=...
AGENT_WALLET_KEY=...
XMTP_ENV=production
# AGENT_SECRET is derived automatically from AGENT_WALLET_KEY

hybrid register
hybrid dev
```

Send a DM to your agent's wallet address at [xmtp.chat](https://xmtp.chat).

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
