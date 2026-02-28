import type { AgentScheduler, ScheduleType } from "@hybrd/scheduler"
import { z } from "zod"
import { createTool } from "../core/tool.js"

export interface SchedulerRuntimeExtension {
	scheduler: AgentScheduler
}

const scheduleTypeSchema = z.enum(["cron", "interval", "once"])

export const scheduleTaskTool = createTool({
	description:
		"Schedule a task to run at a specific time or interval. Use this to set reminders, follow-ups, or recurring tasks.",
	inputSchema: z.object({
		name: z.string().describe("A descriptive name for the scheduled task"),
		scheduleType: scheduleTypeSchema.describe(
			"Type of schedule: 'cron' for complex schedules, 'interval' for repeating tasks (in ms), 'once' for one-time tasks"
		),
		scheduleValue: z
			.string()
			.describe(
				"The schedule value: cron expression (e.g., '0 9 * * 1-5'), interval in milliseconds (e.g., '300000' for 5 min), or ISO timestamp for one-time (e.g., '2026-03-01T10:00:00Z')"
			),
		prompt: z
			.string()
			.describe(
				"The instruction to execute when the task runs. Be specific about what the agent should do."
			),
		context: z
			.record(z.unknown())
			.optional()
			.describe("Optional context data to pass to the task")
	}),
	outputSchema: z.object({
		success: z.boolean(),
		taskId: z.string().optional(),
		name: z.string(),
		scheduleType: scheduleTypeSchema,
		nextRun: z.string().optional(),
		error: z.string().optional()
	}),
	execute: async ({ input, runtime }) => {
		const scheduler = (runtime as unknown as SchedulerRuntimeExtension)
			.scheduler

		try {
			if (!scheduler) {
				return {
					success: false,
					name: input.name,
					scheduleType: input.scheduleType,
					error: "Scheduler not available"
				}
			}

			const task = await scheduler.schedule({
				name: input.name,
				scheduleType: input.scheduleType as ScheduleType,
				scheduleValue: input.scheduleValue,
				prompt: input.prompt,
				context: input.context
			})

			return {
				success: true,
				taskId: task.id,
				name: task.name,
				scheduleType: task.scheduleType as "cron" | "interval" | "once",
				nextRun: task.nextRun?.toISOString()
			}
		} catch (error) {
			return {
				success: false,
				name: input.name,
				scheduleType: input.scheduleType,
				error: error instanceof Error ? error.message : String(error)
			}
		}
	}
})

export const listScheduledTasksTool = createTool({
	description:
		"List all scheduled tasks. Use this to see what tasks are pending or to check on existing schedules.",
	inputSchema: z.object({
		status: z
			.enum(["active", "paused", "completed", "failed"])
			.optional()
			.describe("Filter by task status")
	}),
	outputSchema: z.object({
		success: z.boolean(),
		tasks: z.array(
			z.object({
				id: z.string(),
				name: z.string(),
				scheduleType: scheduleTypeSchema,
				scheduleValue: z.string(),
				status: z.string(),
				nextRun: z.string().optional(),
				lastRun: z.string().optional(),
				runCount: z.number(),
				lastError: z.string().optional()
			})
		),
		error: z.string().optional()
	}),
	execute: async ({ input, runtime }) => {
		const scheduler = (runtime as unknown as SchedulerRuntimeExtension)
			.scheduler

		try {
			if (!scheduler) {
				return {
					success: false,
					tasks: [],
					error: "Scheduler not available"
				}
			}

			const tasks = await scheduler.listTasks()

			const filteredTasks = input.status
				? tasks.filter((t) => t.status === input.status)
				: tasks

			return {
				success: true,
				tasks: filteredTasks.map((t) => ({
					id: t.id,
					name: t.name,
					scheduleType: t.scheduleType as "cron" | "interval" | "once",
					scheduleValue: t.scheduleValue,
					status: t.status,
					nextRun: t.nextRun?.toISOString(),
					lastRun: t.lastRun?.toISOString(),
					runCount: t.runCount,
					lastError: t.lastError
				}))
			}
		} catch (error) {
			return {
				success: false,
				tasks: [],
				error: error instanceof Error ? error.message : String(error)
			}
		}
	}
})

export const cancelScheduledTaskTool = createTool({
	description:
		"Cancel or delete a scheduled task. Use this to remove tasks that are no longer needed.",
	inputSchema: z.object({
		taskId: z.string().describe("The ID of the task to cancel")
	}),
	outputSchema: z.object({
		success: z.boolean(),
		taskId: z.string(),
		error: z.string().optional()
	}),
	execute: async ({ input, runtime }) => {
		const scheduler = (runtime as unknown as SchedulerRuntimeExtension)
			.scheduler

		try {
			if (!scheduler) {
				return {
					success: false,
					taskId: input.taskId,
					error: "Scheduler not available"
				}
			}

			await scheduler.deleteTask(input.taskId)

			return {
				success: true,
				taskId: input.taskId
			}
		} catch (error) {
			return {
				success: false,
				taskId: input.taskId,
				error: error instanceof Error ? error.message : String(error)
			}
		}
	}
})

export const pauseScheduledTaskTool = createTool({
	description: "Pause a scheduled task. The task will not run until resumed.",
	inputSchema: z.object({
		taskId: z.string().describe("The ID of the task to pause")
	}),
	outputSchema: z.object({
		success: z.boolean(),
		taskId: z.string(),
		error: z.string().optional()
	}),
	execute: async ({ input, runtime }) => {
		const scheduler = (runtime as unknown as SchedulerRuntimeExtension)
			.scheduler

		try {
			if (!scheduler) {
				return {
					success: false,
					taskId: input.taskId,
					error: "Scheduler not available"
				}
			}

			await scheduler.pauseTask(input.taskId)

			return {
				success: true,
				taskId: input.taskId
			}
		} catch (error) {
			return {
				success: false,
				taskId: input.taskId,
				error: error instanceof Error ? error.message : String(error)
			}
		}
	}
})

export const resumeScheduledTaskTool = createTool({
	description: "Resume a paused scheduled task.",
	inputSchema: z.object({
		taskId: z.string().describe("The ID of the task to resume")
	}),
	outputSchema: z.object({
		success: z.boolean(),
		taskId: z.string(),
		nextRun: z.string().optional(),
		error: z.string().optional()
	}),
	execute: async ({ input, runtime }) => {
		const scheduler = (runtime as unknown as SchedulerRuntimeExtension)
			.scheduler

		try {
			if (!scheduler) {
				return {
					success: false,
					taskId: input.taskId,
					error: "Scheduler not available"
				}
			}

			await scheduler.resumeTask(input.taskId)
			const task = await scheduler.getTask(input.taskId)

			return {
				success: true,
				taskId: input.taskId,
				nextRun: task?.nextRun?.toISOString()
			}
		} catch (error) {
			return {
				success: false,
				taskId: input.taskId,
				error: error instanceof Error ? error.message : String(error)
			}
		}
	}
})

export const schedulerTools = {
	scheduleTask: scheduleTaskTool,
	listScheduledTasks: listScheduledTasksTool,
	cancelScheduledTask: cancelScheduledTaskTool,
	pauseScheduledTask: pauseScheduledTaskTool,
	resumeScheduledTask: resumeScheduledTaskTool
}
