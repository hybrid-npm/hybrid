FROM node:20

WORKDIR /app

# Copy package files for the agent
COPY deployments/flyio/package.json package.json
RUN npm install

# Copy built agent code
COPY packages/agent/dist/ ./dist/agent/

# Copy agent docs
COPY agents/hybrid-agent/AGENTS.md agents/hybrid-agent/SOUL.md ./

RUN mkdir -p /app/data/xmtp

ENV AGENT_PORT=4100
EXPOSE 4100

# Run both server and XMTP sidecar
CMD ["sh", "-c", "node dist/agent/server/index.cjs & node dist/agent/xmtp.cjs & wait"]
