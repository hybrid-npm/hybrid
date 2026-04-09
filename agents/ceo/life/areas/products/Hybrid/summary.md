# Hybrid

**TypeScript agent runtime** - OpenClaw replacement with XMTP messaging

## Core Value
- 100% OpenClaw feature parity (SOUL.md, AGENTS.md, skills, memory)
- Decentralized messaging via XMTP protocol
- Multi-user memory isolation (wallet-based ACL)
- 3-layer PARA memory system (knowledge graph + daily logs + auto memory)
- Channel adapter framework (XMTP today, Telegram/Slack tomorrow)
- Port from OpenClaw in under 10 minutes

## Architecture
Monorepo with 12 packages:
- `agent` - Runtime + HTTP server
- `gateway` - Cloudflare Workers
- `memory` - 3-layer PARA, multi-user ACL, hybrid search
- `scheduler` - Cron/interval/one-time jobs
- `channels` - Channel adapter framework
- `xmtp` - XMTP client + ENS/Basename resolvers
- `cli` - Build, dev, deploy, skills management
- `types`, `utils`, `create-hybrid`

## Tech Stack
- Node.js 22, TypeScript 5.9
- pnpm workspace + Turbo monorepo
- Claude Agent SDK
- SQLite + sqlite-vec (hybrid search)
- XMTP protocol

## Deployment
- Fly.io
- Cloudflare Workers + Containers
- Any Node.js host

## Current Status (2026-03-15)
- Published as @hybrd scope packages
- Branch: hybrid-134-dev-tooling
- Main branch ready
- Recent work: rename scope to @hybrd, publish memory package, bump to v2.0.0
