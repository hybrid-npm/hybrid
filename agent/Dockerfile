FROM docker.io/cloudflare/sandbox:0.7.0

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY dist/server/ ./dist/server/
COPY start.sh ./
RUN chmod +x start.sh

ENV AGENT_PORT=4100
EXPOSE 4100
