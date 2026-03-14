# Hybrid Mini App Specification

## Overview
A mini app that allows users to chat with a Hybrid agent directly from XMTP or Farcaster.

## Functionality

### Core Features
- Chat interface with Hybrid agent
- OnchainKit integration for identity
- Real-time message display
- Loading states during agent responses

### User Flow
1. User opens mini app
2. User sees chat interface
3. User types a message and sends
4. Mini app forwards message to Hybrid agent API
5. Agent responds, message appears in chat

### Technical Stack
- **Frontend**: Astro + React
- **SDK**: OnchainKit, Farcaster Mini App SDK
- **Agent**: Hybrid Agent Server

## UI/UX

### Layout
- Single page chat interface
- Messages displayed in bubbles (user right, agent left)
- Input field with send button at bottom

### Styling
- Minimal styling with inline styles
- Dark theme for user messages
- Light theme for agent messages
- Clean, modern appearance

## Environment Variables

### Mini App (.env)
```
AGENT_URL=http://localhost:8454
```

## API Endpoints

### POST /api/chat
Forwards chat messages to the Hybrid agent.

Request:
```json
{
  "messages": [{ "id": "string", "role": "user", "content": "string" }],
  "chatId": "string"
}
```

Response: Server-Sent Events stream with:
```json
{ "type": "text", "content": "string" }
{ "type": "usage", "inputTokens": 0, "outputTokens": 0 }
```

## Integration

The mini app is built and served by the Hybrid agent at `/mini/*` paths. Build it with:

```bash
cd server
npm install
npm run build
```

The agent will serve the built files from `server/dist/` at runtime.