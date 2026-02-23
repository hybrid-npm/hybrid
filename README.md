# Hybrid

TypeScript agent framework for connecting AI agents to XMTP and beyond.

Hybrid makes it easy to wire together messaging, behaviors, and any AI model or service.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          External Networks                                     │
│  XMTP • Webhooks • ATP (Agent Transfer Protocol) • Custom Integrations        │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Gateway (Edge)                                    │
│  Cloudflare Worker that routes incoming requests                               │
│  • Webhook endpoints                                                           │
│  • ATP request handling                                                        │
│  • Multi-network ingress                                                       │
│  • Sandbox/container routing                                                   │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           XMTP Sidecar (Container)                             │
│  Connects to XMTP network, handles messaging behaviors                         │
│  • Message handlers (text, reaction, reply)                                    │
│  • Agent behaviors (filter, react, thread)                                     │
│  • Sends responses back to users/groups                                        │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Agent Container Runner                                 │
│  • Claude Agent SDK / OpenRouter / Vercel AI SDK                               │
│  • Connect to any service or API                                               │
│  • SSE streaming responses                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

**See [agent/README.md](./agent/README.md) for detailed containerized agent architecture.**

## Gateway vs Sidecar

| Component | Role | Location |
|-----------|------|----------|
| **Gateway** | Routes incoming webhooks/ATP requests from any network | Cloudflare Worker (edge) |
| **Sidecar** | Connects to XMTP, handles behaviors, sends responses | Container service |

The gateway sits at the edge and handles ingress from multiple networks. The sidecar runs alongside the agent and manages XMTP-specific communication.

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

Behaviors are middleware that run before/after agent responses in the XMTP sidecar:

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

## Connecting Services

Hybrid is designed to connect your agent to any service. Bring your own tools and APIs:

```typescript
import { Agent, createTool } from "hybrid"
import { z } from "zod"

const weatherTool = createTool({
  description: "Get current weather for a city",
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ input }) => {
    const res = await fetch(`https://api.weather.com/${input.city}`)
    return res.json()
  }
})

const agent = new Agent({
  tools: [weatherTool],
  // ... connect to any API, database, blockchain service, etc.
})
```

## XMTP Tools

Built-in tools for XMTP messaging (automatically included):

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
├── agent/             # Containerized agent app
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
pnpm deploy    # For agent
```

See [agent/README.md](./agent/README.md) for containerized deployment.

## License

ISC
