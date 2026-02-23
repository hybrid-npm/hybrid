---
title: Tools
description: Creating custom tools and extending agent functionality
---

# Tools

Learn how to use built-in tools and create custom tools that extend your agent's capabilities.

## Built-in Tools

Hybrid provides two main tool sets:

### Blockchain Tools

```typescript
import { blockchainTools } from "hybrid/tools"

// Available tools:
blockchainTools.getBalance       // Check wallet balance
blockchainTools.getTransaction   // Get transaction details
blockchainTools.sendTransaction  // Send native tokens (requires privateKey)
blockchainTools.getBlock         // Get block information
blockchainTools.getGasPrice      // Get current gas price
blockchainTools.estimateGas      // Estimate gas for transaction
```

**Supported chains:** `mainnet`, `sepolia`, `polygon`, `arbitrum`, `optimism`, `base`

### XMTP Tools

XMTP tools are automatically included when your agent starts listening for messages. These tools are available to your agent without needing to explicitly include them:

```typescript
// Automatically available tools:
// getMessage      // Get message by ID
// sendMessage     // Send message to conversation
// sendReply       // Send threaded reply
// sendReaction    // Send emoji reaction
```

### Using Built-in Tools

```typescript
import { Agent } from "hybrid"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { blockchainTools } from "hybrid/tools"

const agent = new Agent({
  name: "Crypto Agent",
  model: createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })("openai/gpt-4"),
  instructions: "You can check balances, send messages, and help with crypto tasks.",
  
  // Add blockchain tools (XMTP tools are automatically included)
  tools: blockchainTools,
  
  // Optional: Configure runtime for blockchain tools
  createRuntime: (runtime) => ({
    privateKey: process.env.PRIVATE_KEY, // For sending transactions
    rpcUrl: process.env.RPC_URL,         // Optional custom RPC
    defaultChain: "mainnet"              // Optional default chain
  })
})
```

## Creating Custom Tools

Custom tools use `createTool` with Zod schemas for type-safe validation.

### Tool Structure

```typescript
import { createTool } from "hybrid"
import { z } from "zod"

const myTool = createTool({
  description: "Description for the AI model",
  
  inputSchema: z.object({
    param1: z.string().describe("Description of param1"),
    param2: z.number().optional()
  }),
  
  outputSchema: z.object({
    result: z.string(),
    success: z.boolean()
  }),
  
  execute: async ({ input, runtime }) => {
    // Tool implementation
    return {
      result: "...",
      success: true
    }
  }
})
```

### Example: Weather Tool

```typescript
import { createTool } from "hybrid"
import { z } from "zod"

const weatherTool = createTool({
  description: "Get current weather for a location",
  
  inputSchema: z.object({
    location: z.string().describe("City or location name"),
    units: z.enum(["celsius", "fahrenheit"]).default("celsius")
  }),
  
  outputSchema: z.object({
    location: z.string(),
    temperature: z.number(),
    condition: z.string(),
    humidity: z.number()
  }),
  
  execute: async ({ input }) => {
    const response = await fetch(
      `https://api.weather.com/v1/current?location=${input.location}&units=${input.units}`,
      {
        headers: { 'Authorization': `Bearer ${process.env.WEATHER_API_KEY}` }
      }
    )
    
    const data = await response.json()
    
    return {
      location: input.location,
      temperature: data.temperature,
      condition: data.condition,
      humidity: data.humidity
    }
  }
})
```

### Example: Database Query Tool

```typescript
import { createTool } from "hybrid"
import { z } from "zod"

const queryUserTool = createTool({
  description: "Query user information from database",
  
  inputSchema: z.object({
    userId: z.string().describe("User ID to query"),
    fields: z.array(z.string()).optional().describe("Fields to return")
  }),
  
  outputSchema: z.object({
    user: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      createdAt: z.string()
    }).nullable(),
    error: z.string().optional()
  }),
  
  execute: async ({ input }) => {
    try {
      // Query your database
      const user = await db.users.findOne({ id: input.userId })
      
      if (!user) {
        return { user: null, error: "User not found" }
      }
      
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt.toISOString()
        }
      }
    } catch (error) {
      return {
        user: null,
        error: error instanceof Error ? error.message : "Unknown error"
      }
    }
  }
})
```

### Example: DeFi Protocol Tool

```typescript
import { createTool } from "hybrid"
import { z } from "zod"

const getAaveRatesTool = createTool({
  description: "Get current lending/borrowing rates from Aave",
  
  inputSchema: z.object({
    token: z.string().describe("Token symbol (e.g., USDC, DAI, ETH)"),
    chain: z.enum(["mainnet", "polygon", "arbitrum"]).default("mainnet")
  }),
  
  outputSchema: z.object({
    token: z.string(),
    chain: z.string(),
    depositAPY: z.number(),
    borrowAPY: z.number(),
    totalSupply: z.string(),
    totalBorrow: z.string()
  }),
  
  execute: async ({ input }) => {
    // Call Aave API or contract
    const response = await fetch(
      `https://api.aave.com/v3/rates/${input.chain}/${input.token}`
    )
    const data = await response.json()
    
    return {
      token: input.token,
      chain: input.chain,
      depositAPY: data.depositAPY,
      borrowAPY: data.borrowAPY,
      totalSupply: data.totalSupply,
      totalBorrow: data.totalBorrow
    }
  }
})
```

## Using Runtime Context

Tools can access runtime context passed from the agent:

```typescript
const myTool = createTool({
  description: "Tool that uses runtime context",
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  
  execute: async ({ input, runtime }) => {
    // Access custom runtime properties
    const privateKey = (runtime as any).privateKey
    const rpcUrl = (runtime as any).rpcUrl
    const customConfig = (runtime as any).customConfig
    
    // Use runtime values
    return { result: "..." }
  }
})
```

### Extending Runtime Type

For type safety, extend the runtime:

```typescript
interface MyRuntimeExtension {
  apiKey: string
  customConfig: {
    timeout: number
    retries: number
  }
}

const agent = new Agent<MyRuntimeExtension>({
  name: "My Agent",
  model: yourModel,
  tools: { myTool },
  createRuntime: (runtime) => ({
    apiKey: process.env.MY_API_KEY!,
    customConfig: {
      timeout: 5000,
      retries: 3
    }
  })
})
```

## Adding Tools to Agent

```typescript
// Option 1: Spread blockchain tools with custom tools
// (XMTP tools are automatically included)
const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  tools: {
    ...blockchainTools,
    weather: weatherTool,
    queryUser: queryUserTool
  }
})

// Option 2: Individual tools only
const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  tools: {
    getBalance: blockchainTools.getBalance,
    weather: weatherTool,
    custom: myCustomTool
  }
})
```

## Tool Best Practices

### Schema Design

- Use descriptive field names
- Add `.describe()` to help AI understand parameters
- Set sensible defaults with `.default()`
- Validate input thoroughly with Zod

### Error Handling

- Return errors in the output schema (don't throw)
- Provide helpful error messages
- Include success/error flags in output

```typescript
outputSchema: z.object({
  success: z.boolean(),
  data: z.object({...}).optional(),
  error: z.string().optional()
})
```

### Performance

- Keep tools focused and simple
- Avoid long-running operations
- Use timeouts for external API calls
- Cache results when appropriate

### Security

- Validate all inputs with Zod
- Never expose sensitive data in outputs
- Use environment variables for API keys
- Sanitize user inputs before using in queries

## Next Steps

- Learn about [Blockchain Tools](/tools/blockchain) for detailed crypto functionality
- Explore [XMTP Tools](/tools/xmtp) for messaging capabilities
- Check out [Behaviors](/agent/behaviors) for message processing
- See [Agent Configuration](/agent/prompts) for customizing your agent
