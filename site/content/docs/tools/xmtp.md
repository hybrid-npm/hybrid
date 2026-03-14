---
title: XMTP Tools
description: Tools for sending messages, replies, and reactions through XMTP
---

# XMTP Tools

Learn how to use XMTP tools to send messages, replies, reactions, and handle conversations in your Hybrid agents.

## Automatic Tool Inclusion

XMTP tools are automatically included when your agent starts listening for messages via `agent.listen()`. The XMTP plugin automatically registers the following tools:

- `sendMessage` - Send messages to XMTP conversations
- `sendReply` - Reply to specific messages
- `sendReaction` - Send emoji reactions
- `getMessage` - Retrieve message details by ID

You don't need to manually import or add these tools to your agent configuration. They are available to your agent automatically once it starts listening.

```typescript
import { Agent } from "hybrid"

const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "You can send messages and replies through XMTP."
})

// Start listening - XMTP tools are automatically available
await agent.listen({
  port: "8454"
})
```

## Core XMTP Tools

### `sendMessage` - Send Messages to XMTP Conversations

Send messages to existing conversations or start new ones. This tool is automatically invoked by the AI model during conversations.

#### How It Works

The AI model automatically calls this tool when it needs to send messages. You can access the runtime directly in custom tools:

```typescript
import { createTool } from "hybrid"
import { z } from "zod"

const customTool = createTool({
  description: "Send a custom message",
  inputSchema: z.object({
    content: z.string()
  }),
  execute: async ({ input, runtime }) => {
    const { conversation } = runtime
    
    await conversation.send(input.content)
    
    return { success: true }
  }
})
```

#### Using Runtime in Custom Tools

Access XMTP conversation directly through the runtime:

```typescript
const notifyTool = createTool({
  description: "Send notifications",
  inputSchema: z.object({
    message: z.string(),
    recipients: z.array(z.string())
  }),
  execute: async ({ input, runtime }) => {
    const { xmtpClient } = runtime
    
    for (const recipient of input.recipients) {
      const conversation = await xmtpClient.conversations.newConversation(recipient)
      await conversation.send(input.message)
    }
    
    return { success: true }
  }
})
```

### `sendReply` - Reply to Specific Messages

Reply to specific messages in a conversation thread. The AI model automatically uses this tool when appropriate, or you can send replies directly through the runtime in custom tools.

#### Using Runtime to Send Replies

Access the conversation from runtime to send threaded replies:

```typescript
import { createTool } from "hybrid"
import { z } from "zod"
import { ContentTypeReply, ContentTypeText } from "@xmtp/content-type-reply"

const replyTool = createTool({
  description: "Send a threaded reply",
  inputSchema: z.object({
    content: z.string(),
    replyToMessageId: z.string()
  }),
  execute: async ({ input, runtime }) => {
    const { conversation } = runtime
    
    const reply = {
      reference: input.replyToMessageId,
      contentType: ContentTypeText,
      content: input.content
    }
    
    await conversation.send(reply, ContentTypeReply)
    
    return { success: true }
  }
})
```

#### Automatic Threading with Behaviors

Use the `threadedReply` behavior to automatically thread all agent responses:

```typescript
import { Agent } from "hybrid"
import { threadedReply } from "hybrid/behaviors"

const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "You are a helpful assistant"
})

await agent.listen({
  port: "8454",
  behaviors: [
    threadedReply()
  ]
})
```

### `sendReaction` - Send Emoji Reactions

Add emoji reactions to messages for quick acknowledgment. The AI model automatically uses this tool, or you can send reactions through the runtime in custom tools.

#### Using Runtime to Send Reactions

Access the conversation from runtime to send reactions:

```typescript
import { createTool } from "hybrid"
import { z } from "zod"
import { ContentTypeReaction } from "@xmtp/content-type-reaction"

const reactionTool = createTool({
  description: "Send an emoji reaction",
  inputSchema: z.object({
    emoji: z.string(),
    messageId: z.string()
  }),
  execute: async ({ input, runtime }) => {
    const { conversation } = runtime
    
    const reaction = {
      reference: input.messageId,
      action: "added",
      schema: "unicode",
      content: input.emoji
    }
    
    await conversation.send(reaction, ContentTypeReaction)
    
    return { success: true }
  }
})
```

#### Automatic Reactions with Behaviors

Use the `reactWith` behavior to automatically react to messages:

```typescript
import { Agent } from "hybrid"
import { reactWith } from "hybrid/behaviors"

const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "You are a helpful assistant"
})

await agent.listen({
  port: "8454",
  behaviors: [
    reactWith("👀")
  ]
})
```

### `getMessage` - Retrieve Message Details

Get detailed information about specific messages. This tool is automatically invoked by the AI model when it needs message details.

#### Using Runtime to Access Messages

The current message is already available in the runtime:

```typescript
import { createTool } from "hybrid"
import { z } from "zod"

const analyzeMessageTool = createTool({
  description: "Analyze the current message",
  inputSchema: z.object({
    action: z.string()
  }),
  execute: async ({ input, runtime }) => {
    const { message, xmtpClient } = runtime
    
    console.log("Current message:", message.content)
    console.log("Sender:", message.senderInboxId)
    console.log("Conversation:", message.conversationId)
    
    const isUrgent = 
      message.content.toLowerCase().includes("urgent") ||
      message.content.includes("emergency")
    
    return { 
      success: true, 
      isUrgent,
      sender: message.senderInboxId
    }
  }
})
```

#### Retrieving Other Messages

Use the XMTP client to retrieve specific messages by ID:

```typescript
const getMessageTool = createTool({
  description: "Get a specific message by ID",
  inputSchema: z.object({
    messageId: z.string()
  }),
  execute: async ({ input, runtime }) => {
    const { xmtpClient } = runtime
    
    const message = await xmtpClient.conversations.getMessageById(input.messageId)
    
    return {
      success: !!message,
      content: message?.content,
      sender: message?.senderInboxId
    }
  }
})
```

## Content Types

XMTP supports various content types for rich messaging experiences.

### Text Content

Send text messages using the runtime in custom tools:

```typescript
import { createTool } from "hybrid"
import { z } from "zod"

const portfolioTool = createTool({
  description: "Send portfolio summary",
  inputSchema: z.object({
    ethBalance: z.number(),
    usdcBalance: z.number()
  }),
  execute: async ({ input, runtime }) => {
    const { conversation } = runtime
    
    const message = `**Portfolio Summary**

• ETH: ${input.ethBalance} ETH
• USDC: ${input.usdcBalance} USDC
• Total: $${(input.ethBalance * 1700) + input.usdcBalance}

*Last updated: ${new Date().toLocaleString()}*`
    
    await conversation.send(message)
    
    return { success: true }
  }
})
```

### Reactions

Send reactions using the runtime:

```typescript
import { ContentTypeReaction } from "@xmtp/content-type-reaction"

const commonReactions = {
  acknowledge: "👍",
  celebrate: "🎉", 
  thinking: "🤔",
  warning: "⚠️",
  error: "❌",
  success: "✅",
  robot: "🤖"
}

const reactTool = createTool({
  description: "React to message",
  inputSchema: z.object({
    type: z.enum(["acknowledge", "celebrate", "thinking"])
  }),
  execute: async ({ input, runtime }) => {
    const { conversation, message } = runtime
    
    await conversation.send({
      reference: message.id,
      action: "added",
      schema: "unicode",
      content: commonReactions[input.type]
    }, ContentTypeReaction)
    
    return { success: true }
  }
})
```

### Replies

Send threaded replies using the runtime:

```typescript
import { ContentTypeReply, ContentTypeText } from "@xmtp/content-type-reply"

const threadReplyTool = createTool({
  description: "Send threaded reply",
  inputSchema: z.object({
    content: z.string()
  }),
  execute: async ({ input, runtime }) => {
    const { conversation, message } = runtime
    
    await conversation.send({
      reference: message.id,
      contentType: ContentTypeText,
      content: input.content
    }, ContentTypeReply)
    
    return { success: true }
  }
})
```

## Group Conversation Handling

### Group Message Processing

Use behaviors to filter and handle group conversations:

```typescript
import { Agent } from "hybrid"
import { filterMessages } from "hybrid/behaviors"

const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: `You are a helpful assistant. 
  You respond to group messages only when mentioned with @agent.
  You always respond to direct messages.`
})

await agent.listen({
  port: "8454",
  behaviors: [
    filterMessages((filters) => {
      return filters.isDM() || filters.hasMention("@agent")
    })
  ]
})
```

### Custom Group Handling Tool

Create a tool to handle group-specific functionality:

```typescript
import { createTool } from "hybrid"
import { z } from "zod"

const groupAdminTool = createTool({
  description: "Handle group admin commands",
  inputSchema: z.object({
    command: z.enum(["stats", "summary"]),
    groupId: z.string()
  }),
  execute: async ({ input, runtime }) => {
    const { conversation } = runtime
    
    let response: string
    
    if (input.command === "stats") {
      response = await getGroupStats(input.groupId)
    } else {
      response = await generateGroupSummary(input.groupId)
    }
    
    await conversation.send(response)
    
    return { success: true }
  }
})

async function getGroupStats(groupId: string): Promise<string> {
  return "Group stats here..."
}

async function generateGroupSummary(groupId: string): Promise<string> {
  return "Group summary here..."
}
```

## Advanced XMTP Tool Usage

### Message Queuing Tool

Create a tool to send multiple messages efficiently:

```typescript
import { createTool } from "hybrid"
import { z } from "zod"

const batchMessageTool = createTool({
  description: "Send multiple messages efficiently",
  inputSchema: z.object({
    messages: z.array(z.object({
      content: z.string(),
      recipientAddress: z.string()
    }))
  }),
  execute: async ({ input, runtime }) => {
    const { xmtpClient } = runtime
    
    const results = await Promise.all(
      input.messages.map(async (msg) => {
        const conversation = await xmtpClient.conversations.newConversation(
          msg.recipientAddress
        )
        await conversation.send(msg.content)
        return { recipient: msg.recipientAddress, sent: true }
      })
    )
    
    return { success: true, results }
  }
})
```

### Scheduled Message Tool

Create a tool to schedule delayed messages:

```typescript
const scheduleMessageTool = createTool({
  description: "Schedule a message to be sent after a delay",
  inputSchema: z.object({
    content: z.string(),
    delayMinutes: z.number()
  }),
  execute: async ({ input, runtime }) => {
    const { conversation } = runtime
    
    setTimeout(async () => {
      await conversation.send(input.content)
    }, input.delayMinutes * 60 * 1000)
    
    return { 
      success: true, 
      scheduledFor: new Date(Date.now() + input.delayMinutes * 60 * 1000)
    }
  }
})
```

### Message Templates Tool

Create reusable message templates in your tools:

```typescript
const portfolioTool = createTool({
  description: "Send portfolio summary",
  inputSchema: z.object({
    totalValue: z.number(),
    change24h: z.number(),
    holdings: z.array(z.object({
      symbol: z.string(),
      amount: z.number(),
      percentage: z.number()
    }))
  }),
  execute: async ({ input, runtime }) => {
    const { conversation } = runtime
    
    const message = `🏦 **Portfolio Summary**

💰 Total Value: $${input.totalValue.toLocaleString()}
📈 24h Change: ${input.change24h > 0 ? '+' : ''}${input.change24h.toFixed(2)}%

**Top Holdings:**
${input.holdings.map(h => 
  `• ${h.symbol}: ${h.amount} (${h.percentage}%)`
).join('\n')}

*Last updated: ${new Date().toLocaleString()}*`
    
    await conversation.send(message)
    
    return { success: true }
  }
})
```

## Error Handling and Reliability

### Retry Logic in Tools

Implement retry logic within your custom tools:

```typescript
import { createTool } from "hybrid"
import { z } from "zod"

async function sendWithRetry(
  conversation: unknown, 
  content: string, 
  maxRetries = 3
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await (conversation as { send: (content: string) => Promise<string> }).send(content)
      return
    } catch (error) {
      console.warn(`Attempt ${attempt} failed:`, error)
      
      if (attempt === maxRetries) {
        throw new Error(`Failed after ${maxRetries} attempts`)
      }
      
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      )
    }
  }
}

const reliableMessageTool = createTool({
  description: "Send a message with retry logic",
  inputSchema: z.object({
    content: z.string()
  }),
  execute: async ({ input, runtime }) => {
    const { conversation } = runtime
    
    try {
      await sendWithRetry(conversation, input.content)
      return { success: true }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
})
```

### Message Validation in Tools

Validate input before sending messages:

```typescript
const validatedMessageTool = createTool({
  description: "Send a validated message",
  inputSchema: z.object({
    content: z.string().min(1).max(10000),
    recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
  }),
  execute: async ({ input, runtime }) => {
    const { xmtpClient } = runtime
    
    try {
      const conversation = await xmtpClient.conversations.newConversation(
        input.recipientAddress
      )
      await conversation.send(input.content)
      
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send message"
      }
    }
  }
})
```

## Next Steps

- Explore [Agent Behaviors](/agent/behaviors) for message processing
- Check out [Blockchain Tools](/tools/blockchain) for crypto functionality
- See [Tools Standard Library](/tools) for overview and custom tools
