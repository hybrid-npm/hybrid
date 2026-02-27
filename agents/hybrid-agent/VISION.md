# Hybrid Agent Vision

Hybrid Agent is an AI assistant that runs as a container with two sidecars:

## Architecture

1. **XMTP Sidecar** - Always-on, listens for messages on XMTP network
2. **Gateway** - Handles webhooks and external requests (optional)
3. **Server** - Processes chat requests

## Current Status

- Working: XMTP chat via Fly.io deployment
- In Progress: Gateway serverless deployment

## Roadmap

- [ ] Add more messaging channels (Telegram, Discord)
- [ ] Improve agent memory and context
- [ ] Add tools for blockchain interactions

## Contributing

See `hybrid/agent` package for core code contributions.
