# Scheduler Specification

## Overview

The scheduler enables agents to schedule future actions for themselves. This is "agentic scheduling" - the LLM decides when and what to schedule, not a human.

## Current State

### Working Components
- **`@hybrd/scheduler`** - Core scheduler package with:
  - `AgentScheduler` class - poll-based task executor
  - `SqliteSchedulerStore` - persistent storage via sql.js
  - Support for `cron`, `interval`, and `once` schedule types

### Broken Components
- **`packages/agent/src/server/index.ts`** - The active agent server has NO scheduler integration
- **`packages/core/src/tools/scheduler.ts`** - Tools exist but are wired to the deprecated Agent class

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Agent Server (port 8454)                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │ HTTP Server │───▶│ Claude SDK  │───▶│ Scheduler Instance  │  │
│  │  /api/chat  │    │  + Tools    │    │  (AgentScheduler)   │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
│                              │                    │              │
│                              ▼                    ▼              │
│                      ┌─────────────┐    ┌───────────────────┐   │
│                      │ Scheduler   │    │ SqliteScheduler   │   │
│                      │   Tools     │    │     Store         │   │
│                      └─────────────┘    └───────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Task Execution    │
                    │  (calls /api/chat)  │
                    └─────────────────────┘
```

## Implementation Plan

### Phase 1: Scheduler Tools for Claude SDK

Claude Agent SDK accepts tools via `options.tools` array. We need to create MCP-compatible tools.

**File: `packages/scheduler/src/tools.ts`**

```typescript
import type { Tool } from "@anthropic-ai/claude-agent-sdk"
import type { AgentScheduler } from "./index.js"

export function createSchedulerTools(scheduler: AgentScheduler): Tool[] {
  return [
    {
      name: "schedule_task",
      description: `Schedule a task to run at a specific time or interval.
        
Use this to set reminders, follow-ups, or recurring tasks.

Examples:
- "Remind me tomorrow at 9am" → scheduleType: "once", scheduleValue: "2026-03-01T09:00:00Z"
- "Check every 5 minutes" → scheduleType: "interval", scheduleValue: "300000"
- "Daily standup at 9am weekdays" → scheduleType: "cron", scheduleValue: "0 9 * * 1-5"`,
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Descriptive name for the task" },
          scheduleType: { 
            type: "string", 
            enum: ["cron", "interval", "once"],
            description: "Type of schedule"
          },
          scheduleValue: { 
            type: "string", 
            description: "Cron expression, milliseconds, or ISO timestamp"
          },
          prompt: {
            type: "string",
            description: "What the agent should do when this task runs"
          }
        },
        required: ["name", "scheduleType", "scheduleValue", "prompt"]
      },
      execute: async (input: any) => {
        const task = await scheduler.schedule({
          name: input.name,
          scheduleType: input.scheduleType,
          scheduleValue: input.scheduleValue,
          prompt: input.prompt
        })
        return JSON.stringify({
          success: true,
          taskId: task.id,
          nextRun: task.nextRun?.toISOString()
        })
      }
    },
    {
      name: "list_scheduled_tasks",
      description: "List all scheduled tasks",
      input_schema: { type: "object", properties: {} },
      execute: async () => {
        const tasks = await scheduler.listTasks()
        return JSON.stringify(tasks.map(t => ({
          id: t.id,
          name: t.name,
          scheduleType: t.scheduleType,
          scheduleValue: t.scheduleValue,
          status: t.status,
          nextRun: t.nextRun?.toISOString()
        })))
      }
    },
    {
      name: "cancel_scheduled_task",
      description: "Cancel a scheduled task",
      input_schema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "ID of the task to cancel" }
        },
        required: ["taskId"]
      },
      execute: async (input: any) => {
        await scheduler.deleteTask(input.taskId)
        return JSON.stringify({ success: true, taskId: input.taskId })
      }
    }
  ]
}
```

### Phase 2: Server Integration

**File: `packages/agent/src/server/index.ts`**

Add scheduler initialization and tool registration:

```typescript
// At top level, before server starts
import { createAgentScheduler, createSqliteStore, createSchedulerTools } from "@hybrd/scheduler"

// Initialize scheduler
const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED !== "false"
const SCHEDULER_DB_PATH = process.env.SCHEDULER_DB_PATH || "./data/scheduler.db"
const SCHEDULER_POLL_MS = Number(process.env.SCHEDULER_POLL_MS) || 60000

let scheduler: AgentScheduler | null = null

if (SCHEDULER_ENABLED) {
  const store = await createSqliteStore({ dbPath: SCHEDULER_DB_PATH })
  scheduler = await createAgentScheduler({ store, pollIntervalMs: SCHEDULER_POLL_MS })
  
  // Set executor - what happens when a task runs
  scheduler.setExecutor(async (task) => {
    const response = await fetch(`http://localhost:${AGENT_PORT}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ id: "1", role: "user", content: task.payload.prompt }],
        chatId: `scheduled-${task.id}`
      })
    })
    const reader = response.body?.getReader()
    // ... stream response ...
    return "Executed"
  })
  
  scheduler.start()
}

// In runAgent(), add tools to options
const options: Options = {
  // ... existing options ...
  tools: scheduler ? createSchedulerTools(scheduler) : []
}
```

### Phase 3: Executor Implementation

When a scheduled task fires, the executor needs to:

1. **Call the agent** - POST to `/api/chat` with the stored prompt
2. **Stream the response** - Handle SSE response
3. **Optionally send message** - If `conversationId` was stored, send via channel adapter

```typescript
scheduler.setExecutor(async (task) => {
  console.log(`[scheduler] Running: ${task.name}`)
  
  const response = await fetch(`http://localhost:${AGENT_PORT}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ 
        id: crypto.randomUUID(), 
        role: "user", 
        content: task.payload.prompt 
      }],
      chatId: `scheduled-${task.id}`,
      // Pass conversation context if available
      conversationId: task.context?.conversationId
    })
  })
  
  if (!response.ok) {
    throw new Error(`Agent returned ${response.status}`)
  }
  
  // Stream the SSE response
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let result = ""
  
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    
    for (const line of decoder.decode(value).split("\n")) {
      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        try {
          const p = JSON.parse(line.slice(6))
          if (p.type === "text" && p.content) result += p.content
        } catch {}
      }
    }
  }
  
  // If we have conversation context, send the reply
  const conversationId = task.context?.conversationId
  if (conversationId) {
    // Channel adapter sending would happen here
    console.log(`[scheduler] Would send to ${conversationId}: ${result.slice(0, 50)}...`)
  }
  
  return result
})
```

## Tool Definitions

### `schedule_task`

Schedules a new task.

**Input:**
```json
{
  "name": "Daily standup reminder",
  "scheduleType": "cron",
  "scheduleValue": "0 9 * * 1-5",
  "prompt": "Remind me about standup. Ask what I'm working on today."
}
```

**Output:**
```json
{
  "success": true,
  "taskId": "task_1234567890_abc123",
  "nextRun": "2026-03-01T09:00:00.000Z"
}
```

### `list_scheduled_tasks`

Lists all scheduled tasks.

**Output:**
```json
[
  {
    "id": "task_1234567890_abc123",
    "name": "Daily standup reminder",
    "scheduleType": "cron",
    "scheduleValue": "0 9 * * 1-5",
    "status": "active",
    "nextRun": "2026-03-01T09:00:00.000Z",
    "runCount": 5
  }
]
```

### `cancel_scheduled_task`

Cancels a scheduled task.

**Input:**
```json
{
  "taskId": "task_1234567890_abc123"
}
```

**Output:**
```json
{
  "success": true,
  "taskId": "task_1234567890_abc123"
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHEDULER_ENABLED` | `true` | Enable/disable scheduler |
| `SCHEDULER_DB_PATH` | `./data/scheduler.db` | Path to SQLite database |
| `SCHEDULER_POLL_MS` | `60000` | Poll interval in milliseconds |

## Data Persistence

Tasks are stored in SQLite via sql.js (compiled to WebAssembly). This works in both Node.js and edge environments.

**Schema:**
```sql
CREATE TABLE scheduled_tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  schedule_type TEXT NOT NULL,
  schedule_value TEXT NOT NULL,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  next_run TEXT,
  last_run TEXT,
  last_result TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  run_count INTEGER DEFAULT 0,
  run_context TEXT
);
```

## Schedule Types

| Type | Format | Example |
|------|--------|---------|
| `cron` | Cron expression | `0 9 * * 1-5` (weekdays at 9am) |
| `interval` | Milliseconds | `300000` (every 5 minutes) |
| `once` | ISO timestamp | `2026-03-01T09:00:00Z` |

## Error Handling

1. **Invalid schedule** - Tool returns error, agent can try again
2. **Task execution fails** - Task marked as failed, `lastError` stored
3. **Agent unreachable** - Retry with exponential backoff (future)

## Future Enhancements

1. **Task metadata** - Store conversation context, user preferences
2. **Channel integration** - Send scheduled messages directly to conversations
3. **Task templates** - Predefined task types (reminders, reports, etc.)
4. **Webhook triggers** - External services can trigger agent tasks
5. **Task history** - Store execution history for debugging
6. **Retry policies** - Configure retry behavior per task

## Testing

```bash
# Run scheduler tests
cd packages/scheduler && pnpm test

# Test with agent
# 1. Start agent: pnpm dev
# 2. Send message: "Schedule a reminder for in 1 minute to say hello"
# 3. Verify task appears: "List my scheduled tasks"
# 4. Wait 1 minute, verify task executes
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/scheduler/src/tools.ts` | Create - Claude SDK tools |
| `packages/scheduler/src/index.ts` | Modify - Export tools |
| `packages/agent/src/server/index.ts` | Modify - Add scheduler integration |
| `packages/agent/package.json` | Modify - Add @hybrd/scheduler dependency |
