# Docker Deployment

Hybrid runs as a Docker container built on the [Cloudflare Sandbox](https://github.com/cloudflare/sandbox) base image.

## Dockerfile

The container image:

1. Installs the Claude Code CLI globally (provides the Agent SDK runtime)
2. Copies production dependencies, the built server, `AGENT.md`, skills, and the startup script
3. Exposes port 4100

```dockerfile
FROM docker.io/cloudflare/sandbox:0.7.0

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY package.json ./
RUN npm install --production

COPY dist/server/ ./dist/server/
COPY AGENT.md /app/AGENT.md
COPY skills/ /app/skills/
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

ENV AGENT_PORT=4100
ENV COMMAND_TIMEOUT_MS=300000
EXPOSE 4100

CMD ["bash", "/app/start.sh"]
```

## Build and run

```bash
# From the project root
cd apps/agent

# Build the server
pnpm build

# Build the Docker image
docker build -t hybrid-agent .

# Run the container
docker run -p 4100:4100 \
  -e ANTHROPIC_API_KEY=your-key-here \
  hybrid-agent
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Required. Anthropic API key for Claude. |
| `AGENT_PORT` | `4100` | HTTP server port |
| `AGENT_PROJECT_ROOT` | auto-detected | Override project root directory |
| `COMMAND_TIMEOUT_MS` | `300000` | Command execution timeout (5 minutes) |

## Startup and restart behavior

The container runs `start.sh`, which starts the Node.js server with automatic restart on failure:

- **Exponential backoff:** 1s, 2s, 4s, 8s, ... up to 30s maximum
- **Backoff reset:** After 60 seconds of stable uptime, the backoff resets to 1s
- **Clean exit:** If the server exits with code 0, the container stops without restarting

```bash
#!/usr/bin/env bash
set -uo pipefail

BACKOFF=1
MAX_BACKOFF=30

while true; do
  node dist/server/index.js
  EXIT_CODE=$?
  # ... backoff logic
done
```

## Build pipeline

The server is bundled with esbuild before containerization:

```bash
pnpm build
```

This runs `build.mjs`, which produces `dist/server/index.js` as a single ESM bundle with:

- **Platform:** Node.js
- **Format:** ESM
- **External packages:** All `node_modules` are external (installed in the container)
- **Source maps:** Enabled
