# @hybrd/scheduler

Agentic scheduling system for Hybrid AI agents. **100% OpenClaw-compatible** with additional features for agent-native workflows.

## Overview

The scheduler enables agents to schedule future actions for themselves. This is "agentic scheduling" - the LLM decides when and what to schedule, not a human.

## OpenClaw Compatibility

This scheduler implements the complete OpenClaw CronService API:

### Schedule Types

```typescript
type CronSchedule =
  | { kind: "at"; at: string }                    // One-time at specific time
  | { kind: "every"; everyMs: number; anchorMs?: number }  // Interval with anchor
  | { kind: "cron"; expr: string; tz?: string; staggerMs?: number }  // Cron expression
```

### Core API

| Method | Description |
|--------|-------------|
| `start()` | Start the scheduler, clear stale markers, arm timer |
| `stop()` | Stop the scheduler |
| `status()` | Get scheduler status (enabled, job count, next wake) |
| `list()` | List all jobs (sorted by next run) |
| `listPage(opts)` | Paginated list with query, sort, offset |
| `add(input)` | Create a new scheduled job |
| `update(id, patch)` | Update job properties |
| `remove(id)` | Delete a job |
| `run(id, mode)` | Manually trigger a job |
| `get(id)` | Get job by ID |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      SchedulerService                             │
├─────────────────────────────────────────────────────────────────┤
│  State:                                                          │
│  ├── running: boolean                                            │
│  ├── timer: setTimeout handle                                    │
│  └── op: Promise chain (for locking)                             │
├─────────────────────────────────────────────────────────────────┤
│  Core Flow:                                                      │
│  1. armTimer()    → Set precise timer to next wake time         │
│  2. onTimer()     → Find due jobs, mark running, execute        │
│  3. executeJob()  → Run payload, deliver, apply result          │
│  4. applyResult() → Update state, compute next run             │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### Precise Timer

Unlike polling-based schedulers, this implementation arms the timer to the exact next wake time:

```typescript
private armTimer(): void {
  const nextAt = this.nextWakeAtMs()  // Find earliest job
  if (!nextAt) return
  
  const delay = Math.max(0, nextAt - Date.now())
  this.state.timer = setTimeout(() => this.onTimer(), delay)
}
```

### Concurrency Protection

Uses `runningAtMs` marker to prevent double-execution:

```typescript
if (typeof job.state.runningAtMs === "number") {
  // Already running - check if stuck (> 2 hours)
  if (Date.now() - job.state.runningAtMs > STUCK_RUN_MS) {
    return true  // Stuck, allow re-run
  }
  return false  // Still running
}
```

### Error Backoff

Exponential backoff on consecutive errors:

| Errors | Backoff |
|--------|---------|
| 1 | 30 seconds |
| 2 | 60 seconds |
| 3 | 5 minutes |
| 4 | 15 minutes |
| 5+ | 1 hour |

### Missed Job Catchup

On startup, clears stale `runningAtMs` markers (from crashes) and runs any due jobs.

## Job Definition

```typescript
interface CronJob {
  id: string
  agentId?: string
  sessionKey?: string           // For reminder delivery context
  name: string
  description?: string
  enabled: boolean
  deleteAfterRun?: boolean      // Auto-delete after successful run
  createdAtMs: number
  updatedAtMs: number
  schedule: CronSchedule
  sessionTarget: "main" | "isolated"
  wakeMode: "now" | "next-heartbeat"
  payload: CronPayload
  delivery?: CronDelivery
  state: CronJobState
}
```

### Payload Types

```typescript
type CronPayload =
  | { kind: "systemEvent"; text: string }
  | {
      kind: "agentTurn"
      message: string
      model?: string
      thinking?: string
      timeoutSeconds?: number
      allowUnsafeExternalContent?: boolean
    }
```

### Delivery Configuration

```typescript
interface CronDelivery {
  mode: "none" | "announce"
  channel?: string      // "xmtp", etc.
  to?: string           // Recipient address
  accountId?: string
  bestEffort?: boolean
}
```

## Usage

### Basic Setup

```typescript
import { SchedulerService, createSqliteStore } from "@hybrd/scheduler"

const store = await createSqliteStore({ dbPath: "./data/scheduler.db" })

const scheduler = new SchedulerService({
  store,
  dispatcher: channelDispatcher,
  executor: {
    runAgentTurn: async (job) => { /* ... */ },
    runSystemEvent: async (job) => { /* ... */ }
  },
  enabled: true
})

await scheduler.start()
```

### Schedule a One-Time Task

```typescript
await scheduler.add({
  name: "Reminder",
  schedule: { kind: "at", at: "2026-03-01T09:00:00Z" },
  payload: { kind: "agentTurn", message: "Check on the project" },
  delivery: { mode: "announce", channel: "xmtp", to: "0x..." }
})
```

### Schedule an Interval Task

```typescript
await scheduler.add({
  name: "Status Check",
  schedule: { kind: "every", everyMs: 300000 },  // 5 minutes
  payload: { kind: "agentTurn", message: "Check status" }
})
```

### Schedule a Cron Task

```typescript
await scheduler.add({
  name: "Daily Standup",
  schedule: { kind: "cron", expr: "0 9 * * 1-5", tz: "America/Chicago" },
  payload: { kind: "agentTurn", message: "Time for standup!" }
})
```

## MCP Tools

The scheduler provides ready-to-use MCP tools for agent integration:

```typescript
import { createSchedulerTools } from "@hybrd/scheduler"

const tools = createSchedulerTools(scheduler)

// Use with Claude Agent SDK
const agent = new Agent({
  tools: [...otherTools, ...tools]
})
```

### Available Tools

| Tool | Description |
|------|-------------|
| `schedule_task` | Create a new scheduled task |
| `list_tasks` | List tasks with pagination and filtering |
| `cancel_task` | Cancel and remove a task |
| `get_task` | Get task details by ID |
| `run_task` | Manually trigger a task |

## Channel Adapters

Scheduler jobs can deliver results via channel adapters:

```typescript
interface ChannelAdapter {
  readonly channel: ChannelId
  readonly port: number
  start(): Promise<void>
  stop(): Promise<void>
  trigger(req: TriggerRequest): Promise<TriggerResponse>
}
```

### Built-in Adapters

| Channel | Port | Description |
|---------|------|-------------|
| `xmtp` | 8455 | XMTP messaging |

### Custom Adapter

```typescript
class SlackAdapter implements ChannelAdapter {
  readonly channel = "slack"
  readonly port = 8457
  
  async trigger(req: TriggerRequest): Promise<TriggerResponse> {
    // POST to Slack API
    return { delivered: true, messageId: "..." }
  }
}
```

## Feature Comparison

| Feature | OpenClaw | Hybrid |
|---------|:--------:|:------:|
| Precise timer | ✅ | ✅ |
| Concurrency protection | ✅ | ✅ |
| Missed job catchup | ✅ | ✅ |
| Error backoff | ✅ | ✅ |
| Pagination API | ✅ | ✅ |
| SQLite storage | ❌ | ✅ |
| MCP tools | ❌ | ✅ |
| Channel adapters | ❌ | ✅ |
| XMTP integration | ❌ | ✅ |

## Storage

Uses SQLite via sql.js (WASM) for persistence:

```typescript
interface ScheduledTaskRow {
  id: string
  name: string
  schedule: string       // JSON
  payload: string        // JSON
  delivery: string       // JSON
  state: string          // JSON
  enabled: number        // 0 or 1
  created_at: number
  updated_at: number
}
```

Benefits over JSON file storage:
- Atomic writes
- Query support
- Better performance
- Works in WASM environments

## Configuration

```typescript
interface SchedulerConfig {
  store: SqliteSchedulerStore
  dispatcher: ChannelDispatcher
  executor: SchedulerExecutor
  enabled?: boolean       // Default: true
  timezone?: string       // Default: system timezone
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHEDULER_ENABLED` | `true` | Enable/disable scheduler |
| `SCHEDULER_DB_PATH` | `./data/scheduler.db` | SQLite database path |
| `SCHEDULER_TIMEZONE` | System TZ | Default timezone for cron |

## Events

```typescript
scheduler.onEvent((event) => {
  // event.action: "added" | "updated" | "removed" | "started" | "finished"
  console.log(`Job ${event.jobId}: ${event.action}`)
})
```

## Testing

```bash
cd packages/scheduler
pnpm test
```

## License

MIT