import { parseExpression } from "cron-parser"

import type {
	ScheduleType,
	ScheduledTask,
	ScheduledTaskRun,
	TaskStatus
} from "@hybrd/types"

import { SqliteSchedulerStore } from "./store.js"

export {
	SqliteSchedulerStore,
	createSqliteStore
} from "./store.js"
export type { SqliteSchedulerStoreOptions } from "./store.js"
export type { ScheduleType, ScheduledTask, ScheduledTaskRun, TaskStatus }

export interface ScheduleInput {
	id?: string
	name: string
	scheduleType: ScheduleType
	scheduleValue: string
	prompt: string
	context?: Record<string, unknown>
}

export interface SchedulerConfig {
	store?: SqliteSchedulerStore
	pollIntervalMs?: number
	timezone?: string
}

export type TaskExecutor = (
	task: ScheduledTask<{ prompt: string; context?: Record<string, unknown> }>
) => Promise<string>

interface SchedulerState {
	running: boolean
	timerId?: ReturnType<typeof setTimeout> | null
	activeRuns: Map<string, ScheduledTaskRun>
}

export class AgentScheduler {
	private store?: SqliteSchedulerStore
	private executor?: TaskExecutor
	private state: SchedulerState = {
		running: false,
		timerId: null,
		activeRuns: new Map()
	}
	private pollIntervalMs: number
	private timezone: string

	constructor(config: SchedulerConfig = {}) {
		this.store = config.store
		this.pollIntervalMs = config.pollIntervalMs ?? 60_000
		this.timezone =
			config.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
	}

	setStore(store: SqliteSchedulerStore): void {
		this.store = store
	}

	setExecutor(executor: TaskExecutor): void {
		this.executor = executor
	}

	private computeNextRun(
		scheduleType: ScheduleType,
		scheduleValue: string
	): Date | null {
		const now = new Date()

		try {
			switch (scheduleType) {
				case "cron": {
					const interval = parseExpression(scheduleValue, { tz: this.timezone })
					return interval.next().toDate()
				}
				case "interval": {
					const ms = Number.parseInt(scheduleValue, 10)
					if (Number.isNaN(ms) || ms <= 0) return null
					return new Date(now.getTime() + ms)
				}
				case "once": {
					const scheduled = new Date(scheduleValue)
					return scheduled > now ? scheduled : null
				}
			}
		} catch {
			return null
		}
		return null
	}

	async schedule(
		input: ScheduleInput
	): Promise<
		ScheduledTask<{ prompt: string; context?: Record<string, unknown> }>
	> {
		const id =
			input.id ?? `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
		const nextRun = this.computeNextRun(input.scheduleType, input.scheduleValue)

		if (!nextRun) {
			throw new Error(
				`Invalid schedule: ${input.scheduleType} "${input.scheduleValue}"`
			)
		}

		const task: ScheduledTask<{
			prompt: string
			context?: Record<string, unknown>
		}> = {
			id,
			name: input.name,
			scheduleType: input.scheduleType,
			scheduleValue: input.scheduleValue,
			payload: { prompt: input.prompt, context: input.context },
			status: "active",
			nextRun,
			lastRun: null,
			createdAt: new Date(),
			runCount: 0,
			runContext: input.context
		}

		if (this.store) {
			await this.store.saveTask(task)
		}

		this.scheduleNextCheck()
		return task
	}

	async getTask(id: string): Promise<ScheduledTask | undefined> {
		if (this.store) {
			return this.store.getTask(id)
		}
		return undefined
	}

	async listTasks(): Promise<ScheduledTask[]> {
		if (this.store) {
			return this.store.getAllTasks()
		}
		return []
	}

	async deleteTask(id: string): Promise<void> {
		if (this.store) {
			await this.store.deleteTask(id)
		}
	}

	async pauseTask(id: string): Promise<void> {
		const task = await this.getTask(id)
		if (!task) return

		task.status = "paused"
		task.nextRun = null

		if (this.store) {
			await this.store.saveTask(task)
		}
	}

	async resumeTask(id: string): Promise<void> {
		const task = await this.getTask(id)
		if (!task || task.status !== "paused") return

		const nextRun = this.computeNextRun(task.scheduleType, task.scheduleValue)
		if (!nextRun) return

		task.status = "active"
		task.nextRun = nextRun

		if (this.store) {
			await this.store.saveTask(task)
		}
		this.scheduleNextCheck()
	}

	private async runTask(task: ScheduledTask): Promise<void> {
		if (!this.executor) {
			console.warn(`No executor set, skipping task ${task.id}`)
			return
		}

		const scheduledAt = task.nextRun
		if (!scheduledAt) return

		const run: ScheduledTaskRun = {
			taskId: task.id,
			scheduledAt,
			startedAt: new Date(),
			payload: task.payload
		}

		this.state.activeRuns.set(task.id, run)

		try {
			const result = await this.executor(
				task as ScheduledTask<{
					prompt: string
					context?: Record<string, unknown>
				}>
			)

			run.completedAt = new Date()
			run.result = result
			task.lastRun = run.startedAt
			task.lastResult = run.result
			task.runCount++

			if (task.scheduleType === "once") {
				task.status = "completed"
				task.nextRun = null
			} else {
				const nextRun = this.computeNextRun(
					task.scheduleType,
					task.scheduleValue
				)
				task.nextRun = nextRun
			}

			if (this.store) {
				await this.store.saveTask(task)
			}
		} catch (error) {
			run.completedAt = new Date()
			run.error = error instanceof Error ? error.message : String(error)
			task.lastError = run.error

			const nextRun = this.computeNextRun(task.scheduleType, task.scheduleValue)
			if (nextRun) {
				task.nextRun = nextRun
			} else {
				task.status = "failed"
				task.nextRun = null
			}

			if (this.store) {
				await this.store.saveTask(task)
			}
		} finally {
			this.state.activeRuns.delete(task.id)
		}
	}

	private async checkAndRunDueTasks(): Promise<void> {
		if (!this.store) return

		const now = new Date()
		const dueTasks = await this.store.getDueTasks(now)

		for (const task of dueTasks) {
			await this.runTask(task)
		}
	}

	private scheduleNextCheck(): void {
		if (!this.state.running) return

		if (this.state.timerId) {
			clearTimeout(this.state.timerId)
		}

		const delay = this.pollIntervalMs

		this.state.timerId = setTimeout(() => {
			this.checkAndRunDueTasks()
				.then(() => this.scheduleNextCheck())
				.catch((err) => {
					console.error("Scheduler check failed:", err)
					this.scheduleNextCheck()
				})
		}, delay)
	}

	start(): void {
		if (this.state.running) return
		this.state.running = true
		this.scheduleNextCheck()
	}

	stop(): void {
		this.state.running = false
		if (this.state.timerId) {
			clearTimeout(this.state.timerId)
			this.state.timerId = null
		}
	}

	isRunning(): boolean {
		return this.state.running
	}
}

export async function createAgentScheduler(
	config?: SchedulerConfig
): Promise<AgentScheduler> {
	const scheduler = new AgentScheduler(config)

	if (config?.store) {
		await config.store.init()
	}

	return scheduler
}
