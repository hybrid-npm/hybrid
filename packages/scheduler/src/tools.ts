import type {
	CronJob,
	CronJobCreate,
	CronPayload,
	CronSchedule,
	SessionTarget,
	WakeMode
} from "@hybrd/types"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import type { SchedulerService } from "./index.js"

const ScheduleSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("at"),
		at: z.string()
	}),
	z.object({
		kind: z.literal("every"),
		everyMs: z.number().positive(),
		anchorMs: z.number().optional()
	}),
	z.object({
		kind: z.literal("cron"),
		expr: z.string(),
		tz: z.string().optional(),
		staggerMs: z.number().optional()
	})
])

const PayloadSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("systemEvent"),
		text: z.string()
	}),
	z.object({
		kind: z.literal("agentTurn"),
		message: z.string(),
		model: z.string().optional(),
		thinking: z.string().optional(),
		timeoutSeconds: z.number().optional(),
		allowUnsafeExternalContent: z.boolean().optional()
	})
])

const ScheduleTaskSchema = z.object({
	id: z.string().optional(),
	agentId: z.string().optional(),
	sessionKey: z.string().optional(),
	name: z.string(),
	description: z.string().optional(),
	enabled: z.boolean().optional(),
	deleteAfterRun: z.boolean().optional(),
	schedule: ScheduleSchema,
	sessionTarget: z.enum(["main", "isolated"]).optional(),
	wakeMode: z.enum(["now", "next-heartbeat"]).optional(),
	payload: PayloadSchema,
	delivery: z
		.object({
			mode: z.enum(["none", "announce"]),
			channel: z.string().optional(),
			to: z.string().optional(),
			accountId: z.string().optional(),
			bestEffort: z.boolean().optional()
		})
		.optional()
})

const ListTasksSchema = z
	.object({
		includeDisabled: z.boolean().optional(),
		limit: z.number().optional(),
		offset: z.number().optional(),
		query: z.string().optional(),
		enabled: z.enum(["all", "enabled", "disabled"]).optional(),
		sortBy: z.enum(["nextRunAtMs", "updatedAtMs", "name"]).optional(),
		sortDir: z.enum(["asc", "desc"]).optional()
	})
	.optional()

const CancelTaskSchema = z.object({
	taskId: z.string()
})

const GetTaskSchema = z.object({
	taskId: z.string()
})

const RunTaskSchema = z.object({
	taskId: z.string(),
	mode: z.enum(["due", "force"]).optional()
})

interface SchedulerTool {
	name: string
	description: string
	inputSchema: z.ZodTypeAny
	handler: (args: unknown) => Promise<CallToolResult>
}

function formatSchedule(schedule: CronSchedule): string {
	switch (schedule.kind) {
		case "at":
			return `at ${schedule.at}`
		case "every":
			return `every ${schedule.everyMs}ms`
		case "cron":
			return `cron ${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ""}`
	}
}

function formatJob(job: CronJob): Record<string, unknown> {
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

export function createSchedulerTools(
	scheduler: SchedulerService
): SchedulerTool[] {
	return [
		{
			name: "schedule_task",
			description: `Schedule a task to run at a specific time or interval.

Examples:
- One-time: { schedule: { kind: "at", at: "2026-03-01T09:00:00Z" }, payload: { kind: "agentTurn", message: "Check on the project" } }
- Interval: { schedule: { kind: "every", everyMs: 300000 }, payload: { kind: "agentTurn", message: "Status check" } }
- Cron: { schedule: { kind: "cron", expr: "0 9 * * 1-5" }, payload: { kind: "agentTurn", message: "Daily standup reminder" } }`,
			inputSchema: ScheduleTaskSchema,
			handler: async (args): Promise<CallToolResult> => {
				const parsed = ScheduleTaskSchema.safeParse(args)
				if (!parsed.success) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: false,
									error: parsed.error.message
								})
							}
						],
						isError: true
					}
				}

				try {
					const input: CronJobCreate = {
						id: parsed.data.id,
						agentId: parsed.data.agentId,
						sessionKey: parsed.data.sessionKey,
						name: parsed.data.name,
						description: parsed.data.description,
						enabled: parsed.data.enabled,
						deleteAfterRun: parsed.data.deleteAfterRun,
						schedule: parsed.data.schedule as CronSchedule,
						sessionTarget: parsed.data.sessionTarget as
							| SessionTarget
							| undefined,
						wakeMode: parsed.data.wakeMode as WakeMode | undefined,
						payload: parsed.data.payload as CronPayload,
						delivery: parsed.data.delivery
					}
					const job = await scheduler.add(input)
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: true,
									jobId: job.id,
									name: job.name,
									nextRunAtMs: job.state.nextRunAtMs
								})
							}
						]
					}
				} catch (err) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: false,
									error:
										err instanceof Error
											? err.message
											: "Failed to schedule task"
								})
							}
						],
						isError: true
					}
				}
			}
		},
		{
			name: "list_scheduled_tasks",
			description:
				"List all scheduled tasks with optional filtering and pagination",
			inputSchema: ListTasksSchema,
			handler: async (args): Promise<CallToolResult> => {
				const parsed = ListTasksSchema.safeParse(args)
				if (!parsed.success) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({ error: parsed.error.message })
							}
						],
						isError: true
					}
				}

				const result = await scheduler.listPage(parsed.data)
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								items: result.items.map(formatJob),
								total: result.total,
								offset: result.offset,
								limit: result.limit,
								hasMore: result.hasMore
							})
						}
					]
				}
			}
		},
		{
			name: "get_scheduled_task",
			description: "Get details of a specific scheduled task",
			inputSchema: GetTaskSchema,
			handler: async (args): Promise<CallToolResult> => {
				const parsed = GetTaskSchema.safeParse(args)
				if (!parsed.success) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({ error: parsed.error.message })
							}
						],
						isError: true
					}
				}

				const job = await scheduler.get(parsed.data.taskId)
				if (!job) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({ error: "Task not found" })
							}
						],
						isError: true
					}
				}
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(formatJob(job), null, 2)
						}
					]
				}
			}
		},
		{
			name: "cancel_scheduled_task",
			description: "Cancel and remove a scheduled task",
			inputSchema: CancelTaskSchema,
			handler: async (args): Promise<CallToolResult> => {
				const parsed = CancelTaskSchema.safeParse(args)
				if (!parsed.success) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: false,
									error: parsed.error.message
								})
							}
						],
						isError: true
					}
				}

				try {
					const result = await scheduler.remove(parsed.data.taskId)
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: true,
									removed: result.removed
								})
							}
						]
					}
				} catch (err) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: false,
									error:
										err instanceof Error ? err.message : "Failed to cancel task"
								})
							}
						],
						isError: true
					}
				}
			}
		},
		{
			name: "run_scheduled_task",
			description: "Manually trigger a scheduled task to run now",
			inputSchema: RunTaskSchema,
			handler: async (args): Promise<CallToolResult> => {
				const parsed = RunTaskSchema.safeParse(args)
				if (!parsed.success) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: false,
									error: parsed.error.message
								})
							}
						],
						isError: true
					}
				}

				try {
					const result = await scheduler.run(
						parsed.data.taskId,
						parsed.data.mode
					)
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result)
							}
						]
					}
				} catch (err) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: false,
									error:
										err instanceof Error ? err.message : "Failed to run task"
								})
							}
						],
						isError: true
					}
				}
			}
		}
	]
}

export type { SchedulerTool }
