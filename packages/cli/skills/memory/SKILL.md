---
name: memory
description: Task scheduling and reminders for persistent follow-ups.
---

# Task Scheduling

Schedule tasks to run at specific times or intervals.

## scheduleTask

Schedule a task to run later. Use this for reminders, follow-ups, or recurring actions.

**Parameters:**
- `name` (string): Descriptive name for the task
- `scheduleType` ("cron" | "interval" | "once"): Type of schedule
- `scheduleValue` (string): When to run
- `prompt` (string): What to do when the task runs
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

## listScheduledTasks

View all scheduled tasks.

**Parameters:**
- `status` (optional): Filter by "active", "paused", "completed", or "failed"

## cancelScheduledTask

Remove a scheduled task.

**Parameters:**
- `taskId` (string): The task ID to cancel

## pauseScheduledTask / resumeScheduledTask

Temporarily stop or restart a task.

**Parameters:**
- `taskId` (string): The task ID to pause/resume

## Best Practices

- Use descriptive task names that explain what will happen
- Include relevant context (conversation IDs, user preferences) in the task context
- Set appropriate intervals - avoid overly frequent tasks
- Clean up completed or unnecessary tasks
