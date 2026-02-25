FROM docker.io/cloudflare/sandbox:0.7.0

WORKDIR /app

RUN npm install \
    @anthropic-ai/claude-code@latest \
    @xmtp/agent-sdk@0.0.14 \
    viem@2.46.2 \
    @anthropic-ai/claude-agent-sdk \
    hono \
    @hono/node-server

COPY dist/ ./dist/

RUN useradd -m -s /bin/bash agent && \
    chown -R agent:agent /app

USER agent

ENV AGENT_PORT=4100
EXPOSE 3000 4100

CMD ["sleep", "infinity"]
