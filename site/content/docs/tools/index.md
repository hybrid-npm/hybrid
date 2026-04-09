---
title: Tools Standard Library
description: Built-in tools for blockchain operations and extensible agent functionality
---

# Tools Standard Library

Hybrid includes a comprehensive standard library of tools that enable your agents to interact with blockchain networks and perform crypto-native operations. These tools are production-ready, type-safe, and designed to work seamlessly with AI language models.

## Overview

### 🔗 Blockchain Tools
Native blockchain interactions for multi-chain operations:
- **Balance Checking** - Query native token balances across chains
- **Transaction Management** - Send transactions and monitor confirmations  
- **Gas Operations** - Estimate costs and optimize gas prices
- **Block Data** - Access blockchain state and transaction history

[View Blockchain Tools →](/tools/blockchain)

## Quick Start

### Using Blockchain Tools

```typescript
import { Agent } from "hybrid"
import { blockchainTools } from "hybrid/tools"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

const agent = new Agent({
  name: "Crypto Agent",
  model: createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })("x-ai/grok-4"),
  
  // Add blockchain tools
  tools: blockchainTools,
  
  // Configure runtime for blockchain operations
  createRuntime: () => ({
    privateKey: process.env.PRIVATE_KEY,  // For sending transactions
    rpcUrl: process.env.RPC_URL,           // Optional custom RPC
    defaultChain: "mainnet" as const       // Default chain for operations
  }),
  
  instructions: `You are a crypto AI agent with blockchain capabilities.
  
  You can:
  - Check wallet balances across multiple chains
  - Send transactions and estimate gas costs
  - Provide blockchain insights and transaction analysis
  - Help users navigate DeFi protocols
  
  Always prioritize security and verify addresses before transactions.`
})

await agent.listen({ port: "8454" })
```

## Tool Architecture

### Type-Safe Tool Definitions

All tools use Zod schemas for input/output validation:

```typescript
// Example tool structure
const exampleTool = createTool({
  description: "Human-readable description for the AI model",
  
  inputSchema: z.object({
    param1: z.string().describe("Description of param1"),
    param2: z.number().optional()
  }),
  
  outputSchema: z.object({
    result: z.string(),
    success: z.boolean()
  }),
  
  execute: async ({ input, runtime }) => {
    // Tool implementation with runtime context access
    return { result: "...", success: true }
  }
})
```

### Runtime Context

Tools have access to runtime context for configuration:

```typescript
const agent = new Agent({
  tools: blockchainTools,
  
  createRuntime: () => ({
    // Blockchain configuration
    privateKey: process.env.PRIVATE_KEY,
    rpcUrl: process.env.RPC_URL,
    defaultChain: "mainnet",
    
    // Custom configuration
    maxGasPrice: "100000000000", // 100 gwei
    apiKeys: {
      alchemy: process.env.ALCHEMY_KEY,
      infura: process.env.INFURA_KEY
    }
  })
})
```

## Supported Chains

Blockchain tools support multiple networks:

| Chain            | Chain ID | Native Token | Use Case                               |
| ---------------- | -------- | ------------ | -------------------------------------- |
| Ethereum Mainnet | 1        | ETH          | Primary DeFi, highest liquidity        |
| Polygon          | 137      | MATIC        | Low-cost operations, fast transactions |
| Arbitrum         | 42161    | ETH          | Ethereum L2, optimistic rollup         |
| Optimism         | 10       | ETH          | Ethereum L2, low fees                  |
| Base             | 8453     | ETH          | Coinbase L2, growing ecosystem         |
| Sepolia          | 11155111 | ETH          | Ethereum testnet for development       |

## Tool Categories

### Read-Only Operations
These tools don't require a private key:

```typescript
// Balance checking
const balance = await agent.call("getBalance", {
  address: "0x...",
  chain: "ethereum"
})

// Gas prices
const gas = await agent.call("getGasPrice", {
  chain: "ethereum"
})

// Transaction lookup
const tx = await agent.call("getTransaction", {
  hash: "0x...",
  chain: "ethereum"
})
```

### Write Operations
These tools require a private key in runtime context:

```typescript
// Send transactions
const result = await agent.call("sendTransaction", {
  to: "0x...",
  amount: "0.1",
  chain: "ethereum"
})
```

### Estimation Operations
Gas estimation tools:

```typescript
const estimate = await agent.call("estimateGas", {
  to: "0x...",
  amount: "0.1",
  chain: "ethereum"
})
```

## Creating Custom Tools

Extend your agent with custom tools using `createTool`. Here's a real-world example of a tool that launches a miniapp:

```typescript
import { Agent, createTool } from "hybrid"
import { z } from "zod"

/**
 * Launch Miniapp Tool
 * 
 * Launches a Base miniapp by sending its URL via message.
 * This enables agents to deliver and launch miniapps from chat conversations.
 */
const launchMiniappTool = createTool({
  description: "Launch a Base miniapp by sending its URL. Only ever call this tool once.",
  
  inputSchema: z.object({
    message: z.string()
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
      
      // Send miniapp URL to conversation
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

// Add custom tool to agent
const agent = new Agent({
  name: "Miniapp Agent",
  model: yourModel,
  tools: {
    launchMiniappTool
  },
  instructions: `You can launch miniapps for users when requested.`
})
```

### Key Concepts

- **Type Safety**: Zod schemas validate inputs and outputs
- **Runtime Access**: Access conversation, message, and custom runtime properties
- **Error Handling**: Return errors in output schema instead of throwing
- **Descriptive Schemas**: Use `.describe()` to help AI understand parameters

## Best Practices

### Security

- **Never commit private keys** - Use environment variables
- **Validate inputs** - Use Zod schemas for all tool inputs
- **Test on testnets** - Use Sepolia before mainnet deployment
- **Rate limiting** - Implement rate limits for API calls
- **Error handling** - Always handle errors gracefully

### Performance

- **Batch operations** - Group multiple operations when possible
- **Cache results** - Cache blockchain data that doesn't change frequently
- **Optimize gas** - Always estimate gas before sending transactions
- **Use L2s** - Consider Layer 2 chains for high-frequency operations

### User Experience

- **Clear feedback** - Provide clear status updates for long-running operations
- **Transaction tracking** - Monitor and report transaction status
- **Gas recommendations** - Help users understand gas costs
- **Multi-chain support** - Support multiple chains for flexibility

## Examples

### Multi-Chain Portfolio Tracker

```typescript
async function getPortfolio(address: string) {
  const chains = ["ethereum", "polygon", "arbitrum", "optimism", "base"]
  
  const balances = await Promise.all(
    chains.map(chain => 
      agent.call("getBalance", { address, chain })
    )
  )
  
  const totalValue = balances.reduce(
    (sum, b) => sum + (b.usdValue || 0), 0
  )
  
  return {
    balances,
    totalValue,
    summary: `Total: $${totalValue.toLocaleString()}`
  }
}
```

### Smart Gas Management

```typescript
async function sendWithOptimalGas(params: any) {
  const gasPrice = await agent.call("getGasPrice", { 
    chain: params.chain 
  })
  
  const estimate = await agent.call("estimateGas", params)
  
  return await agent.call("sendTransaction", {
    ...params,
    gasLimit: Math.ceil(estimate.gasLimit * 1.1),
    gasPrice: gasPrice.standard
  })
}
```

### Message Automation

```typescript
// Messaging tools are available through channel adapters
async function notifyUsers(users: string[], message: string) {
  for (const user of users) {
    await agent.call("sendMessage", {
      to: user,
      content: message
    })
    
    // React to acknowledge
    await agent.call("sendReaction", {
      messageId: lastMessageId,
      emoji: "✅"
    })
  }
}
```

## Next Steps

- **[Blockchain Tools](/tools/blockchain)** - Complete blockchain tool reference
- **[Agent Configuration](/agent/prompts)** - Configure your agent
- **[Behaviors](/agent/behaviors)** - Message processing behaviors
- **[Custom Tools](/tools#creating-custom-tools)** - Build your own tools

## Resources

- **[Agent Configuration](/agent/prompts)** - Configure your agents
- **[Community Discord](https://discord.gg/hybrid)** - Get help and share ideas

