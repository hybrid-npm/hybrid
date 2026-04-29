import { Type } from "@sinclair/typebox"
import { defineTool, type ToolDefinition } from "@mariozechner/pi-coding-agent"
import type { McpServerConfig } from "../config/schema.js"
import type { IdentityProvider } from "@hybrd/types"
import {
	createMemoryTools,
	resolveUserRole
} from "../memory-tools.js"
import { createSkillTools } from "../skills/tools.js"
import type { SchedulerService } from "@hybrd/scheduler"

// ── Scheduler tool adapters ─────────────────────────────────────────────

function schedulerResult(text: string, error = false) {
	return { content: [{ type: "text" as const, text }], details: {} as unknown, isError: error }
}

const ScheduleSchema = Type.Object({
	kind: Type.Union([Type.Literal("at"), Type.Literal("every"), Type.Literal("cron")]),
	at: Type.Optional(Type.String()),
	everyMs: Type.Optional(Type.Number()),
	anchorMs: Type.Optional(Type.Number()),
	expr: Type.Optional(Type.String()),
	tz: Type.Optional(Type.String()),
	staggerMs: Type.Optional(Type.Number())
})

const PayloadSchema = Type.Object({
	kind: Type.Union([Type.Literal("systemEvent"), Type.Literal("agentTurn")]),
	text: Type.Optional(Type.String()),
	message: Type.Optional(Type.String()),
	model: Type.Optional(Type.String()),
	thinking: Type.Optional(Type.String()),
	timeoutSeconds: Type.Optional(Type.Number()),
	allowUnsafeExternalContent: Type.Optional(Type.Boolean())
})

const DeliverySchema = Type.Object({
	mode: Type.Union([Type.Literal("none"), Type.Literal("announce")]),
	channel: Type.Optional(Type.String()),
	to: Type.Optional(Type.String()),
	accountId: Type.Optional(Type.String()),
	bestEffort: Type.Optional(Type.Boolean())
})

function createScheduleTaskTool(scheduler: SchedulerService): ToolDefinition<any, unknown, unknown> {
	return defineTool({
		name: "schedule_task",
		label: "Schedule Task",
		description: `Schedule a task to run at a specific time or interval.

Examples:
- One-time: { schedule: { kind: "at", at: "2026-03-01T09:00:00Z" }, payload: { kind: "agentTurn", message: "Check on the project" } }
- Interval: { schedule: { kind: "every", everyMs: 300000 }, payload: { kind: "agentTurn", message: "Status check" } }
- Cron: { schedule: { kind: "cron", expr: "0 9 * * 1-5" }, payload: { kind: "agentTurn", message: "Daily standup reminder" } }`,
		parameters: Type.Object({
			id: Type.Optional(Type.String()),
			agentId: Type.Optional(Type.String()),
			sessionKey: Type.Optional(Type.String()),
			name: Type.String(),
			description: Type.Optional(Type.String()),
			enabled: Type.Optional(Type.Boolean()),
			deleteAfterRun: Type.Optional(Type.Boolean()),
			schedule: ScheduleSchema,
			sessionTarget: Type.Optional(Type.Union([Type.Literal("main"), Type.Literal("isolated")])),
			wakeMode: Type.Optional(Type.Union([Type.Literal("now"), Type.Literal("next-heartbeat")])),
			payload: PayloadSchema,
			delivery: Type.Optional(DeliverySchema)
		}),
		execute: async (_toolCallId, args) => {
			try {
				const job = await scheduler.add(args as any)
				return schedulerResult(JSON.stringify({
					success: true,
					jobId: job.id,
					name: job.name,
					nextRunAtMs: job.state.nextRunAtMs
				}))
			} catch (err) {
				return schedulerResult(JSON.stringify({
					success: false,
					error: err instanceof Error ? err.message : "Failed to schedule task"
				}), true)
			}
		}
	})
}

function createListTasksTool(scheduler: SchedulerService): ToolDefinition<any, unknown, unknown> {
	return defineTool({
		name: "list_scheduled_tasks",
		label: "List Scheduled Tasks",
		description: "List all scheduled tasks with optional filtering and pagination",
		parameters: Type.Object({
			includeDisabled: Type.Optional(Type.Boolean()),
			limit: Type.Optional(Type.Number()),
			offset: Type.Optional(Type.Number()),
			query: Type.Optional(Type.String()),
			enabled: Type.Optional(Type.Union([Type.Literal("all"), Type.Literal("enabled"), Type.Literal("disabled")])),
			sortBy: Type.Optional(Type.Union([Type.Literal("nextRunAtMs"), Type.Literal("updatedAtMs"), Type.Literal("name")])),
			sortDir: Type.Optional(Type.Union([Type.Literal("asc"), Type.Literal("desc")]))
		}),
		execute: async (_toolCallId, args) => {
			try {
				const result = await scheduler.listPage(args as any)
				return schedulerResult(JSON.stringify({
					items: result.items.map(formatJob),
					total: result.total,
					offset: result.offset,
					limit: result.limit,
					hasMore: result.hasMore
				}))
			} catch (err) {
				return schedulerResult(`Error: ${err instanceof Error ? err.message : "Failed to list tasks"}`, true)
			}
		}
	})
}

function createGetTaskTool(scheduler: SchedulerService): ToolDefinition<any, unknown, unknown> {
	return defineTool({
		name: "get_scheduled_task",
		label: "Get Scheduled Task",
		description: "Get details of a specific scheduled task",
		parameters: Type.Object({ taskId: Type.String() }),
		execute: async (_toolCallId, args) => {
			try {
				const job = await scheduler.get(args.taskId)
				if (!job) {
					return schedulerResult(JSON.stringify({ error: "Task not found" }), true)
				}
				return schedulerResult(JSON.stringify(formatJob(job), null, 2))
			} catch (err) {
				return schedulerResult(`Error: ${err instanceof Error ? err.message : "Failed to get task"}`, true)
			}
		}
	})
}

function createCancelTaskTool(scheduler: SchedulerService): ToolDefinition<any, unknown, unknown> {
	return defineTool({
		name: "cancel_scheduled_task",
		label: "Cancel Scheduled Task",
		description: "Cancel and remove a scheduled task",
		parameters: Type.Object({ taskId: Type.String() }),
		execute: async (_toolCallId, args) => {
			try {
				const result = await scheduler.remove(args.taskId)
				return schedulerResult(JSON.stringify({ success: true, removed: result.removed }))
			} catch (err) {
				return schedulerResult(JSON.stringify({
					success: false,
					error: err instanceof Error ? err.message : "Failed to cancel task"
				}), true)
			}
		}
	})
}

function createRunTaskTool(scheduler: SchedulerService): ToolDefinition<any, unknown, unknown> {
	return defineTool({
		name: "run_scheduled_task",
		label: "Run Scheduled Task",
		description: "Manually trigger a scheduled task to run now",
		parameters: Type.Object({
			taskId: Type.String(),
			mode: Type.Optional(Type.Union([Type.Literal("due"), Type.Literal("force")]))
		}),
		execute: async (_toolCallId, args) => {
			try {
				const result = await scheduler.run(args.taskId, args.mode)
				return schedulerResult(JSON.stringify(result))
			} catch (err) {
				return schedulerResult(JSON.stringify({
					success: false,
					error: err instanceof Error ? err.message : "Failed to run task"
				}), true)
			}
		}
	})
}

function formatSchedule(schedule: any): string {
	switch (schedule.kind) {
		case "at": return `at ${schedule.at}`
		case "every": return `every ${schedule.everyMs}ms`
		case "cron": return `cron ${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ""}`
	}
	return String(schedule)
}

function formatJob(job: any): Record<string, unknown> {
	return {
		id: job.id,
		name: job.name,
		description: job.description,
		enabled: job.enabled,
		schedule: formatSchedule(job.schedule),
		sessionTarget: job.sessionTarget,
		wakeMode: job.wakeMode,
		payload: job.payload,
		delivery: job.delivery,
		state: {
			nextRunAtMs: job.state.nextRunAtMs,
			lastRunAtMs: job.state.lastRunAtMs,
			lastRunStatus: job.state.lastRunStatus,
			lastError: job.state.lastError,
			consecutiveErrors: job.state.consecutiveErrors
		}
	}
}

// ── Public API ────────────────────────────────────────────────────────────

export interface ToolsFactoryParams {
	projectRoot: string
	userId: string
	scheduler?: SchedulerService
	identityProvider?: IdentityProvider
}

/**
 * Compose all Hybrid custom tools into a flat array for Pi's `customTools` option.
 */
export async function createCustomTools(
	params: ToolsFactoryParams,
	mcpConfigs?: McpServerConfig[]
): Promise<ToolDefinition<any, unknown, unknown>[]> {
	const { projectRoot, userId, scheduler, identityProvider } = params
	const { role, acl } = await resolveUserRole(projectRoot, userId, identityProvider)

	const tools: ToolDefinition<any, unknown, unknown>[] = []

	tools.push(
		...createMemoryTools({
			workspaceDir: projectRoot,
			userId,
			role,
			acl,
			projectRoot,
			identityProvider
		})
	)

	if (scheduler) {
		tools.push(
			createScheduleTaskTool(scheduler),
			createListTasksTool(scheduler),
			createGetTaskTool(scheduler),
			createCancelTaskTool(scheduler),
			createRunTaskTool(scheduler)
		)
	}

	tools.push(...(await createSkillTools(userId)))

	// TODO: External MCP server configs (stdio/sse) not yet supported in Pi.
	// These would need a custom adapter to convert MCP tool definitions to
	// Pi's ToolDefinition format.
	if (mcpConfigs && mcpConfigs.length > 0) {
		console.warn(
			`[tools] ${mcpConfigs.filter((c) => !c.disabled).length} external MCP server(s) configured but not supported in Pi SDK mode`
		)
	}

	return tools
}
