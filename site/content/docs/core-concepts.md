---
title: Core Concepts
description: Fundamental concepts that make Hybrid agents unique
---

Understanding the fundamental concepts behind Hybrid agents and how they differ from traditional AI applications.

## What is Hybrid and Why?

### Hybrid as a Framework

Hybrid is a TypeScript framework for building AI agents with blockchain integration. Hybrid agents:

- Communicate through channel adapters (Telegram, Slack, etc.)
- Can interact with blockchain networks (read/write)
- Use AI models for intelligent responses
- Are extensible with custom tools and behaviors

### Channel-Based Messaging

Traditional AI agents are limited to centralized platforms. Hybrid agents use channel adapters for:

- **Flexible communication** - Connect to any messaging platform
- **Wallet-based identity** - Agents are identified by their Ethereum addresses
- **Extensible architecture** - Add new channels via adapter framework
- **Multi-platform support** - Works with any messaging integration

### Why Blockchain Integration?

Blockchain integration enables agents to:

- Check wallet balances and transaction history
- Read blockchain state (blocks, transactions, gas prices)
- Execute transactions (with configured private key)
- Interact with DeFi protocols
- Provide crypto-native experiences

## Agent Identity

### Wallet-Based Identity

Hybrid agents use Ethereum wallets for identity:

- **Generate keys** - Use `npx hybrid keys` to generate wallet and encryption keys
- **Wallet address** - Agent is identified by its Ethereum address
- **Persistent identity** - Same wallet = same agent identity

### Key Generation

Generate keys for your agent:

```bash
npx hybrid keys --write
```

This creates:
- **AGENT_WALLET_KEY** - Private key for wallet identity

### Optional: Blockchain Transaction Capabilities

If you want your agent to send transactions, configure a private key:

```typescript
const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  tools: {
    ...blockchainTools
  },
  createRuntime: (runtime) => ({
    privateKey: process.env.PRIVATE_KEY, // For sending transactions
    rpcUrl: process.env.RPC_URL,        // Optional custom RPC
    defaultChain: "mainnet"             // Optional default chain
  })
})
```

**Note:** Private key is only needed for transaction-sending tools. Read-only operations (balance checks, etc.) don't require it.

## Agent Class Fundamentals

### Basic Agent Structure

```typescript
import { Agent } from "hybrid"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

const agent = new Agent({
  name: "My Agent",
  model: yourAIModel,
  instructions: "Your agent's personality and behavior",
  tools: {/* optional tools */},
  maxTokens: 2000, // optional
  temperature: 0.7 // optional
})
```

### Complete Agent Example

```typescript
import { Agent } from "hybrid"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { filterMessages, reactWith, threadedReply } from "hybrid/behaviors"
import { blockchainTools } from "hybrid/tools"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY
})

const agent = new Agent({
  name: "Crypto Agent",
  model: openrouter("openai/gpt-4"),
  
  instructions: `You are a helpful crypto AI agent. You can:
  - Check wallet balances and transaction history
  - Provide information about blockchain transactions
  - Help users navigate the crypto ecosystem`,
  
  tools: blockchainTools,
  
  createRuntime: (runtime) => ({
    privateKey: process.env.PRIVATE_KEY,
    rpcUrl: process.env.RPC_URL
  })
})

await agent.listen({
  port: "8454",
  behaviors: [
    filterMessages((filter) => filter.isText() && !filter.isFromSelf()),
    reactWith("👀"),
    threadedReply()
  ]
})
```

### How It Works

1. **Channel Adapter** - Receives messages from connected platforms
2. **Message Reception** - Agent receives messages through channel stream
3. **Behavior Processing** - Behaviors filter and process messages (before/after hooks)
4. **AI Processing** - Message is sent to AI model with available tools
5. **Tool Execution** - AI can call tools (blockchain, messaging, etc.)
6. **Response** - Agent sends response back through the channel

### Agent Listen Method

The `listen` method starts the agent server:

```typescript
await agent.listen({
  port: "8454",                    // HTTP server port
  behaviors: [/* behaviors */],    // Message processing behaviors
  plugins: [/* plugins */]         // Optional additional plugins
})
```

This:
- Starts an HTTP server
- Connects to messaging channels
- Listens for messages in background
- Processes messages through behaviors → AI → tools → response

### Connecting AI Models to Blockchain

Agents connect AI and blockchain through:

- **Tool integration** - AI calls tools using AI SDK tool calling
- **Runtime context** - Tools access runtime config (keys, RPC, etc.)
- **Type-safe schemas** - Tools define input/output with Zod
- **Streaming support** - Real-time responses with tool execution

## Agent Identity

### Wallet-Based Identity

Each agent is identified by:

- **Ethereum address** - Derived from `AGENT_WALLET_KEY`
- **Persistent identity** - Same wallet = same agent across sessions

### Identity Persistence

- **Keys stored** in environment variables (`.env`)
- **Automatic reconnection** on server restart

## Next Steps

Now that you understand the core concepts, explore:

- [Using Hybrid](/using-hybrid) - CLI commands and development workflow
- [Agent Configuration](/agent/prompts) - Detailed agent setup
- [Blockchain Tools](/tools/blockchain) - Blockchain tools and operations
