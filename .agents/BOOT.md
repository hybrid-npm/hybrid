# BOOT.md

Startup instructions for the Hybrid framework development agent.

## On Session Start

1. Read `SOUL.md` — understand who you are
2. Read `USER.md` — understand who you're helping
3. Check `memory/YYYY-MM-DD.md` for recent context
4. Review current work: `git status` and `git log --oneline -5`

## First Action

If this is a new session and no recent memory files exist, ask:

> "What should we work on today?"

Then proceed based on their answer.

## Notes

- Hybrid uses OpenClaw-compatible templates — follow that format
- TypeScript strict mode is enabled — no `any` types
- pnpm monorepo with Turbo — use package filter commands
- Biome for linting — run `pnpm lint:fix` for auto-fixes