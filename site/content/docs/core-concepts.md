---
title: Core Concepts
description: Fundamental concepts that make Hybrid agents unique
---

# Core Concepts

Understanding the fundamental concepts behind Hybrid agents and how they differ from traditional AI applications.

## What is Hybrid and Why?

### Hybrid as a Framework

Hybrid is a TypeScript framework for building AI agents with blockchain integration and decentralized messaging. Hybrid agents:

- Communicate through XMTP (decentralized messaging protocol)
- Can interact with blockchain networks (read/write)
- Use AI models for intelligent responses
- Are extensible with custom tools and behaviors

### Decentralized Messaging Meets AI

Traditional AI agents are limited to centralized platforms. Hybrid agents use XMTP (Extensible Message Transport Protocol) for:

- **Decentralized communication** - No single point of failure
- **Wallet-based identity** - Agents are identified by their Ethereum addresses
- **End-to-end encryption** - Secure message transmission
- **Cross-platform compatibility** - Works with any XMTP-compatible client

### Why Blockchain Integration?

Blockchain integration enables agents to:

- Check wallet balances and transaction history
- Read blockchain state (blocks, transactions, gas prices)
- Execute transactions (with configured private key)
- Interact with DeFi protocols
- Provide crypto-native experiences

## XMTP Identity and Wallets

### Wallet-Based Identity

Hybrid agents use Ethereum wallets for XMTP identity:

- **Generate keys** - Use `npx hybrid keys` to generate wallet and encryption keys
- **Wallet address** - Agent is identified by its Ethereum address
- **XMTP identity** - Cryptographic identity for messaging
- **Persistent identity** - Same wallet = same agent identity

### Key Generation

Generate keys for your agent:

```bash
npx hybrid keys --write
```

This creates:
- **XMTP_WALLET_KEY** - Private key for XMTP identity
- **XMTP_DB_ENCRYPTION_KEY** - Key for encrypting local message database

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
  - Send messages and replies through XMTP
  - Provide information about blockchain transactions
  - Help users navigate the crypto ecosystem`,
  
  // XMTP tools are automatically included when agent.listen() is called
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

1. **XMTP Plugin** - Automatically connects to XMTP network using your wallet key
2. **Message Reception** - Agent receives messages through XMTP stream
3. **Behavior Processing** - Behaviors filter and process messages (before/after hooks)
4. **AI Processing** - Message is sent to AI model with available tools
5. **Tool Execution** - AI can call tools (blockchain, messaging, etc.)
6. **Response** - Agent sends response back through XMTP

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
- Connects to XMTP network
- Listens for messages in background
- Processes messages through behaviors → AI → tools → response

### Connecting AI Models to Blockchain

Agents connect AI and blockchain through:

- **Tool integration** - AI calls tools using AI SDK tool calling
- **Runtime context** - Tools access runtime config (keys, RPC, etc.)
- **Type-safe schemas** - Tools define input/output with Zod
- **Streaming support** - Real-time responses with tool execution

## Messaging with XMTP

### XMTP as Primary Network

XMTP provides:

- **Decentralized messaging** - No central authority
- **Wallet-based identity** - Messages tied to Ethereum addresses
- **End-to-end encryption** - Secure communication
- **Cross-client compatibility** - Works with any XMTP client

### Understanding XMTP Concepts

Key concepts:

- **Conversations** - 1:1 (DM) or group message threads
- **Content types** - Text, reactions, replies, remote attachments
- **Message encryption** - Automatic encryption/decryption
- **Streaming** - Real-time message delivery
- **Persistence** - Messages stored on XMTP network

### Available Filter Methods

The `filterMessages` behavior provides these filter methods:

```typescript
await agent.listen({
  port: "8454",
  behaviors: [
    filterMessages((filter) => {
      // Message type checks
      filter.isText()           // Is text message
      filter.isReaction()       // Is reaction
      filter.isReply()          // Is reply
      filter.isTextReply()      // Is text reply
      filter.isRemoteAttachment() // Has attachment
      filter.hasContent()       // Has any content
      
      // Conversation type checks
      filter.isDM()             // Is direct message (1:1)
      filter.isGroup()          // Is group conversation
      
      // Sender checks
      filter.isFromSelf()         // From agent itself
      filter.isGroupAdmin()     // Sender is group admin
      filter.isGroupSuperAdmin() // Sender is super admin
      filter.hasMention(text)   // Contains mention
      
      return true // or false to filter out
    })
  ]
})
```

### XMTP Environment

Configure XMTP network environment:

```bash
# Use production XMTP network (default)
XMTP_ENV=production

# Use development XMTP network
XMTP_ENV=dev
```

## Agent Identity

### Wallet-Based Identity

Each agent is identified by:

- **Ethereum address** - Derived from `XMTP_WALLET_KEY`
- **XMTP identity** - Cryptographic identity for messaging
- **Persistent identity** - Same wallet = same agent across sessions

### XMTP Network Registration

For production deployments, register your wallet:

```bash
npx hybrid register
```

This creates the agent's XMTP identity on the network. Registration is not required for development.

### Identity Persistence

- **Keys stored** in environment variables (`.env`)
- **Automatic reconnection** on server restart
- **Message history** persists on XMTP network

## Next Steps

Now that you understand the core concepts, explore:

- [Using Hybrid](/using-hybrid) - CLI commands and development workflow
- [Agent Configuration](/agent/prompts) - Detailed agent setup
- [XMTP Tools](/tools/xmtp) - Deep dive into messaging capabilities
- [Blockchain Tools](/tools/blockchain) - Blockchain tools and operations
