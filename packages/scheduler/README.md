# @hybrd/scheduler

Agentic scheduling system for Hybrid AI agents. Enables agents to schedule future actions for themselves.

## Overview

The scheduler lets agents set up time-based triggers — run a cron job, fire after an interval, or execute once at a specific time. Jobs are persisted to SQLite and survive VM sleep/wake cycles.

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

Unlike polling-based schedulers, this implementation arms the timer to the exact next wake time — no fixed polling loop. A maintenance heartbeat runs at most every 60 seconds to handle edge cases.

### Concurrency Protection

Uses `runningAtMs` marker to prevent double-execution. Jobs that appear stuck (running for more than 2 hours) are automatically unstuck on the next scheduler start.

### Error Backoff

Exponential backoff on consecutive errors:

| Consecutive failures | Delay before retry |
|---------------------|--------------------|
| 1 | 30 seconds |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 15 minutes |
| 5+ | 1 hour |

## Job Definition

```typescript
interface CronJob {
  id: string
  agentId?: string
  sessionKey?: string
  name: string
  description?: string
  enabled: boolean
  deleteAfterRun?: boolean
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
    }
```

### Delivery Configuration

```typescript
interface CronDelivery {
  mode: "none" | "announce"
  channel?: string      // "telegram", "slack", etc.
  to?: string           // Recipient identifier
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

### Schedule Tasks

```typescript
// One-time task
await scheduler.add({
  name: "Reminder",
  schedule: { kind: "at", at: "2026-03-01T09:00:00Z" },
  payload: { kind: "agentTurn", message: "Check on the project" },
  delivery: { mode: "announce", channel: "telegram", to: "alice" }
})

// Interval task
await scheduler.add({
  name: "Status Check",
  schedule: { kind: "every", everyMs: 300000 },  // 5 minutes
  payload: { kind: "agentTurn", message: "Check status" }
})

// Cron task
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

## Storage

Uses SQLite via sql.js (WASM) for persistence. Benefits over JSON file storage:
- Atomic writes
- Query support
- Better performance
- Works in WASM environments (Firecracker microVMs)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHEDULER_ENABLED` | `true` | Enable/disable scheduler |
| `SCHEDULER_DB_PATH` | `./data/scheduler.db` | SQLite database path |
| `SCHEDULER_TIMEZONE` | System TZ | Default timezone for cron |

## Testing

```bash
cd packages/scheduler
pnpm test
```

## License

MIT
