---
title: Error Handling
description: Handle errors in your agent with custom error handlers
---

# Error Handling

Hybrid provides built-in error handling capabilities through the `onError` callback, allowing you to integrate with error tracking services like Sentry, log errors to your monitoring system, or implement custom error recovery logic.

## Basic Error Handling

Hybrid automatically logs all agent errors to `console.error` with the agent name prefix. You can add a custom `onError` callback to your agent configuration for additional error handling like sending to Sentry, logging to a database, or triggering alerts:

```typescript
import { Agent } from "hybrid"

const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "Your instructions...",
  
  onError: (error: Error) => {
    // Custom error handling (Sentry, database logging, etc.)
    // Note: console.error is already called automatically
    Sentry.captureException(error)
  }
})
```

**Default Behavior:**
- All errors are automatically logged to console as: `[Agent Name] Agent error: <error>`
- Your custom `onError` callback is called after the console log
- The error is re-thrown after handling

The `onError` callback receives an `Error` object and can be synchronous or asynchronous.

## Error Types

Your agent can encounter various types of errors:

### Generation Errors

Errors that occur during text generation:

```typescript
const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  onError: (error: Error) => {
    if (error.message.includes("rate limit")) {
      console.error("Rate limited:", error)
    } else if (error.message.includes("timeout")) {
      console.error("Request timeout:", error)
    } else {
      console.error("Generation error:", error)
    }
  }
})
```

### Tool Execution Errors

Errors from tool execution are caught by individual tools, but you can add additional error handling:

```typescript
import { createTool } from "hybrid"
import { z } from "zod"

const myTool = createTool({
  description: "Example tool with error handling",
  inputSchema: z.object({
    action: z.string()
  }),
  execute: async ({ input, runtime }) => {
    try {
      // Tool logic
      const result = await performAction(input.action)
      return { success: true, data: result }
    } catch (error) {
      // Handle tool-specific errors
      console.error("Tool error:", error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
})
```

## Integration with Error Tracking Services

### Sentry

Integrate with Sentry for comprehensive error tracking:

```typescript
import * as Sentry from "@sentry/node"
import { Agent } from "hybrid"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0
})

const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  onError: (error: Error) => {
    Sentry.captureException(error, {
      tags: {
        agent: "my-agent",
        component: "generation"
      },
      level: "error"
    })
  }
})
```

### Sentry with Context

Add additional context to your error reports:

```typescript
interface ErrorContext {
  userId?: string
  conversationId?: string
  messageId?: string
}

const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  onError: (error: Error) => {
    Sentry.withScope((scope) => {
      scope.setTag("agent", "my-agent")
      scope.setLevel("error")
      
      scope.setContext("error_details", {
        errorType: error.name,
        errorMessage: error.message,
        stack: error.stack
      })
      
      Sentry.captureException(error)
    })
  }
})
```

### DataDog

Integrate with DataDog for monitoring and logging:

```typescript
import { Agent } from "hybrid"
import tracer from "dd-trace"

tracer.init({
  service: "my-hybrid-agent",
  env: process.env.NODE_ENV
})

const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  onError: (error: Error) => {
    const span = tracer.scope().active()
    
    if (span) {
      span.setTag("error", true)
      span.setTag("error.type", error.name)
      span.setTag("error.message", error.message)
      span.setTag("error.stack", error.stack)
    }
    
    console.error("[DataDog] Agent error:", error)
  }
})
```

### LogRocket

Track errors in LogRocket for session replay:

```typescript
import LogRocket from "logrocket"
import { Agent } from "hybrid"

LogRocket.init(process.env.LOGROCKET_APP_ID!)

const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  onError: (error: Error) => {
    LogRocket.captureException(error, {
      tags: {
        agent: "my-agent",
        severity: "error"
      },
      extra: {
        errorName: error.name,
        errorMessage: error.message,
        timestamp: new Date().toISOString()
      }
    })
  }
})
```

### Rollbar

Use Rollbar for error tracking:

```typescript
import Rollbar from "rollbar"
import { Agent } from "hybrid"

const rollbar = new Rollbar({
  accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
  environment: process.env.NODE_ENV
})

const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  onError: (error: Error) => {
    rollbar.error(error, {
      agent: "my-agent",
      timestamp: Date.now()
    })
  }
})
```

## Custom Error Handling

### Retry Logic

Implement retry logic for transient errors:

```typescript
import { Agent } from "hybrid"

interface RetryState {
  attempts: Map<string, number>
  maxRetries: number
}

const retryState: RetryState = {
  attempts: new Map(),
  maxRetries: 3
}

const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  onError: async (error: Error) => {
    const errorKey = error.message
    const currentAttempts = retryState.attempts.get(errorKey) || 0
    
    if (currentAttempts < retryState.maxRetries) {
      retryState.attempts.set(errorKey, currentAttempts + 1)
      console.log(`Retry attempt ${currentAttempts + 1} for error: ${error.message}`)
    } else {
      console.error(`Max retries exceeded for error: ${error.message}`)
      retryState.attempts.delete(errorKey)
      
      await notifyAdministrator(error)
    }
  }
})
```

### Alerting

Send alerts when critical errors occur:

```typescript
import { Agent } from "hybrid"

async function sendSlackAlert(error: Error) {
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `🚨 Agent Error: ${error.message}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Error:* \`${error.name}\`\n*Message:* ${error.message}\n*Time:* ${new Date().toISOString()}`
          }
        }
      ]
    })
  })
}

const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  onError: async (error: Error) => {
    console.error("Agent error:", error)
    
    await sendSlackAlert(error)
  }
})
```

### Database Logging

Log errors to a database for analysis:

```typescript
import { Agent } from "hybrid"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
)

const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  onError: async (error: Error) => {
    console.error("Agent error:", error)
    
    await supabase.from("error_logs").insert({
      agent_name: "my-agent",
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
      timestamp: new Date().toISOString()
    })
  }
})
```

### Multiple Error Handlers

Combine multiple error handling strategies:

```typescript
import * as Sentry from "@sentry/node"
import { Agent } from "hybrid"

const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  onError: async (error: Error) => {
    console.error("Agent error:", error)
    
    Sentry.captureException(error)
    
    await logToDatabase(error)
    
    if (isCriticalError(error)) {
      await sendSlackAlert(error)
    }
  }
})

function isCriticalError(error: Error): boolean {
  const criticalPatterns = [
    "authentication failed",
    "database connection lost",
    "payment processing failed"
  ]
  
  return criticalPatterns.some(pattern => 
    error.message.toLowerCase().includes(pattern)
  )
}

async function logToDatabase(error: Error) {
  // Database logging logic
}

async function sendSlackAlert(error: Error) {
  // Slack alerting logic
}
```

## Async Error Handling

The `onError` callback supports async operations:

```typescript
const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  onError: async (error: Error) => {
    try {
      await Promise.all([
        Sentry.captureException(error),
        logToDatabase(error),
        sendAlert(error)
      ])
    } catch (handlerError) {
      console.error("Error in error handler:", handlerError)
    }
  }
})
```

## Best Practices

### Console Logging is Automatic

Hybrid automatically logs all errors to console with the agent name, so you don't need to add console.error in your handler:

```typescript
// ❌ Redundant - console logging is automatic
onError: async (error: Error) => {
  console.error("Agent error:", error)  // Don't need this
  await Sentry.captureException(error)
}

// ✅ Better - focus on additional error handling
onError: async (error: Error) => {
  await Sentry.captureException(error)
}

// ✅ Also good - add extra logging context if needed
onError: async (error: Error) => {
  console.log("Additional context:", { userId, timestamp })
  await Sentry.captureException(error)
}
```

### Handle Handler Errors

Protect against errors in your error handler:

```typescript
onError: async (error: Error) => {
  try {
    await externalErrorService.report(error)
  } catch (handlerError) {
    console.error("Error handler failed:", handlerError)
    console.error("Original error:", error)
  }
}
```

### Add Context

Include relevant context in your error reports:

```typescript
interface ExtendedError extends Error {
  context?: Record<string, unknown>
}

onError: async (error: ExtendedError) => {
  const errorWithContext = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    context: error.context || {},
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  }
  
  console.error("Agent error:", errorWithContext)
  
  await Sentry.captureException(error, {
    contexts: {
      agent: errorWithContext.context
    }
  })
}
```

### Don't Block Execution

Keep error handlers lightweight and non-blocking:

```typescript
onError: (error: Error) => {
  console.error("Agent error:", error)
  
  Sentry.captureException(error)
  
  setImmediate(async () => {
    await heavyLoggingOperation(error)
  })
}
```

### Test Error Handlers

Test your error handlers regularly:

```typescript
async function testErrorHandling() {
  const agent = new Agent({
    name: "Test Agent",
    model: yourModel,
    instructions: "...",
    
    onError: async (error: Error) => {
      console.log("Error handler called:", error.message)
    }
  })
  
  const testError = new Error("Test error")
  
  await agent.config.onError?.(testError)
  
  console.log("Error handler test completed")
}
```

## Error Recovery

While `onError` doesn't prevent errors from propagating, you can implement recovery logic:

```typescript
const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  
  onError: async (error: Error) => {
    console.error("Agent error:", error)
    
    await Sentry.captureException(error)
    
    if (isRecoverableError(error)) {
      await scheduleRetry()
    }
  }
})

function isRecoverableError(error: Error): boolean {
  return error.message.includes("rate limit") || 
         error.message.includes("timeout")
}

async function scheduleRetry() {
  console.log("Scheduling retry...")
}
```

## Next Steps

- Learn about [Runtime](/agent/runtime) for accessing conversation context
- Explore [Behaviors](/agent/behaviors) for message processing
- Check out [Tools](/tools) to create custom capabilities
- See [Models](/agent/models) for configuring your language model

