# MEMORY.md - Long-Term Memory

*Curated memories and context that persist across sessions.*

## Project Overview

**Hybrid** is an agent framework designed to launch containerized agents using the OpenClaw standard with secure communication powered by XMTP.

### Core Value Props

1. **100% OpenClaw compatibility** — Drop-in replacement, same templates work
2. **XMTP native** — Decentralized messaging, wallet identity, ENS/Basename
3. **PARA memory** — Structured entity storage with atomic facts and decay
4. **Multi-user ACL** — Owner/guest roles with memory isolation
5. **Channel adapters** — Extensible messaging (XMTP, Telegram, Slack...)

### Architecture

- **Agent Server (8454)** — HTTP server with Claude Code SDK
- **XMTP Sidecar (8455)** — Bridges XMTP network to agent server
- **Memory Service** — SQLite + sqlite-vec for hybrid search
- **Scheduler** — Time-based triggers with exponential backoff

## Key Decisions

*Document significant decisions made during development.*

- [Add decisions as they're made]

## Things to Remember

*Important context that should persist.*

- OpenClaw templates must match exactly — no deviation from format
- TypeScript strict mode throughout — use `unknown` not `any`
- Multi-tenant: per-user memory in `.hybrid/memory/users/{userId}/`
- XMTP state synced via R2 for stateless container deployments

## Working Preferences

*How does the human like to work?*

- [Add preferences as you learn them]

***

*Update this file periodically from daily memory files. Keep it concise — distilled wisdom, not raw logs.*