---
title: Runtime
description: Access conversation context and extend runtime with custom data
---

# Runtime

The runtime provides your agent's tools and behaviors with access to the current conversation context. It includes XMTP message data and can be extended with custom properties for your application.

## What is Runtime?

Runtime is a context object passed to every tool execution and behavior. It contains:

```typescript
interface AgentRuntime {
  conversation: XmtpConversation  // The XMTP conversation
  message: XmtpMessage             // The current message
}
```

### Accessing Runtime in Tools

Tools automatically receive the runtime context:

```typescript
import { createTool } from "hybrid"
import { z } from "zod"

const myTool = createTool({
  description: "Example tool that uses runtime",
  inputSchema: z.object({
    query: z.string()
  }),
  execute: async ({ input, runtime }) => {
    // Access conversation context
    const { conversation, message } = runtime
    
    // Use XMTP data
    console.log(`Sender: ${message.senderInboxId}`)
    console.log(`Conversation ID: ${conversation.id}`)
    
    // Send additional messages if needed
    await conversation.send(`Processing: ${input.query}`)
    
    return { success: true }
  }
})
```

### Runtime in Behaviors

Behaviors also receive runtime through their context:

```typescript
import type { BehaviorObject, BehaviorContext } from "hybrid/behaviors"

function customBehavior(): BehaviorObject {
  return {
    id: "custom-behavior",
    config: { enabled: true },
    async before(context: BehaviorContext) {
      const { message, conversation, client } = context
      
      // Access runtime data
      const sender = message.senderInboxId
      const isGroup = conversation.isGroup
      
      console.log(`Message from ${sender} in ${isGroup ? 'group' : 'DM'}`)
    }
  }
}
```

## Extending Runtime

Extend the runtime with custom properties for your application using `createRuntime`:

### Basic Extension

Add custom data to all tools and behaviors:

```typescript
interface MyRuntimeExtension {
  apiKey: string
  userId: string
}

const agent = new Agent<MyRuntimeExtension>({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  createRuntime: (baseRuntime) => ({
    apiKey: process.env.MY_API_KEY!,
    userId: "user-123"
  })
})
```

### Using Extended Runtime in Tools

Access custom properties in your tools:

```typescript
const myTool = createTool({
  description: "Tool using custom runtime",
  inputSchema: z.object({
    action: z.string()
  }),
  execute: async ({ input, runtime }) => {
    // Access base runtime
    const { conversation, message } = runtime
    
    // Access custom properties (with type safety)
    const { apiKey, userId } = runtime as AgentRuntime & MyRuntimeExtension
    
    // Use custom data
    const response = await fetch("https://api.example.com/data", {
      headers: { 
        "Authorization": `Bearer ${apiKey}`,
        "X-User-ID": userId
      }
    })
    
    return { success: true, data: await response.json() }
  }
})
```

### Dynamic Runtime

Create runtime context dynamically based on the current message:

```typescript
interface UserContext {
  userId: string
  preferences: Record<string, unknown>
  metadata: Record<string, unknown>
}

const agent = new Agent<UserContext>({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  createRuntime: async (baseRuntime) => {
    // Extract user from message
    const senderId = baseRuntime.message.senderInboxId
    
    // Fetch user data from database
    const userData = await db.users.findOne({ id: senderId })
    
    return {
      userId: senderId,
      preferences: userData?.preferences || {},
      metadata: userData?.metadata || {}
    }
  }
})
```

## Common Use Cases

### Database Access

Provide database clients to all tools:

```typescript
import { createClient } from "@supabase/supabase-js"

interface DatabaseRuntime {
  db: ReturnType<typeof createClient>
}

const agent = new Agent<DatabaseRuntime>({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  createRuntime: (runtime) => ({
    db: createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_KEY!
    )
  })
})

// Use in tools
const getUserTool = createTool({
  description: "Get user data",
  inputSchema: z.object({ userId: z.string() }),
  execute: async ({ input, runtime }) => {
    const { db } = runtime as AgentRuntime & DatabaseRuntime
    
    const { data, error } = await db
      .from("users")
      .select("*")
      .eq("id", input.userId)
      .single()
    
    return { success: !error, data }
  }
})
```

### API Clients

Share API clients across tools:

```typescript
interface APIRuntime {
  stripe: Stripe
  openai: OpenAI
}

const agent = new Agent<APIRuntime>({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  createRuntime: (runtime) => ({
    stripe: new Stripe(process.env.STRIPE_KEY!),
    openai: new OpenAI({ apiKey: process.env.OPENAI_KEY! })
  })
})
```

### User Preferences

Load and access user-specific settings:

```typescript
interface PreferencesRuntime {
  language: string
  timezone: string
  features: string[]
}

const agent = new Agent<PreferencesRuntime>({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  createRuntime: async (runtime) => {
    const userId = runtime.message.senderInboxId
    const prefs = await loadUserPreferences(userId)
    
    return {
      language: prefs.language || "en",
      timezone: prefs.timezone || "UTC",
      features: prefs.enabledFeatures || []
    }
  }
})
```

### Session State

Maintain session-specific state:

```typescript
interface SessionRuntime {
  sessionId: string
  startTime: number
  cache: Map<string, unknown>
}

const sessionCache = new Map<string, Map<string, unknown>>()

const agent = new Agent<SessionRuntime>({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  createRuntime: (runtime) => {
    const sessionId = runtime.conversation.id
    
    if (!sessionCache.has(sessionId)) {
      sessionCache.set(sessionId, new Map())
    }
    
    return {
      sessionId,
      startTime: Date.now(),
      cache: sessionCache.get(sessionId)!
    }
  }
})
```

## Type Safety

Use TypeScript generics for full type safety:

```typescript
import type { AgentRuntime } from "hybrid"

// Define your extension interface
interface MyRuntime {
  apiKey: string
  userId: string
}

// Type the agent
const agent = new Agent<MyRuntime>({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  createRuntime: (runtime) => ({
    apiKey: process.env.API_KEY!,
    userId: "user-123"
  })
})

// Create typed tools
const typedTool = createTool({
  description: "Typed tool",
  inputSchema: z.object({ action: z.string() }),
  execute: async ({ input, runtime }) => {
    // TypeScript knows about custom properties
    const extended = runtime as AgentRuntime & MyRuntime
    const apiKey = extended.apiKey  // ✅ Type-safe
    const userId = extended.userId   // ✅ Type-safe
    
    return { success: true }
  }
})
```

## Best Practices

### Initialize Once

Initialize expensive resources once in `createRuntime`:

```typescript
const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  createRuntime: (runtime) => {
    // ✅ Good: Initialize once
    const db = createDatabaseClient()
    
    return { db }
  }
})

// ❌ Bad: Don't initialize in tools
const badTool = createTool({
  description: "Bad example",
  inputSchema: z.object({}),
  execute: async ({ runtime }) => {
    // ❌ This creates a new client every time
    const db = createDatabaseClient()
    return { success: true }
  }
})
```

### Async Runtime Creation

Use async functions for runtime setup:

```typescript
const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  createRuntime: async (runtime) => {
    // Fetch data during setup
    const config = await fetchRemoteConfig()
    const cache = await initializeCache()
    
    return {
      config,
      cache
    }
  }
})
```

### Avoid Side Effects

Keep `createRuntime` pure when possible:

```typescript
// ✅ Good: Return data, no side effects
createRuntime: (runtime) => ({
  apiKey: process.env.API_KEY,
  baseUrl: "https://api.example.com"
})

// ⚠️ Acceptable: Necessary side effects for setup
createRuntime: async (runtime) => {
  const logger = createLogger()
  logger.info("Session started", { user: runtime.message.senderInboxId })
  
  return { logger }
}

// ❌ Bad: Unnecessary side effects
createRuntime: (runtime) => {
  console.log("Creating runtime...")  // Don't log unnecessarily
  globalState.incrementCounter()       // Don't modify global state
  
  return { apiKey: process.env.API_KEY }
}
```

## Next Steps

- Learn about [Tools](/tools) to create custom capabilities
- Explore [Behaviors](/agent/behaviors) for message processing
- Check out [Prompts](/agent/prompts) for dynamic instructions
- See [XMTP Tools](/tools/xmtp) for messaging capabilities

