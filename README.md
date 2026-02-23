# Hybrid

TypeScript framework for building AI agents on XMTP.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              XMTP Network                                     │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           XMTP Sidecar (Gateway)                              │
│  • Message handlers (text, reaction, reply)                                   │
│  • Agent behaviors (filter, react, thread)                                    │
│  • Pre/post response middleware                                               │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Agent Container Runner                                │
│  • Claude Agent SDK / OpenRouter / Vercel AI SDK                              │
│  • Tool execution (blockchain, XMTP, custom)                                  │
│  • SSE streaming responses                                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**See [apps/agent/README.md](./apps/agent/README.md) for detailed containerized agent architecture.**

## Quickstart

```bash
npm create hybrid my-agent
cd my-agent
```

```env
OPENROUTER_API_KEY=your_key
XMTP_WALLET_KEY=0x...
XMTP_DB_ENCRYPTION_KEY=...
```

```bash
hybrid keys --write    # Generate XMTP keys
hybrid register        # Register with XMTP
hybrid dev             # Start developing
```

Send a message at [xmtp.chat](https://xmtp.chat/dm/) to your agent.

## Agent Behaviors

Behaviors are middleware that run before/after agent responses:

```typescript
import { Agent } from "hybrid"
import { filterMessages, reactWith, threadedReply } from "hybrid/behaviors"

const agent = new Agent({
  name: "My Agent",
  model: openrouter("x-ai/grok-4"),
  instructions: "You are a helpful XMTP agent."
})

await agent.listen({
  behaviors: [
    filterMessages((f) => f.isDM() || f.hasMention("@agent")),
    reactWith("👀"),
    threadedReply()
  ]
})
```

| Behavior | Description |
|----------|-------------|
| `filterMessages(fn)` | Control which messages to process |
| `reactWith(emoji)` | Auto-react to incoming messages |
| `threadedReply()` | Send replies as threads |

## Tools

### Blockchain Tools

```typescript
import { blockchainTools } from "hybrid/tools"

const agent = new Agent({
  tools: blockchainTools,
  createRuntime: () => ({
    rpcUrl: process.env.RPC_URL,
    privateKey: process.env.PRIVATE_KEY as `0x${string}`,
    defaultChain: "mainnet"
  })
})
```

| Tool | Description |
|------|-------------|
| `getBalance` | Check native token balance |
| `sendTransaction` | Send native tokens |
| `getTransaction` | Get transaction details |
| `getBlock` | Get block information |
| `getGasPrice` | Current gas prices |
| `estimateGas` | Estimate transaction gas |

### XMTP Tools

Automatically included when listening:

| Tool | Description |
|------|-------------|
| `sendMessage` | Send XMTP messages |
| `sendReply` | Reply to messages |
| `sendReaction` | Send emoji reactions |
| `getMessage` | Retrieve messages |

## Packages

| Package | Description |
|---------|-------------|
| `hybrid` (core) | Agent framework, behaviors, tools |
| `@hybrd/types` | TypeScript interfaces |
| `@hybrd/xmtp` | XMTP client, resolvers, plugin |
| `@hybrd/utils` | Shared utilities |
| `@hybrd/cli` | CLI (`hybrid` command) |

## Project Structure

```
hybrid/
├── packages/
│   ├── core/          # Agent framework (published as "hybrid")
│   ├── types/         # TypeScript types (@hybrd/types)
│   ├── xmtp/          # XMTP integration (@hybrd/xmtp)
│   ├── utils/         # Utilities (@hybrd/utils)
│   └── cli/           # CLI (@hybrd/cli)
├── apps/
│   └── agent/         # Containerized agent app
├── config/            # Shared config (biome, tsconfig)
└── site/              # Documentation
```

## Development

```bash
pnpm install
pnpm dev        # Start agent
pnpm test       # Run tests
pnpm build      # Build all packages
pnpm lint       # Lint
pnpm typecheck  # Type check
```

## Deployment

Deploy to any Node.js host or use Cloudflare Workers + Containers:

```bash
pnpm build
pnpm deploy    # For apps/agent
```

See [apps/agent/README.md](./apps/agent/README.md) for containerized deployment.

## License

ISC
