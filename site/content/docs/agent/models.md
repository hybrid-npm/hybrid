---
title: Models & AI Providers
description: Configure AI models and providers for your Hybrid agents
---

# Models & AI Providers

Configure your agent's AI capabilities with various model providers and optimization strategies.

## Default: OpenRouter AI SDK Provider (Preferred)

OpenRouter provides access to multiple AI models through a single API, making it the preferred choice for Hybrid agents.

### Basic OpenRouter Setup

```typescript
import { Agent } from "hybrid"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

const agent = new Agent({
  name: "My Agent",
  model: createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  })("openai/gpt-4"),
  
  instructions: "You are a helpful AI agent...",
})
```

### OpenRouter Model Options

```typescript
// GPT-4 models
const gpt4 = createOpenRouter({ apiKey })("openai/gpt-4")
const gpt4Turbo = createOpenRouter({ apiKey })("openai/gpt-4-turbo")

// Claude models
const claude3 = createOpenRouter({ apiKey })("anthropic/claude-3-opus")
const claude3Sonnet = createOpenRouter({ apiKey })("anthropic/claude-3-sonnet")

// Grok models
const grok = createOpenRouter({ apiKey })("x-ai/grok-beta")

// Gemini models
const gemini = createOpenRouter({ apiKey })("google/gemini-pro")
```

### OpenRouter Configuration

```typescript
const model = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1", // Optional: custom endpoint
  defaultHeaders: {
    "HTTP-Referer": "https://yourapp.com", // Optional: for analytics
    "X-Title": "Your App Name", // Optional: for analytics
  },
})("openai/gpt-4")
```

## Direct Provider Integrations

### OpenAI (GPT-4, GPT-3.5-turbo)

```typescript
import { openai } from "ai"

const agent = new Agent({
  model: openai("gpt-4", {
    apiKey: process.env.OPENAI_API_KEY,
  }),
})

// Available models
const models = {
  gpt4: openai("gpt-4"),
  gpt4Turbo: openai("gpt-4-turbo"),
  gpt35Turbo: openai("gpt-3.5-turbo"),
  gpt4o: openai("gpt-4o"),
  gpt4oMini: openai("gpt-4o-mini"),
}
```

### Grok (X.AI Models)

```typescript
import { createOpenAI } from "@ai-sdk/openai"

const grok = createOpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: "https://api.x.ai/v1",
})

const agent = new Agent({
  model: grok("grok-beta"),
})
```

### Anthropic (Claude Models)

```typescript
import { anthropic } from "@ai-sdk/anthropic"

const agent = new Agent({
  model: anthropic("claude-3-opus-20240229", {
    apiKey: process.env.ANTHROPIC_API_KEY,
  }),
})

// Available Claude models
const claudeModels = {
  opus: anthropic("claude-3-opus-20240229"),
  sonnet: anthropic("claude-3-sonnet-20240229"),
  haiku: anthropic("claude-3-haiku-20240307"),
}
```

### Google Gemini (Gemini Pro, Gemini Flash)

```typescript
import { google } from "@ai-sdk/google"

const agent = new Agent({
  model: google("models/gemini-pro", {
    apiKey: process.env.GOOGLE_API_KEY,
  }),
})

// Available Gemini models
const geminiModels = {
  pro: google("models/gemini-pro"),
  flash: google("models/gemini-1.5-flash"),
  ultra: google("models/gemini-ultra"),
}
```

## AI SDK Providers Overview

Hybrid uses the [AI SDK](https://ai-sdk.dev) for model integration, providing:

- **Unified interface** across different providers
- **Streaming support** for real-time responses
- **Tool calling** for agent capabilities
- **Type safety** with TypeScript
- **Error handling** and retry logic

### Complete Provider List

For a comprehensive list of supported providers, see the [AI SDK providers page](https://ai-sdk.dev/providers/ai-sdk-providers).

Popular providers include:
- OpenAI (GPT models)
- Anthropic (Claude models)
- Google (Gemini models)
- Cohere (Command models)
- Mistral AI (Mistral models)
- Perplexity (Sonar models)
- Together AI (Open source models)
- Fireworks AI (Fast inference)

## Model Selection Strategies

### Performance Considerations

Choose models based on your requirements:

```typescript
// High-quality reasoning (slower, more expensive)
const premiumAgent = new Agent({
  model: createOpenRouter({ apiKey })("openai/gpt-4"),
  use: "complex-analysis",
})

// Fast responses (faster, cheaper)
const quickAgent = new Agent({
  model: createOpenRouter({ apiKey })("openai/gpt-3.5-turbo"),
  use: "simple-queries",
})

// Balanced approach
const balancedAgent = new Agent({
  model: createOpenRouter({ apiKey })("anthropic/claude-3-sonnet"),
  use: "general-purpose",
})
```

### Cost Optimization

Optimize costs with model selection:

```typescript
class CostOptimizedAgent extends Agent {
  selectModel(messageComplexity: number) {
    if (messageComplexity > 0.8) {
      return createOpenRouter({ apiKey })("openai/gpt-4")
    } else if (messageComplexity > 0.5) {
      return createOpenRouter({ apiKey })("anthropic/claude-3-sonnet")
    } else {
      return createOpenRouter({ apiKey })("openai/gpt-3.5-turbo")
    }
  }
}
```

### Capability-Based Selection

Choose models based on specific capabilities:

```typescript
const modelConfig = {
  // Best for code generation
  coding: createOpenRouter({ apiKey })("openai/gpt-4"),
  
  // Best for analysis
  analysis: createOpenRouter({ apiKey })("anthropic/claude-3-opus"),
  
  // Best for conversation
  chat: createOpenRouter({ apiKey })("anthropic/claude-3-sonnet"),
  
  // Best for speed
  quick: createOpenRouter({ apiKey })("openai/gpt-3.5-turbo"),
}
```

## Provider-Specific Configuration

### OpenAI Configuration

```typescript
const openaiModel = openai("gpt-4", {
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID, // Optional
  project: process.env.OPENAI_PROJECT_ID, // Optional
  
  // Model parameters
  temperature: 0.7,
  maxTokens: 2000,
  topP: 0.9,
  frequencyPenalty: 0.1,
  presencePenalty: 0.1,
})
```

### Anthropic Configuration

```typescript
const claudeModel = anthropic("claude-3-opus-20240229", {
  apiKey: process.env.ANTHROPIC_API_KEY,
  
  // Model parameters
  maxTokens: 4000,
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
})
```

### Google Configuration

```typescript
const geminiModel = google("models/gemini-pro", {
  apiKey: process.env.GOOGLE_API_KEY,
  
  // Model parameters
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 2048,
})
```

## Fallback and Redundancy Strategies

### Provider Fallback

Implement fallback between providers:

```typescript
class ResilientAgent extends Agent {
  async generateResponse(message: string) {
    const providers = [
      () => this.tryOpenRouter(message),
      () => this.tryOpenAI(message),
      () => this.tryAnthropic(message),
    ]
    
    for (const provider of providers) {
      try {
        return await provider()
      } catch (error) {
        console.warn(`Provider failed: ${error.message}`)
        continue
      }
    }
    
    throw new Error("All providers failed")
  }
}
```

### Model Fallback

Fallback to simpler models on failure:

```typescript
const agent = new Agent({
  models: {
    primary: createOpenRouter({ apiKey })("openai/gpt-4"),
    fallback: createOpenRouter({ apiKey })("openai/gpt-3.5-turbo"),
    emergency: createOpenRouter({ apiKey })("anthropic/claude-3-haiku"),
  },
  
  async generateResponse(message) {
    try {
      return await this.models.primary.generate(message)
    } catch (error) {
      try {
        return await this.models.fallback.generate(message)
      } catch (fallbackError) {
        return await this.models.emergency.generate(message)
      }
    }
  }
})
```

### Load Balancing

Distribute requests across multiple providers:

```typescript
class LoadBalancedAgent extends Agent {
  constructor() {
    super()
    this.providers = [
      createOpenRouter({ apiKey })("openai/gpt-4"),
      createOpenRouter({ apiKey })("anthropic/claude-3-opus"),
      createOpenRouter({ apiKey })("google/gemini-pro"),
    ]
    this.currentProvider = 0
  }
  
  getNextProvider() {
    const provider = this.providers[this.currentProvider]
    this.currentProvider = (this.currentProvider + 1) % this.providers.length
    return provider
  }
}
```

## Advanced Model Configuration

### Dynamic Model Selection

Select models based on context:

```typescript
class AdaptiveAgent extends Agent {
  selectModel(context: MessageContext) {
    if (context.requiresReasoning) {
      return createOpenRouter({ apiKey })("openai/gpt-4")
    }
    
    if (context.requiresSpeed) {
      return createOpenRouter({ apiKey })("openai/gpt-3.5-turbo")
    }
    
    if (context.requiresCreativity) {
      return createOpenRouter({ apiKey })("anthropic/claude-3-opus")
    }
    
    return this.defaultModel
  }
}
```

### Model Ensembling

Combine responses from multiple models:

```typescript
class EnsembleAgent extends Agent {
  async generateEnsembleResponse(message: string) {
    const models = [
      createOpenRouter({ apiKey })("openai/gpt-4"),
      createOpenRouter({ apiKey })("anthropic/claude-3-opus"),
      createOpenRouter({ apiKey })("google/gemini-pro"),
    ]
    
    const responses = await Promise.all(
      models.map(model => model.generate(message))
    )
    
    return this.combineResponses(responses)
  }
  
  combineResponses(responses: string[]) {
    // Implement response combination logic
    // Could use voting, averaging, or selection based on confidence
  }
}
```

### Custom Model Wrappers

Create custom wrappers for specialized behavior:

```typescript
class CryptoSpecializedModel {
  constructor(baseModel: any) {
    this.baseModel = baseModel
  }
  
  async generate(message: string) {
    const cryptoContext = await this.getCryptoContext()
    const enhancedPrompt = `
      ${cryptoContext}
      
      User message: ${message}
      
      Respond as a crypto expert with current market context.
    `
    
    return this.baseModel.generate(enhancedPrompt)
  }
  
  async getCryptoContext() {
    // Fetch current market data, prices, etc.
    return "Current market context..."
  }
}
```

## Next Steps

- Learn about [Behaviors](/agent/behaviors) for message processing
- Explore [XMTP Tools](/tools/xmtp) for messaging capabilities
- Check out [Blockchain Tools](/tools/blockchain) for crypto functionality
- See [Tools](/tools) for creating custom agent capabilities
