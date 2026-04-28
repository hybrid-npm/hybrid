FROM node:22-slim AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agent/package.json ./packages/agent/
COPY packages/memory/package.json ./packages/memory/
COPY packages/scheduler/package.json ./packages/scheduler/
COPY packages/types/package.json ./packages/types/

RUN corepack enable && pnpm install --frozen-lockfile

COPY packages/agent/src ./packages/agent/src
COPY packages/agent/build.mjs ./packages/agent/

RUN pnpm --filter @hybrd/agent build

# ── Runtime image ───────────────────────────────────────────────────────────

FROM node:22-slim

RUN groupadd -g 1000 app \
  && useradd -u 1000 -g app -m -s /bin/bash app \
  && groupadd -g 1001 claude \
  && useradd -u 1001 -g claude -m -s /bin/bash claude

RUN apt-get update && apt-get install -y --no-install-recommends sudo \
  && rm -rf /var/lib/apt/lists/* \
  && echo "app ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers \
  && echo "claude ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

WORKDIR /app

COPY --from=builder /app/packages/agent/dist ./dist/agent
COPY packages/agent/src/skills ./dist/skills
COPY packages/agent/dist/server/index.cjs ./dist/server/
COPY packages/agent/dist/index.cjs ./dist/

COPY AGENTS.md SOUL.md IDENTITY.md USER.md TOOLS.md BOOT.md BOOTSTRAP.md HEARTBEAT.md ./

RUN mkdir -p /app/data/memory/users \
  && mkdir -p /app/data/workspaces \
  && mkdir -p /app/data/credentials \
  && mkdir -p /app/data/secrets \
  && chown app:app /app/data/secrets \
  && chmod 700 /app/data/secrets \
  && chown -R app:app /app/data/memory \
  && chown -R app:app /app/data/workspaces \
  && chown -R app:app /app/data/credentials

RUN mkdir -p /usr/local/bin \
  && cat > /usr/local/bin/claude-wrapper.sh << 'WRAPPER'
#!/bin/sh
# Scrub secret env vars before passing to Claude
unset WALLET_KEY WALLET_PRIVATE_KEY SECRET_KEY || true
exec "$@"
WRAPPER
  && chmod +x /usr/local/bin/claude-wrapper.sh \
  && cat > /entrypoint.sh << 'ENTRY'
#!/bin/sh
# Clean potentially leaked secret env vars
unset WALLET_KEY WALLET_PRIVATE_KEY SECRET_KEY || true
exec "$@"
ENTRY
  && chmod +x /entrypoint.sh

ENV AGENT_PORT=8454
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/server/index.cjs"]
