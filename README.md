# Hybrid

An agent runtime that is **100% OpenClaw compatible** — same config format, same memory system, same skills — plus native XMTP messaging, multi-user ACL, agentic scheduling, and a channel adapter framework.

If you have an OpenClaw instance, you can port it to Hybrid and run it anywhere: Fly.io, Cloudflare Workers + Containers, or your own Node.js host.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Incoming Messages                                 │
│                   XMTP (decentralized) • HTTP • Scheduler                     │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Channel Adapters                                     │
│  @hybrd/channels — pluggable adapters per network (XMTP, Telegram, ...)       │
│  Local HTTP IPC on fixed ports — independently deployable processes            │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Agent Server  (port 8454)                            │
│  hybrid/agent — Hono HTTP server + Claude Code SDK                             │
│  • SOUL.md + AGENTS.md → system prompt                                        │
│  • Memory search (hybrid search: vector + BM25)                               │
│  • MCP tool servers: memory tools + scheduler tools                            │
│  • SSE streaming responses                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
┌───────────────────────────┐   ┌─────────────────────────────────────────────┐
│  @hybrd/memory             │   │  @hybrd/scheduler                            │
│  3-layer PARA memory:      │   │  Agentic scheduling:                         │
│  • Knowledge graph (PARA)  │   │  • cron / interval / one-time                │
│  • Daily log               │   │  • Precise timer (no polling)                │
│  • Auto memory (MEMORY.md) │   │  • Exponential backoff on errors             │
│  Multi-user ACL, SQLite    │   │  • Delivers to any channel adapter           │
└───────────────────────────┘   └─────────────────────────────────────────────┘
```

## OpenClaw Compatibility

Hybrid implements the complete OpenClaw API surface and extends it:

| Feature | OpenClaw | Hybrid | Notes |
|---------|:--------:|:------:|-------|
| `SOUL.md` / `AGENTS.md` config | ✅ | ✅ | Identical format |
| `MEMORY.md` auto-memory | ✅ | ✅ | Identical |
| `memory/*.md` files | ✅ | ✅ | Identical |
| Session transcripts | ✅ | ✅ | Identical |
| Vector search (sqlite-vec) | ✅ | ✅ | Identical |
| BM25 / FTS search | ✅ | ✅ | Identical |
| Hybrid search | ✅ | ✅ | Identical |
| Embedding providers (openai, gemini, voyage, mistral, local) | ✅ | ✅ | Identical |
| Daily logs | ✅ | ✅ | Identical |
| Skills system | ✅ | ✅ | Identical `SKILL.md` format |
| Cron/scheduler | ✅ | ✅ | Identical schedule types |
| Per-user memory isolation | ❌ | ✅ | NEW |
| Conversation history | ❌ | ✅ | NEW |
| PARA knowledge graph | ❌ | ✅ | NEW |
| Atomic facts + decay tiers | ❌ | ✅ | NEW |
| Multi-user ACL (wallet-based) | ❌ | ✅ | NEW |
| XMTP native messaging | ❌ | ✅ | NEW |
| Channel adapter framework | ❌ | ✅ | NEW |

## Porting from OpenClaw

Hybrid reads the same config files OpenClaw does — in most cases a port is a copy-paste.

### 1. Copy your config files

```bash
cp path/to/openclaw/SOUL.md    ./SOUL.md
cp path/to/openclaw/AGENTS.md  ./AGENTS.md
cp path/to/openclaw/MEMORY.md  ./.hybrid/memory/MEMORY.md
cp -r path/to/openclaw/memory/ ./.hybrid/memory/
```

`SOUL.md`, `AGENTS.md`, and `MEMORY.md` are read verbatim. No reformatting needed.

### 2. Copy your skills

Skills are directories with a `SKILL.md` file. Copy them into `./skills/`:

```bash
cp -r path/to/openclaw/skills/my-skill ./skills/my-skill
```

Then register them:

```bash
hybrid install ./skills/my-skill
```

Or clone from GitHub if they're published:

```bash
hybrid install github:you/my-skill
```

### 3. Set environment variables

```env
OPENROUTER_API_KEY=your_key    # or ANTHROPIC_API_KEY
AGENT_WALLET_KEY=0x...         # New: for XMTP messaging
AGENT_SECRET=...               # New: for XMTP database encryption
XMTP_ENV=production
```

### 4. Register and run

```bash
hybrid register    # Register wallet on XMTP network (one-time)
hybrid dev         # Start developing
```

### What carries over automatically

- All memory files in `.hybrid/memory/` are indexed and searchable
- `MEMORY.md` auto-memory categories work identically
- Your skill tools are injected into the agent's system prompt
- Scheduler job formats (`at`, `every`, `cron`) are identical
- Embedding provider config is identical

### What's new in Hybrid

- Messages arrive via XMTP — users can reach your agent at `xmtp.chat/dm/your-wallet-address`
- Per-user memory isolation: each wallet address gets private memory in `.hybrid/memory/users/`
- PARA knowledge graph for structured entity/fact storage
- Wallet-based ACL: owners get full memory access, guests get their own scoped slice

## Quickstart (fresh agent)

```bash
npm create hybrid my-agent
cd my-agent
```

```env
OPENROUTER_API_KEY=your_key
AGENT_WALLET_KEY=0x...
AGENT_SECRET=...
XMTP_ENV=production
```

```bash
hybrid register    # Register XMTP wallet (one-time)
hybrid dev         # Start agent
```

Send a message to your agent at [xmtp.chat](https://xmtp.chat).

## Packages

| Package | Description | README |
|---------|-------------|--------|
| [`hybrid/agent`](./packages/agent) | Agent runtime: HTTP server + XMTP sidecar | [README](./packages/agent/README.md) |
| [`hybrid/gateway`](./packages/gateway) | Cloudflare Workers gateway + container lifecycle | [README](./packages/gateway/README.md) |
| [`@hybrd/memory`](./packages/memory) | 3-layer PARA memory, multi-user ACL, hybrid search | [README](./packages/memory/README.md) |
| [`@hybrd/scheduler`](./packages/scheduler) | Agentic cron/interval/one-time scheduler | [README](./packages/scheduler/README.md) |
| [`@hybrd/channels`](./packages/channels) | Channel adapter framework (XMTP, ...) | [README](./packages/channels/README.md) |
| [`@hybrd/xmtp`](./packages/xmtp) | XMTP client, plugin, ENS/Basename resolvers | [README](./packages/xmtp/README.md) |
| [`@hybrd/cli`](./packages/cli) | `hybrid` CLI: build, dev, deploy, skills | [README](./packages/cli/README.md) |
| [`@hybrd/types`](./packages/types) | Shared TypeScript type definitions | [README](./packages/types/README.md) |
| [`@hybrd/utils`](./packages/utils) | Shared utilities | [README](./packages/utils/README.md) |
| [`create-hybrid`](./packages/create-hybrid) | Project scaffolding (`npm create hybrid`) | [README](./packages/create-hybrid/README.md) |

## Repo Structure

```
hybrid/
├── packages/
│   ├── agent/           # Runtime agent (server + XMTP sidecar)
│   ├── gateway/         # Cloudflare Workers gateway
│   ├── memory/          # Memory system (@hybrd/memory)
│   ├── scheduler/       # Scheduler (@hybrd/scheduler)
│   ├── channels/        # Channel adapters (@hybrd/channels)
│   ├── xmtp/            # XMTP integration (@hybrd/xmtp)
│   ├── cli/             # CLI (@hybrd/cli)
│   ├── types/           # Types (@hybrd/types)
│   ├── utils/           # Utilities (@hybrd/utils)
│   └── create-hybrid/   # Scaffolding (create-hybrid)
├── agents/
│   └── sandbox/         # Example deployed agent
├── deployments/
│   └── flyio/           # Fly.io deployment config
├── skills/              # Installed extension skills
├── config/              # Shared biome + tsconfig
└── site/                # Documentation site
```

## Deployment

### Fly.io

```bash
hybrid build --target fly
hybrid deploy fly
```

### Cloudflare Workers + Containers

```bash
hybrid deploy cf
```

### Any Node.js host

```bash
hybrid build
# Copy .hybrid/ to your server and run start.sh
```

## Development

```bash
pnpm install
pnpm build      # Build all packages
pnpm test       # Run tests
pnpm lint       # Lint (biome)
pnpm typecheck  # Type check
```

## License

MIT
