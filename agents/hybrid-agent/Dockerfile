FROM docker.io/cloudflare/sandbox:0.7.0

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY dist/server/ ./dist/server/
COPY AGENTS.md SOUL.md IDENTITY.md USER.md TOOLS.md BOOT.md BOOTSTRAP.md HEARTBEAT.md ./
COPY start.sh ./
RUN chmod +x start.sh

ENV AGENT_PORT=8454
EXPOSE 8454
