---
title: Mini Apps
description: Launch interactive web apps from your Hybrid agents
---

# Mini Apps

Enable your Hybrid agents to launch interactive web applications through XMTP messages.

## What are Mini Apps?

Mini apps are web-based interactive UIs that agents can launch by sending URLs through XMTP. They provide rich user experiences for onchain interactions, data visualization, and complex workflows that go beyond simple text responses.

Common use cases:
- Transaction signing flows
- Portfolio dashboards
- Trading interfaces
- NFT galleries
- DeFi protocol interactions

## Creating a Launch Tool

Create a custom tool that sends miniapp URLs via XMTP:

```typescript
import { createTool } from "hybrid"
import { z } from "zod"

export const launchMiniappTool = createTool({
  description: "Launch a miniapp by sending its URL via XMTP",
  inputSchema: z.object({
    message: z
      .string()
      .optional()
      .describe("Optional accompanying message text")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.string().optional(),
    content: z.string(),
    error: z.string().optional()
  }),
  execute: async ({ input, runtime }) => {
    const miniappUrl = process.env.MINIAPP_URL || "http://localhost:3000"
    
    try {
      const { message } = input
      const { conversation } = runtime
      
      await conversation.send(miniappUrl)
      
      return {
        success: true,
        content: message ?? "Opening miniapp..."
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      return {
        success: false,
        content: "Error opening miniapp",
        error: errorMessage
      }
    }
  }
})
```

## Agent Configuration

Configure your agent with the miniapp launch tool:

```typescript
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { Agent } from "hybrid"
import { filterMessages, reactWith, threadedReply } from "hybrid/behaviors"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY
})

const agent = new Agent({
  name: "Miniapp Agent",
  model: openrouter("google/gemini-2.5-flash-lite"),
  tools: {
    launchMiniappTool
  },
  instructions: `You are a helpful AI agent integrated with a miniapp. You can help users with:
- Answering questions about the miniapp and its features
- Providing guidance on using onchain components
- Helping with XMTP and Farcaster interactions
- Explaining miniapp functionality

When appropriate, you can launch the miniapp to provide interactive experiences.`
})

await agent.listen({
  port: process.env.PORT || "8454",
  behaviors: [
    filterMessages((filters) => {
      return (
        filters.isDM() ||
        filters.hasMention("@agent")
      )
    }),
    reactWith("👀"),
    threadedReply()
  ]
})
```

## Environment Variables

Configure your miniapp deployment:

```bash
# .env
MINIAPP_URL=https://your-miniapp.vercel.app
PORT=8454
OPENROUTER_API_KEY=your_api_key
```

## Building Mini Apps

Mini apps are standard web applications that can be built with any framework. Popular choices:

- **Next.js** with OnchainKit for Base integrations
- **MiniKit** for Farcaster/XMTP native experiences
- **React** with wagmi/viem for custom onchain UIs

### Example: OnchainKit Integration

```typescript
// app/page.tsx
import { OnchainKitProvider } from '@coinbase/onchainkit'
import { WalletComponents } from './components/WalletComponents'

export default function MiniApp() {
  return (
    <OnchainKitProvider chain={base}>
      <div className="container">
        <h1>Agent Miniapp</h1>
        <WalletComponents />
        {/* Your miniapp UI */}
      </div>
    </OnchainKitProvider>
  )
}
```

## Testing Locally

Run your miniapp and agent locally:

```bash
# Terminal 1: Start miniapp
cd miniapp
npm run dev

# Terminal 2: Start agent
cd agent
npm run dev

# The agent will send http://localhost:3000 via XMTP
```

## Deployment

Deploy your miniapp to any hosting platform:

```bash
# Vercel
vercel deploy

# Update agent environment
export MINIAPP_URL=https://your-miniapp.vercel.app
```

## Next Steps

- Learn about [Tools Standard Library](/tools) for extending agent capabilities
- Explore [Behaviors](/agent/behaviors) for message processing
- Check out [Blockchain Tools](/tools/blockchain) for crypto functionality
- See [XMTP Tools](/tools/xmtp) for messaging features
