# @hybrd/types

Shared TypeScript type definitions for the Hybrid AI agent framework. Zero runtime logic except for `BehaviorRegistryImpl`. All `@hybrd/*` packages import shared types from here.

## Overview

Every other package in the framework imports its shared interfaces from `@hybrd/types` rather than re-defining them. This package covers agents, tools, plugins, behaviors, channels, schedules, and runtime context.

## Type Categories

### Agent Types

```typescript
interface Agent<TRuntimeExtension, TPluginContext> {
  readonly name: string
  readonly plugins: PluginRegistry<TPluginContext>
  generate(messages, options): Promise<ReturnType<typeof generateText>>
  stream(messages, options): Promise<Response>
  getConfig(): { name, hasModel, hasTools, hasInstructions }
  getInstructions(options): Promise<string | undefined>
  getTools(options): Promise<Record<string, AnyTool> | undefined>
  createRuntimeContext(baseRuntime): Promise<AgentRuntime & TRuntimeExtension>
}

interface AgentConfig<TRuntimeExtension> {
  name: string
  model: LanguageModel | ((props) => LanguageModel | Promise<LanguageModel>)
  tools?: Record<string, AnyTool> | ToolGenerator
  instructions: string | ((props) => string | Promise<string>)
  createRuntime?: (runtime: AgentRuntime) => TRuntimeExtension | Promise<TRuntimeExtension>
  maxSteps?: number
  maxTokens?: number
  temperature?: number
  onError?: (error: Error) => void | Promise<void>
}
```

`model`, `tools`, and `instructions` can all be static values or async factory functions, allowing dynamic configuration based on runtime context.

### Tool Types

```typescript
interface Tool<TInput, TOutput, TRuntimeExtension> {
  description: string
  inputSchema: TInput   // Zod schema
  outputSchema?: TOutput
  execute: (args: { input, runtime, messages }) => Promise<z.infer<TOutput>>
}

type AnyTool<TRuntimeExtension> = Tool<any, any, TRuntimeExtension>
```

### Plugin Types

Plugins are applied to the agent's HTTP server. They can add routes, middleware, or other behavior.

```typescript
interface Plugin<T> {
  name: string
  description?: string
  apply: (app: Hono, context: T) => void | Promise<void>
}
```

### Behavior Types

Behaviors implement a **middleware chain** pattern. Each behavior can run logic before and after the agent generates a response, and can short-circuit the chain.

```typescript
interface BehaviorObject<TRuntimeExtension> {
  id: string
  config: BehaviorConfig
  before?(context: BehaviorContext): Promise<void> | void
  after?(context: BehaviorContext): Promise<void> | void
}

type Behavior<TConfig> = (config: TConfig & BehaviorConfig) => BehaviorObject
```

#### BehaviorRegistryImpl

The only runtime export in this package:

```typescript
import { BehaviorRegistryImpl } from "@hybrd/types"

const registry = new BehaviorRegistryImpl()
registry.register(myBehavior({ enabled: true }))
await registry.executeBefore(behaviorContext)
await registry.executeAfter(behaviorContext)
```

### Channel Types

```typescript
type ChannelId = string

interface CronDelivery {
  mode: "none" | "announce"
  channel?: ChannelId
  to?: string
  accountId?: string
  bestEffort?: boolean
}

interface TriggerRequest {
  to: string
  message: string
  metadata?: { accountId?, threadId?, replyToId? }
}

interface TriggerResponse {
  delivered: boolean
  messageId?: string
  error?: string
}

interface ChannelAdapter {
  channel: ChannelId
  port: number
  start(): Promise<void>
  stop(): Promise<void>
  trigger(req: TriggerRequest): Promise<TriggerResponse>
}
```

### Schedule Types

```typescript
type CronSchedule =
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string; staggerMs?: number }

type CronPayload =
  | { kind: "systemEvent"; text: string }
  | { kind: "agentTurn"; message, model?, thinking?, timeoutSeconds? }

interface CronJob {
  id: string
  name: string
  schedule: CronSchedule
  payload: CronPayload
  delivery?: CronDelivery
  state: CronJobState
}
```

## Architecture

```
@hybrd/types
    │
    ├── agent.ts       → Agent, AgentConfig
    ├── tool.ts        → Tool, AnyTool
    ├── plugin.ts      → Plugin, PluginRegistry
    ├── behavior.ts    → BehaviorObject, BehaviorRegistryImpl
    ├── runtime.ts     → AgentRuntime
    ├── channel.ts     → ChannelAdapter, TriggerRequest, CronDelivery
    └── schedule.ts    → CronSchedule, CronJob, SchedulerStatus
```

## Package Consumers

| Package | Imports From Here |
|---------|:-----------------:|
| `@hybrd/channels` | ✅ |
| `@hybrd/scheduler` | ✅ |
| `@hybrd/memory` | ✅ |
| `hybrid/agent` | ✅ |
| `hybrid/gateway` | ✅ |

## Testing

```bash
cd packages/types
pnpm test
```

## License

MIT
