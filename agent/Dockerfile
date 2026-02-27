FROM node:20

WORKDIR /app

COPY Dockerfile.package.json package.json
RUN npm install

COPY dist/ ./dist/
COPY AGENTS.md SOUL.md ./

RUN mkdir -p /app/data/xmtp

ENV AGENT_PORT=4100
EXPOSE 4100

CMD ["sh", "-c", "node dist/server/index.cjs & node dist/sidecar/index.cjs & wait"]
