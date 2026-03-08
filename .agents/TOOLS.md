# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to this Hybrid development setup.

## Monorepo Commands

### Build & Test

```bash
pnpm build              # Build all packages (turbo)
pnpm build:packages     # Build only packages/ (no server/site)
pnpm build:watch        # Watch mode for packages
pnpm test               # Run tests (turbo)
pnpm lint               # Biome lint
pnpm lint:fix           # Biome lint with auto-fix
pnpm typecheck          # TypeScript check
```

### Package-Specific

```bash
pnpm --filter @hybrd/xmtp build
pnpm --filter @hybrd/memory test
pnpm --filter hybrid/agent dev
```

### Release

```bash
pnpm release           # Build packages + publish to npm
pnpm bump              # Version bump (interactive)
pnpm bump:patch        # Patch version bump
pnpm bump:minor        # Minor version bump
```

## Environment

- **Node.js:** 22.x
- **pnpm:** 9.15.5
- **TypeScript:** 5.9.2
- **Biome:** 1.9.4 (linting + formatting)
- **Turbo:** 2.5.0 (monorepo build)

## Package Overview

| Package | Purpose | Key Exports |
|---------|---------|-------------|
| `hybrid/agent` | Agent runtime | `ChatRequest`, `ChatResponse`, `encodeSSE` |
| `@hybrd/xmtp` | XMTP integration | `createXMTPClient`, `XMTPPlugin`, `Resolver` |
| `@hybrd/memory` | PARA memory | `MemoryService`, `SearchResult`, ACL tools |
| `@hybrd/scheduler` | Time-based triggers | `SchedulerService`, job types |
| `@hybrd/channels` | Channel adapters | Adapter interface |
| `@hybrd/cli` | CLI commands | `hybrid dev`, `hybrid deploy` |
| `@hybrd/types` | Shared types | All public type definitions |
| `@hybrd/utils` | Utilities | Shared helper functions |

## Key Files

- `packages/agent/src/server/index.ts` — Agent HTTP server
- `packages/agent/src/templates/` — OpenClaw-compatible templates
- `packages/xmtp/src/client.ts` — XMTP client creation with R2 sync
- `packages/xmtp/src/plugin.ts` — XMTPPlugin for Agent framework
- `packages/memory/src/index.ts` — Memory service entry point

## Skills Directory

- `.agents/skills/wrangler/SKILL.md` — Cloudflare Workers CLI
- `.agents/skills/agent-browser/SKILL.md` — Browser automation

## Deployment Targets

- **Fly.io:** `hybrid deploy fly`
- **Cloudflare Workers:** `hybrid deploy cf`
- **Node.js:** `hybrid build` → ship `.hybrid/`

## Notes

- Biome handles both linting and formatting (no Prettier)
- Turbo caches builds — incremental rebuilds are fast
- Template files must match OpenClaw format exactly
- XMTP sidecar runs on port 8455, agent server on 8454

***

Add whatever helps you do your job. This is your cheat sheet.