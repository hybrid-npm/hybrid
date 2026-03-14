---
title: Blockchain Tools
description: Built-in blockchain tools for crypto operations and DeFi interactions
---

# Blockchain Tools

Learn how to use Hybrid's built-in blockchain tools for crypto operations, DeFi interactions, and multi-chain support.

## Installation

Blockchain tools are included with the core Hybrid framework:

```bash
npm install hybrid
```

## Setup

### Basic Configuration

```typescript
import { Agent } from "hybrid"
import { blockchainTools } from "hybrid/tools"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY
})

const agent = new Agent({
  name: "My Agent",
  model: openrouter("x-ai/grok-4"),
  instructions: "You can check balances and send transactions",
  tools: blockchainTools,
  createRuntime: (runtime) => ({
    rpcUrl: process.env.RPC_URL,
    privateKey: process.env.PRIVATE_KEY,
    defaultChain: "mainnet" as const
  })
})

await agent.listen({
  port: "8454"
})
```

### Runtime Extension

Blockchain tools require runtime configuration:

```typescript
interface BlockchainRuntimeExtension {
  rpcUrl?: string
  privateKey?: string
  defaultChain?: "mainnet" | "sepolia" | "polygon" | "arbitrum" | "optimism" | "base"
}
```

## How Blockchain Tools Work

Blockchain tools are automatically invoked by the AI model during conversations. The AI decides when to use them based on user requests.

### Example Conversation

**User:** "What's the balance of 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"

**AI** (internally calls `getBalance` tool)

**AI:** "The balance is 1.5 ETH"

### Available Tools

- **`getBalance`** - Get native token balance for an address
- **`sendTransaction`** - Send native tokens to another address
- **`getTransaction`** - Get transaction details by hash
- **`getBlock`** - Get blockchain block information
- **`getGasPrice`** - Get current gas prices
- **`estimateGas`** - Estimate gas required for a transaction

## Supported Chains

Hybrid blockchain tools support multiple EVM-compatible chains:

- **Ethereum Mainnet** (`mainnet`)
- **Sepolia Testnet** (`sepolia`)
- **Polygon** (`polygon`)
- **Arbitrum** (`arbitrum`)
- **Optimism** (`optimism`)
- **Base** (`base`)

## Creating Custom Blockchain Tools

If you need custom blockchain functionality, create your own tools using the runtime:

### Custom Balance Tool

```typescript
import { createTool } from "hybrid"
import { z } from "zod"
import { createPublicClient, http, formatEther } from "viem"
import { mainnet, polygon } from "viem/chains"

const CHAINS = {
  mainnet,
  polygon
} as const

const multiChainBalanceTool = createTool({
  description: "Check balance across multiple chains",
  inputSchema: z.object({
    address: z.string(),
    chains: z.array(z.enum(["mainnet", "polygon"]))
  }),
  execute: async ({ input, runtime }) => {
    const { rpcUrl } = runtime as { rpcUrl?: string }
    
    const balances = await Promise.all(
      input.chains.map(async (chain) => {
        const client = createPublicClient({
          chain: CHAINS[chain],
          transport: http(rpcUrl)
        })
        
        const balance = await client.getBalance({
          address: input.address as `0x${string}`
        })
        
        return {
          chain,
          balance: formatEther(balance),
          raw: balance.toString()
        }
      })
    )
    
    return {
      success: true,
      address: input.address,
      balances
    }
  }
})
```

### Custom Transaction Tool

```typescript
import { createWalletClient, http, parseEther } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { mainnet } from "viem/chains"

const sendWithRetryTool = createTool({
  description: "Send transaction with automatic retry",
  inputSchema: z.object({
    to: z.string(),
    amount: z.string(),
    maxRetries: z.number().default(3)
  }),
  execute: async ({ input, runtime }) => {
    const { privateKey, rpcUrl } = runtime as {
      privateKey?: string
      rpcUrl?: string
    }
    
    if (!privateKey) {
      return { success: false, error: "Private key not configured" }
    }
    
    const account = privateKeyToAccount(privateKey as `0x${string}`)
    const client = createWalletClient({
      account,
      chain: mainnet,
      transport: http(rpcUrl)
    })
    
    for (let attempt = 1; attempt <= input.maxRetries; attempt++) {
      try {
        const hash = await client.sendTransaction({
          to: input.to as `0x${string}`,
          value: parseEther(input.amount)
        })
  
  return {
          success: true,
          hash,
          attempt
        }
      } catch (error) {
        if (attempt === input.maxRetries) {
      return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }
        }
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
      }
    }
    
    return { success: false, error: "Max retries exceeded" }
  }
})
```

## Using with Agent

Add your custom tools to the agent:

```typescript
const agent = new Agent({
  name: "Blockchain Agent",
  model: yourModel,
  instructions: "You can check balances and send transactions across multiple chains",
  tools: {
    ...blockchainTools,
    multiChainBalance: multiChainBalanceTool,
    sendWithRetry: sendWithRetryTool
  },
  createRuntime: (runtime) => ({
    rpcUrl: process.env.RPC_URL,
    privateKey: process.env.PRIVATE_KEY,
    defaultChain: "mainnet" as const
  })
})
```

## Runtime Configuration

### Environment Variables

```bash
# .env file
RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=0x...
```

### Dynamic Runtime

Configure runtime based on user or conversation context:

```typescript
const agent = new Agent({
  name: "Multi-User Agent",
  model: yourModel,
  tools: blockchainTools,
  createRuntime: async (baseRuntime) => {
    const userId = baseRuntime.message.senderInboxId
    const userConfig = await getUserConfig(userId)
        
        return {
      rpcUrl: userConfig.rpcUrl || process.env.RPC_URL,
      privateKey: userConfig.privateKey,
      defaultChain: userConfig.preferredChain || "mainnet"
    }
  }
})

async function getUserConfig(userId: string) {
  return {
    rpcUrl: process.env.RPC_URL,
    privateKey: process.env.PRIVATE_KEY,
    preferredChain: "polygon" as const
  }
}
```

## Best Practices

### 1. Secure Private Keys

Never hardcode private keys. Always use environment variables:

```typescript
createRuntime: (runtime) => ({
  privateKey: process.env.PRIVATE_KEY,
  rpcUrl: process.env.RPC_URL
})
```

### 2. Handle Errors Gracefully

Always handle errors in custom tools:

```typescript
const myTool = createTool({
  description: "My blockchain tool",
  inputSchema: z.object({ address: z.string() }),
  execute: async ({ input, runtime }) => {
    try {
      // Tool logic here
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }
    }
  }
})
```

### 3. Use Type Safety

Leverage TypeScript for runtime extensions:

```typescript
interface MyBlockchainRuntime {
  rpcUrl: string
  privateKey: string
  defaultChain: string
}

const agent = new Agent<MyBlockchainRuntime>({
  name: "My Agent",
  model: yourModel,
  tools: blockchainTools,
  createRuntime: (runtime) => ({
    rpcUrl: process.env.RPC_URL!,
    privateKey: process.env.PRIVATE_KEY!,
    defaultChain: "mainnet"
  })
})
```

### 4. Validate Addresses

Always validate Ethereum addresses before using them:

```typescript
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

const safeTool = createTool({
  description: "Safe blockchain operation",
  inputSchema: z.object({
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
  }),
  execute: async ({ input, runtime }) => {
    // Address is validated by Zod schema
    return { success: true }
  }
})
```

## Next Steps

- Explore [Foundry Integration](/blockchain/foundry) for smart contract development
- Check out [Multi-chain Support](/blockchain/multi-chain) for advanced cross-chain operations
- See [XMTP Tools](/tools/xmtp) for messaging capabilities
