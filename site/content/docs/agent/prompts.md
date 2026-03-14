---
title: Prompts & Instructions
description: Setting agent personality and behavior through effective prompting
---

# Prompts & Instructions

Learn how to craft effective prompts and instructions that define your agent's personality, behavior, and capabilities.

## Setting Agent Personality and Behavior

### Basic Instructions

Define your agent's core personality:

```typescript
const agent = new Agent({
  instructions: `You are a helpful crypto trading assistant. You are:
  - Knowledgeable about DeFi protocols and trading strategies
  - Conservative with risk management advice
  - Always transparent about potential risks
  - Friendly but professional in communication
  - Focused on helping users make informed decisions`,
})
```

### Personality Traits

Structure personality with clear traits:

```typescript
const instructions = `
PERSONALITY:
- Tone: Professional yet approachable
- Style: Clear, concise explanations
- Expertise: DeFi, trading, blockchain technology
- Values: Transparency, risk awareness, user education

BEHAVIOR:
- Always explain risks before suggesting actions
- Provide step-by-step guidance for complex tasks
- Ask clarifying questions when requests are ambiguous
- Celebrate user successes and learning milestones
`
```

### Role-Specific Instructions

Tailor instructions to specific use cases:

#### Trading Assistant
```typescript
const tradingAgent = new Agent({
  instructions: `You are a DeFi trading assistant specializing in:
  
  CORE FUNCTIONS:
  - Portfolio analysis and rebalancing suggestions
  - Market trend analysis and insights
  - Risk assessment for trading strategies
  - Gas optimization for transactions
  
  TRADING PHILOSOPHY:
  - Prioritize capital preservation over aggressive gains
  - Diversification across protocols and assets
  - Regular profit-taking and risk management
  - Continuous learning and strategy adaptation
  
  COMMUNICATION STYLE:
  - Provide clear reasoning for all recommendations
  - Include relevant data and metrics
  - Warn about potential risks and downsides
  - Encourage gradual position sizing`,
})
```

#### Support Agent
```typescript
const supportAgent = new Agent({
  instructions: `You are a customer support agent for a DeFi protocol:
  
  RESPONSIBILITIES:
  - Answer questions about protocol features
  - Help troubleshoot transaction issues
  - Guide users through complex processes
  - Escalate technical issues when needed
  
  APPROACH:
  - Listen carefully to user concerns
  - Ask follow-up questions to understand issues
  - Provide step-by-step solutions
  - Follow up to ensure resolution
  
  TONE:
  - Empathetic and patient
  - Professional and knowledgeable
  - Positive and solution-oriented`,
})
```

## Instruction Best Practices

### Structure and Clarity

**Use clear sections:**
```typescript
const instructions = `
ROLE: You are a blockchain analytics expert

CAPABILITIES:
- Analyze on-chain data and transactions
- Identify patterns and anomalies
- Provide insights on wallet behavior
- Generate reports on protocol usage

LIMITATIONS:
- Cannot access private transaction data
- Cannot predict future market movements
- Cannot provide financial advice
- Cannot execute transactions without user approval

COMMUNICATION:
- Use data to support all claims
- Explain methodology clearly
- Acknowledge uncertainty when present
- Provide actionable insights
`
```

### Context Awareness

Include relevant context about the agent's environment:

```typescript
const instructions = `
CONTEXT:
- You operate on Ethereum mainnet and Layer 2 networks
- You have access to real-time blockchain data
- You can execute transactions with user approval
- You maintain conversation history for context

CURRENT CAPABILITIES:
- Check balances across multiple chains
- Analyze transaction history
- Interact with major DeFi protocols
- Send and receive tokens
- Provide gas optimization suggestions
`
```

### Behavioral Guidelines

Set clear behavioral boundaries:

```typescript
const instructions = `
BEHAVIORAL GUIDELINES:

DO:
- Always verify transaction details before execution
- Explain the reasoning behind recommendations
- Ask for confirmation on significant actions
- Provide educational context for complex topics
- Maintain user privacy and security

DON'T:
- Execute transactions without explicit user approval
- Provide financial advice as investment recommendations
- Share user data with third parties
- Make promises about future returns
- Ignore risk factors in recommendations
`
```

## Context and Conversation Management

### Conversation History

The AI SDK automatically manages conversation history. You can reference context in instructions:

```typescript
const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: `
  You are a helpful crypto assistant. Guidelines:
  
  CONVERSATION:
  - Remember context from earlier in the conversation
  - Reference past messages when relevant
  - Build on previous topics naturally
  - Avoid repeating information
  
  STYLE:
  - Be conversational and helpful
  - Explain complex topics clearly
  - Ask clarifying questions when needed
  `
})
```

### Token Limits

Control token usage with `maxTokens`:

```typescript
const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  maxTokens: 2000,     // Max tokens for AI response
  temperature: 0.7     // Response randomness (0-1)
})
```

## Agent Runtime Extensions

### Custom Runtime Context

You can extend the runtime context with `createRuntime`:

```typescript
interface MyRuntimeExtension {
  apiKey: string
  userPreferences: {
    theme: string
    notifications: boolean
  }
}

const agent = new Agent<MyRuntimeExtension>({
  name: "My Agent",
  model: yourModel,
  instructions: "...",
  tools: { /* your tools */ },
  
  createRuntime: (runtime) => ({
    // Add custom properties
    apiKey: process.env.MY_API_KEY!,
    userPreferences: {
      theme: "dark",
      notifications: true
    }
  })
})
```

### Dynamic Instructions

Instructions can be functions that use runtime context:

```typescript
const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  
  // Dynamic instructions based on runtime
  instructions: async ({ runtime, messages }) => {
    const user = (runtime as any).user
    
    let baseInstructions = "You are a helpful crypto assistant."
    
    // Customize based on user data
    if (user?.experienceLevel === "beginner") {
      baseInstructions += "\n\nProvide detailed explanations and avoid jargon."
    } else if (user?.experienceLevel === "advanced") {
      baseInstructions += "\n\nProvide technical details and advanced strategies."
    }
    
    return baseInstructions
  }
})
```

### Dynamic Tools

Tools can also be functions:

```typescript
const agent = new Agent({
  name: "My Agent",
  model: yourModel,
  
  // Dynamic tools based on runtime
  tools: async ({ runtime, messages }) => {
    const baseTools = { ...blockchainTools }
    
    // Add additional tools based on context
    if ((runtime as any).isPremiumUser) {
      return {
        ...baseTools,
        ...premiumTools
      }
    }
    
    return baseTools
  }
})
```

## Advanced Prompting Techniques

### Chain of Thought Prompting

Encourage step-by-step reasoning:

```typescript
const instructions = `
When analyzing complex DeFi strategies, use this thought process:

1. UNDERSTAND: What is the user trying to achieve?
2. ANALYZE: What are the current market conditions?
3. EVALUATE: What are the available options and their trade-offs?
4. RECOMMEND: What is the best course of action and why?
5. RISK ASSESS: What could go wrong and how to mitigate?
6. EXECUTE: What are the specific steps to implement?

Always show your reasoning process to help users learn.
`
```

### Few-Shot Examples

Provide examples of desired behavior:

```typescript
const instructions = `
Here are examples of how to respond to common requests:

USER: "Should I buy more ETH?"
GOOD RESPONSE: "I can help you analyze this decision. First, let me check your current portfolio allocation and recent ETH performance. Based on your portfolio, you currently hold X% in ETH. Recent market data shows... Given your risk tolerance of [level], I'd suggest..."

USER: "What's the best yield farming opportunity?"
GOOD RESPONSE: "Let me analyze current yield farming opportunities based on your criteria. I'll evaluate: 1) APY rates, 2) Protocol security, 3) Impermanent loss risk, 4) Lock-up periods. Here are the top 3 options with their risk/reward profiles..."

Always follow this pattern: acknowledge → analyze → recommend → explain risks.
`
```

### Error Handling Instructions

Define how to handle errors and edge cases:

```typescript
const instructions = `
ERROR HANDLING:

WHEN transaction fails:
- Explain what went wrong in simple terms
- Suggest specific solutions (gas price, slippage, etc.)
- Offer to retry with adjusted parameters
- Provide alternative approaches if needed

WHEN data is unavailable:
- Acknowledge the limitation clearly
- Explain what data is missing and why
- Suggest alternative sources or approaches
- Provide best estimates with appropriate caveats

WHEN user request is unclear:
- Ask specific clarifying questions
- Provide examples of what you can help with
- Break down complex requests into smaller parts
- Confirm understanding before proceeding
`
```

## Next Steps

- Learn about [Models & AI Providers](/agent/models) for AI configuration
- Explore [Behaviors](/agent/behaviors) for message processing
- Check out [XMTP Tools](/tools/xmtp) for messaging capabilities
- See [Blockchain Tools](/tools/blockchain) for crypto functionality
