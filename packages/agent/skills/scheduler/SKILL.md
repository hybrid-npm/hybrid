---
name: scheduler
description: Task scheduling for reminders, follow-ups, and recurring actions.
---

# Task Scheduling

Schedule tasks to run at specific times or intervals. This is agentic scheduling - the agent decides when and what to schedule.

## scheduleTask

Schedule a task to run later. Use this for reminders, follow-ups, or recurring actions.

**Parameters:**
- `name` (string, required): Descriptive name for the task
- `scheduleType` (string, required): Type of schedule
  - `cron` - Cron expression (e.g., "0 9 * * 1-5" for weekdays at 9am)
  - `interval` - Milliseconds between runs (e.g., 300000 for every 5 minutes)
  - `once` - One-time at specific ISO timestamp
- `scheduleValue` (string, required): When to run
- `prompt` (string, required): What to do when the task runs
- `context` (object, optional): Additional context data

**Schedule Types:**

| Type | Value Format | Example |
|------|-------------|---------|
| `cron` | Cron expression | `0 9 * * 1-5` (weekdays at 9am) |
| `interval` | Milliseconds | `300000` (every 5 minutes) |
| `once` | ISO timestamp | `2026-03-01T10:00:00Z` |

**Example:**
```json
{
  "name": "Daily summary reminder",
  "scheduleType": "cron",
  "scheduleValue": "0 18 * * *",
  "prompt": "Send a summary of today's conversations"
}
```

## listTasks

View all scheduled tasks.

**Parameters:**
- `status` (string, optional): Filter by "active", "paused", "completed", or "failed"

**Example:**
```json
{
  "status": "active"
}
```

## cancelTask

Remove a scheduled task.

**Parameters:**
- `taskId` (string, required): The task ID to cancel

**Example:**
```json
{
  "taskId": "task-123"
}
```

## pauseTask / resumeTask

Temporarily stop or restart a task.

**Parameters:**
- `taskId` (string, required): The task ID to pause/resume

**Example:**
```json
{
  "taskId": "task-123"
}
```

## getTask

Get details of a specific task.

**Parameters:**
- `taskId` (string, required): The task ID to retrieve

**Example:**
```json
{
  "taskId": "task-123"
}
```

## runTask

Manually trigger a task to run immediately.

**Parameters:**
- `taskId` (string, required): The task ID to run

**Example:**
```json
{
  "taskId": "task-123"
}
```

## Common Use Cases

**Daily reminders:**
```json
{
  "name": "Morning check-in",
  "scheduleType": "cron",
  "scheduleValue": "0 9 * * *",
  "prompt": "Send a good morning message"
}
```

**Follow-up after inactivity:**
```json
{
  "name": "Follow-up reminder",
  "scheduleType": "once",
  "scheduleValue": "2026-03-15T14:00:00Z",
  "prompt": "Check if user has questions about previous discussion"
}
```

**Periodic status checks:**
```json
{
  "name": "System health check",
  "scheduleType": "interval",
  "scheduleValue": "300000",
  "prompt": "Check system status and report any issues"
}
```

## Best Practices

- Use descriptive task names that explain what will happen
- Include relevant context (conversation IDs, user preferences) in the task
- Set appropriate intervals - avoid overly frequent tasks
- Clean up completed or unnecessary tasks
- Use cron for predictable recurring schedules
- Use "once" for one-time follow-ups
