FROM docker.io/cloudflare/sandbox:0.7.5

WORKDIR /app

RUN echo "Build v10"

RUN npm install \
    @anthropic-ai/claude-code@latest \
    @xmtp/agent-sdk@0.0.14 \
    viem@2.46.2 \
    @anthropic-ai/claude-agent-sdk \
    hono \
    @hono/node-server

COPY dist/ ./dist/
COPY AGENTS.md SOUL.md ./

ENV AGENT_PORT=4100
EXPOSE 3000 4100

CMD ["sleep", "infinity"]
