# create-hybrid

Project scaffolding tool for Hybrid AI agents. Generates a complete, production-ready agent project using the Cloudflare Containers + Durable Objects architecture.

## Usage

```bash
npm create hybrid my-agent
# or
npx create-hybrid my-agent
# or with options
npx create-hybrid my-agent --env production --agent-name "My Bot"
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `<name>` | Project directory name | Required |
| `--env` | XMTP environment: `dev` or `production` | Prompted interactively |
| `--agent-name` | Display name for the agent | Prompted interactively |

## Generated Project Structure

```
my-agent/
├── src/
│   ├── gateway/
│   │   └── index.ts        # Cloudflare Worker: routes to container
│   ├── server/
│   │   └── index.ts        # Agent server: Claude Code SDK + SSE
│   └── dev-gateway.ts      # Local dev proxy to localhost:8454
├── package.json
├── tsconfig.json
├── wrangler.jsonc           # Cloudflare Workers + Containers config
├── Dockerfile               # Container image (cloudflare/sandbox base)
├── build.mjs                # esbuild bundler script
├── start.sh                 # Container startup: node dist/server/index.js
├── SOUL.md                  # Agent personality / identity
├── INSTRUCTIONS.md          # Agent behavioral guidelines
├── .env.example             # Template for required environment variables
└── .gitignore
```

## Architecture

The generated project uses **Cloudflare Containers + Durable Objects**:

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare Edge                          │
│                                                              │
│  src/gateway/index.ts  (Cloudflare Worker)                   │
│       │                                                       │
│       ├── Gets/creates Sandbox Durable Object by teamId      │
│       ├── Calls ensureAgentServer() to start container       │
│       └── sandbox.containerFetch() → port 8454              │
│                           │                                   │
│               ┌───────────▼────────────┐                     │
│               │  Docker Container      │                      │
│               │  (Sandbox DO)          │                      │
│               │                        │                      │
│               │  src/server/index.ts   │                      │
│               │  Claude Code SDK       │                      │
│               │  POST /api/chat → SSE  │                      │
│               └────────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

Each `teamId` gets its own `Sandbox` Durable Object and container instance.

## Generated Files in Detail

### `src/gateway/index.ts`

The Cloudflare Worker entry point:
- Routes `GET /health` and `POST /api/chat`
- Gets or creates a `Sandbox` Durable Object keyed by `teamId`
- Calls `ensureAgentServer()` which:
  1. Polls `sandbox.listProcesses()` until the container is ready
  2. Checks for a running `server/index.js` process
  3. HTTP health checks port 8454
  4. If unhealthy: kills node processes and starts `node /app/dist/server/index.js`
- Proxies requests to the container via `sandbox.containerFetch()`

### `src/server/index.ts`

The agent server (runs inside the container):
- Hono HTTP server on port 8454
- `POST /api/chat`: Runs Claude Code SDK via `query()`, streams SSE response
- `GET /health`: Returns `{ status: "healthy" }`
- Reads `SOUL.md` and `INSTRUCTIONS.md` for system prompt
- Supports both Anthropic direct and OpenRouter (auto-detected from `OPENROUTER_API_KEY`)

### `src/dev-gateway.ts`

Local development proxy — proxies requests to `http://localhost:8454`:

```bash
pnpm dev:gateway
```

### `Dockerfile`

```dockerfile
FROM cloudflare/sandbox:0.7.0
WORKDIR /app
COPY dist/server/index.js ./dist/server/
COPY SOUL.md INSTRUCTIONS.md ./
RUN npm install
CMD ["sh", "start.sh"]
```

### `wrangler.jsonc`

```jsonc
{
  "name": "my-agent",
  "durable_objects": {
    "bindings": [{ "name": "AgentContainer", "class_name": "Sandbox" }]
  },
  "containers": [
    { "class_name": "Sandbox", "instance_type": "standard-1", "max_instances": 10 }
  ]
}
```

### `package.json` scripts

| Script | Command |
|--------|---------|
| `build` | Runs `build.mjs` (esbuild bundles `src/server/index.ts`) |
| `dev` | `pnpm build && node dist/server/index.js` |
| `dev:gateway` | `node src/dev-gateway.ts` |
| `dev:container` | `wrangler dev` (local container dev) |
| `deploy` | `pnpm build && wrangler deploy` |
| `typecheck` | `tsc --noEmit` |

## Getting Started

After scaffolding:

```bash
cd my-agent

# 1. Install dependencies
pnpm install

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env: add OPENROUTER_API_KEY (or ANTHROPIC_API_KEY)

# 3. Customize your agent
# Edit SOUL.md for personality
# Edit INSTRUCTIONS.md for behavioral guidelines

# 4. Start local development
pnpm dev

# 5. Deploy to Cloudflare
pnpm deploy
```

## Relation to Other Packages

- The generated `src/server/index.ts` uses `@anthropic-ai/claude-agent-sdk` directly — same pattern as `packages/agent/src/server/index.ts`
- The generated `src/gateway/index.ts` is a simplified version of `packages/gateway/src/index.ts` (without XMTP sidecar management)
- The generated project is standalone — no dependencies on `@hybrd/*` packages
- `packages/cli`'s `hybrid init` command delegates to this package

## License

MIT
