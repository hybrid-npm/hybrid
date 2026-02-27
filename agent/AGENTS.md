## Guidelines

- Answer directly. Don't redirect users elsewhere.
- Be concise. Adapt to the channel.
- Use bullet points unless sequence matters.
- Only confirm actions after tools succeed.
- Never fabricate documents or data.

## Project Status

**Working**: XMTP chat agent deployed to Cloudflare Workers + Containers.

- HTTP API: `https://hybrid-agent.mintdrop.workers.dev/api/chat`
- Health: `https://hybrid-agent.mintdrop.workers.dev/health`
- XMTP sidecar: Running in container, listening for messages

## Architecture

1. **Gateway** (`src/gateway/index.ts`): Cloudflare Worker, manages container processes
2. **Server** (`src/server/simple.ts`): HTTP API for chat, runs in container
3. **Sidecar** (`src/sidecar.ts`): XMTP agent, runs in container, forwards messages to server

## Key Learnings

1. **XMTP native modules work**: The `@xmtp/node-bindings` native modules work in Cloudflare sandbox containers (contrary to earlier assumptions about glibc)

2. **ESM vs CJS**: Container requires CommonJS (`.cjs`) format, not ESM

3. **Process output**: `onOutput` callbacks are registered but logs may not appear immediately in wrangler tail

## Commands

- Build: `npm run build`
- Deploy: `wrangler deploy`
- Logs: `wrangler tail --format=pretty`

## Environment Variables

Set in `wrangler.jsonc`:
- `AGENT_WALLET_KEY`: Private key for XMTP wallet
- `AGENT_SECRET`: DB encryption key (32 bytes hex)
- `XMTP_ENV`: "dev" or "production"
- `OPENROUTER_API_KEY`: For LLM responses
- `DEBUG`: "true" for verbose sidecar logging
