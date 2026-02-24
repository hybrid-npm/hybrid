FROM docker.io/cloudflare/sandbox:0.7.0

WORKDIR /app

RUN npm install -g @anthropic-ai/claude-agent-sdk && \
    useradd -m -s /bin/bash agent && \
    chown -R agent:agent /app

COPY dist/server/ ./dist/server/
COPY dist/sidecar/ ./dist/sidecar/
COPY AGENTS.md SOUL.md ./

RUN chown -R agent:agent /app

USER agent

ENV AGENT_PORT=4100
EXPOSE 3000 4100

CMD ["sleep", "infinity"]
