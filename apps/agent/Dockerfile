FROM docker.io/cloudflare/sandbox:0.7.0

# Install Claude Code CLI (provides the Agent SDK runtime)
RUN npm install -g @anthropic-ai/claude-code

# Install agent-server dependencies
WORKDIR /app
COPY package.json ./
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));delete p.devDependencies;fs.writeFileSync('package.json',JSON.stringify(p,null,2))"
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
