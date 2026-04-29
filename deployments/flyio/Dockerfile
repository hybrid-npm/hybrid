FROM node:22-slim

# rename existing node:node to app:app (1000:1000) so tests pass
RUN groupmod -n app node \
  && usermod -l app -d /home/app -m node \
  && groupadd -g 1001 claude \
  && useradd -u 1001 -g claude -m -s /bin/bash claude

RUN apt-get update && apt-get install -y --no-install-recommends sudo \
  && rm -rf /var/lib/apt/lists/* \
  && echo "app ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers \
  && echo "claude ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

WORKDIR /app

# Install runtime dependencies that are marked external in build.mjs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agent/package.json ./packages/agent/
COPY packages/memory/package.json ./packages/memory/
COPY packages/scheduler/package.json ./packages/scheduler/
COPY packages/types/package.json ./packages/types/
RUN corepack enable && pnpm install --frozen-lockfile --prod

# Build artifacts are produced by the CI job before docker build.
COPY packages/agent/dist ./dist/agent/
COPY packages/agent/dist/server/index.cjs ./dist/server/index.cjs
COPY packages/agent/skills ./skills/
COPY packages/cli/templates/agent/*.md ./

RUN mkdir -p /usr/local/bin \
  && printf '#!/bin/sh\nunset WALLET_KEY WALLET_PRIVATE_KEY SECRET_KEY || true\nexec "$@"' > /usr/local/bin/claude-wrapper.sh \
  && chmod +x /usr/local/bin/claude-wrapper.sh \
  && mkdir -p /app/data/memory/users \
  && mkdir -p /app/data/workspaces \
  && mkdir -p /app/data/credentials \
  && mkdir -p /app/data/secrets \
  && chown app:app /app/data/secrets \
  && chmod 700 /app/data/secrets \
  && chown -R app:app /app/data/memory \
  && chmod 777 /app/data/workspaces \
  && chown -R app:app /app/data/credentials

COPY --chmod=755 entrypoint.sh /entrypoint.sh

ENV AGENT_PORT=8454
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/server/index.cjs"]
