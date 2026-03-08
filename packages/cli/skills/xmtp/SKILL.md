---
name: xmtp
description: XMTP messaging tools for sending messages and reactions.
---

# XMTP Messaging Tools

Tools for decentralized, encrypted messaging via XMTP.

## sendMessage

Send a message to an XMTP conversation.

**Parameters:**
- `content` (string, required): The message content to send
- `conversationId` (string, optional): Existing conversation ID
- `recipientAddress` (string, optional): Recipient address for new conversations

**Example:**
```json
{
  "content": "Hello! How can I help you today?",
  "conversationId": "existing-conversation-id"
}
```

## sendReaction

Send an emoji reaction to acknowledge a message.

**Parameters:**
- `emoji` (string, default: "👀"): The emoji reaction to send
- `referenceMessageId` (string, optional): Message ID to react to (defaults to current message)

**Common emojis:**
- 👀 - Seen/looking
- 👍 - Acknowledged
- ✅ - Done/completed
- ❤️ - Liked
- 🔥 - Great/exciting

**Example:**
```json
{
  "emoji": "👍",
  "referenceMessageId": "message-id-to-react-to"
}
```

## sendReply

Send a reply that quotes/references a specific message.

**Parameters:**
- `content` (string, required): The reply content
- `replyToMessageId` (string, optional): Message ID to reply to (defaults to current message)

**Example:**
```json
{
  "content": "Here's the answer to your question...",
  "replyToMessageId": "message-id-to-reply-to"
}
```

## getMessage

Retrieve a specific message by ID.

**Parameters:**
- `messageId` (string, required): The message ID to retrieve

**Example:**
```json
{
  "messageId": "message-id-to-retrieve"
}
```

## Best Practices

- Use `sendReaction` with 👀 immediately when you see a message to indicate you're processing
- Keep messages concise - XMTP is designed for chat contexts
- Use `sendReply` when responding to a specific question to maintain thread context
- Reactions are great for quick acknowledgments without full responses
