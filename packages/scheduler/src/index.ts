import { randomUUID } from "node:crypto"
import cronParser from "cron-parser"
const { parseExpression } = cronParser

import type {
	ChannelDispatcher,
	CronJob,
	CronJobCreate,
	CronJobPatch,
	CronRunStatus,
	CronSchedule,
	ListPageOptions,
	PaginatedResult,
	SchedulerConfig,
	SchedulerEvent,
	SchedulerStatus,
	TriggerResponse
} from "@hybrd/types"

import { SqliteSchedulerStore } from "./store.js"

export { SqliteSchedulerStore, createSqliteStore } from "./store.js"
export type { SqliteSchedulerStoreOptions } from "./store.js"

export { createSchedulerTools } from "./tools.js"
export type { SchedulerTool } from "./tools.js"

const MAX_TIMER_DELAY_MS = 60_000
const MIN_REFIRE_GAP_MS = 2_000
const STUCK_RUN_MS = 2 * 60 * 60 * 1000
const MAX_SCHEDULE_ERRORS = 3

const ERROR_BACKOFF_SCHEDULE_MS = [
	30_000,
	60_000,
	5 * 60_000,
	15 * 60_000,
	60 * 60_000
]

function errorBackoffMs(consecutiveErrors: number): number {
	const idx = Math.min(
		consecutiveErrors - 1,
		ERROR_BACKOFF_SCHEDULE_MS.length - 1
	)
	return ERROR_BACKOFF_SCHEDULE_MS[Math.max(0, idx)] ?? 60_000
}

export interface ExecutorResult {
	status: CronRunStatus
	error?: string
	summary?: string
	outputText?: string
	delivered?: boolean
}

export interface SchedulerExecutor {
	runAgentTurn(job: CronJob): Promise<ExecutorResult>
	runSystemEvent(job: CronJob): Promise<ExecutorResult>
}

export interface SchedulerServiceConfig extends SchedulerConfig {
	store: SqliteSchedulerStore
	dispatcher: ChannelDispatcher
	executor: SchedulerExecutor
	enabled?: boolean
}

interface SchedulerState {
	running: boolean
	timer: ReturnType<typeof setTimeout> | null
	op: Promise<unknown>
}

export class SchedulerService {
	private store: SqliteSchedulerStore
	private dispatcher: ChannelDispatcher
	private executor: SchedulerExecutor
	private state: SchedulerState
	private timezone: string
	private enabled: boolean
	private eventCallback?: (event: SchedulerEvent) => void

	constructor(config: SchedulerServiceConfig) {
		this.store = config.store
		this.dispatcher = config.dispatcher
		this.executor = config.executor
		this.timezone =
			config.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
		this.enabled = config.enabled ?? true
		this.state = {
			running: false,
			timer: null,
			op: Promise.resolve()
		}
	}

	onEvent(callback: (event: SchedulerEvent) => void): void {
		this.eventCallback = callback
	}

	private emit(event: SchedulerEvent): void {
		this.eventCallback?.(event)
	}

	private locked<T>(fn: () => Promise<T>): Promise<T> {
		// Chain onto the previous operation. We use .then() with a no-op
		// rejection handler so that a failure in a prior operation doesn't
		// prevent subsequent operations from running. Each fn's own errors
		// propagate to its caller via the returned promise.
		const next = this.state.op.then(fn, () => fn())
		// Keep the chain alive even if fn rejects — the next queued
		// operation should still run after this one settles.
		this.state.op = next.catch(() => {})
		return next
	}

	private computeNextRunAtMs(
		schedule: CronSchedule,
		nowMs: number
	): number | undefined {
		try {
			switch (schedule.kind) {
				case "at": {
					const atMs = new Date(schedule.at).getTime()
					if (Number.isNaN(atMs)) return undefined
					return atMs > nowMs ? atMs : undefined
				}
				case "every": {
					const everyMs = Math.max(1, Math.floor(schedule.everyMs))
					const anchorMs = schedule.anchorMs ?? nowMs
					const elapsed = Math.max(0, nowMs - anchorMs)
					const steps = Math.max(
						1,
						Math.floor((elapsed + everyMs - 1) / everyMs)
					)
					return anchorMs + steps * everyMs
				}
				case "cron": {
					const interval = parseExpression(schedule.expr, {
						tz: schedule.tz ?? this.timezone
					})
					const next = interval.next()
					return next ? next.getTime() : undefined
				}
			}
		} catch {
			return undefined
		}
	}

	private computeJobNextRunAtMs(
		job: CronJob,
		nowMs: number
	): number | undefined {
		if (!job.enabled) return undefined

		if (job.schedule.kind === "every") {
			const lastRunAtMs = job.state.lastRunAtMs
			if (typeof lastRunAtMs === "number" && Number.isFinite(lastRunAtMs)) {
				const nextFromLastRun = Math.floor(lastRunAtMs) + job.schedule.everyMs
				if (nextFromLastRun > nowMs) {
					return nextFromLastRun
				}
			}
		}

		if (job.schedule.kind === "at") {
			if (job.state.lastRunStatus === "ok") {
				return undefined
			}
		}

		return this.computeNextRunAtMs(job.schedule, nowMs)
	}

	private isRunnableJob(job: CronJob, nowMs: number): boolean {
		if (!job.enabled) return false

		if (typeof job.state.runningAtMs === "number") {
			if (nowMs - job.state.runningAtMs > STUCK_RUN_MS) {
				return true
			}
			return false
		}

		const next = job.state.nextRunAtMs
		return typeof next === "number" && nowMs >= next
	}

	private findDueJobs(nowMs: number): CronJob[] {
		const jobs = this.store.getAllJobsSync()
		return jobs.filter((job) => this.isRunnableJob(job, nowMs))
	}

	private nextWakeAtMs(): number | undefined {
		const jobs = this.store.getAllJobsSync()
		let min: number | undefined

		for (const job of jobs) {
			if (!job.enabled) continue
			if (job.state.runningAtMs !== undefined) continue
			const next = job.state.nextRunAtMs
			if (typeof next !== "number") continue
			if (min === undefined || next < min) {
				min = next
			}
		}

		return min
	}

	private armTimer(): void {
		this.stopTimer()

		if (!this.enabled) return

		const nextAt = this.nextWakeAtMs()
		if (!nextAt) return

		const now = Date.now()
		const delay = Math.max(0, nextAt - now)
		const clampedDelay = Math.min(delay, MAX_TIMER_DELAY_MS)

		this.state.timer = setTimeout(() => {
			void this.onTimer()
		}, clampedDelay)
	}

	private stopTimer(): void {
		if (this.state.timer) {
			clearTimeout(this.state.timer)
			this.state.timer = null
		}
	}

	private async onTimer(): Promise<void> {
		if (this.state.running) {
			return
		}

		this.state.running = true
		this.stopTimer()

		try {
			const dueJobs = await this.locked(async () => {
				const now = Date.now()
				const due = this.findDueJobs(now)

				if (due.length === 0) {
					this.recomputeNextRunsForMaintenance()
					return []
				}

				for (const job of due) {
					job.state.runningAtMs = now
					job.state.lastError = undefined
				}
				this.store.saveAllJobsSync()

				return due
			})

			for (const job of dueJobs) {
				await this.executeJob(job)
			}
		} finally {
			this.state.running = false
			this.armTimer()
		}
	}

	private recomputeNextRunsForMaintenance(): boolean {
		const jobs = this.store.getAllJobsSync()
		const now = Date.now()
		let changed = false

		for (const job of jobs) {
			if (!job.enabled) {
				if (job.state.nextRunAtMs !== undefined) {
					job.state.nextRunAtMs = undefined
					changed = true
				}
				if (job.state.runningAtMs !== undefined) {
					job.state.runningAtMs = undefined
					changed = true
				}
				continue
			}

			const runningAt = job.state.runningAtMs
			if (typeof runningAt === "number" && now - runningAt > STUCK_RUN_MS) {
				job.state.runningAtMs = undefined
				changed = true
			}

			if (job.state.nextRunAtMs === undefined) {
				job.state.nextRunAtMs = this.computeJobNextRunAtMs(job, now)
				changed = true
			}
		}

		if (changed) {
			this.store.saveAllJobsSync()
		}

		return changed
	}

	private applyJobResult(
		job: CronJob,
		result: {
			status: CronRunStatus
			error?: string
			delivered?: boolean
			startedAt: number
			endedAt: number
		}
	): boolean {
		job.state.runningAtMs = undefined
		job.state.lastRunAtMs = result.startedAt
		job.state.lastRunStatus = result.status
		job.state.lastDurationMs = result.endedAt - result.startedAt
		job.state.lastError = result.error

		if (result.status === "error") {
			job.state.consecutiveErrors = (job.state.consecutiveErrors ?? 0) + 1
		} else {
			job.state.consecutiveErrors = 0
		}

		const shouldDelete =
			job.schedule.kind === "at" &&
			job.deleteAfterRun === true &&
			result.status === "ok"

		if (!shouldDelete) {
			if (job.schedule.kind === "at") {
				job.enabled = false
				job.state.nextRunAtMs = undefined
			} else if (result.status === "error" && job.enabled) {
				const backoff = errorBackoffMs(job.state.consecutiveErrors ?? 1)
				const normalNext = this.computeJobNextRunAtMs(job, result.endedAt)
				const backoffNext = result.endedAt + backoff
				job.state.nextRunAtMs = normalNext
					? Math.max(normalNext, backoffNext)
					: backoffNext
			} else if (job.enabled) {
				const naturalNext = this.computeJobNextRunAtMs(job, result.endedAt)
				if (job.schedule.kind === "cron") {
					const minNext = result.endedAt + MIN_REFIRE_GAP_MS
					job.state.nextRunAtMs = naturalNext
						? Math.max(naturalNext, minNext)
						: minNext
				} else {
					job.state.nextRunAtMs = naturalNext
				}
			}
		}

		return shouldDelete
	}

	private async executeJob(job: CronJob): Promise<void> {
		const startedAt = Date.now()
		this.emit({ jobId: job.id, action: "started", runAtMs: startedAt })

		let result: ExecutorResult
		try {
			if (job.sessionTarget === "main") {
				result = await this.executor.runSystemEvent(job)
			} else {
				result = await this.executor.runAgentTurn(job)
			}
		} catch (err) {
			result = {
				status: "error",
				error: err instanceof Error ? err.message : String(err)
			}
		}

		const endedAt = Date.now()

		if (
			job.delivery?.mode === "announce" &&
			result.summary &&
			job.delivery.channel &&
			job.delivery.to
		) {
			const deliveryResult: TriggerResponse = await this.dispatcher.dispatch({
				channel: job.delivery.channel,
				to: job.delivery.to,
				message: result.summary
			})
			result.delivered = deliveryResult.delivered
		}

		await this.locked(async () => {
			const currentJob = this.store.getJobSync(job.id)
			if (!currentJob) return

			const shouldDelete = this.applyJobResult(currentJob, {
				status: result.status,
				error: result.error,
				delivered: result.delivered,
				startedAt,
				endedAt
			})

			this.emit({
				jobId: currentJob.id,
				action: "finished",
				status: result.status,
				error: result.error,
				delivered: result.delivered,
				runAtMs: startedAt,
				durationMs: currentJob.state.lastDurationMs,
				nextRunAtMs: currentJob.state.nextRunAtMs
			})

			if (shouldDelete) {
				this.store.deleteJobSync(currentJob.id)
				this.emit({ jobId: currentJob.id, action: "removed" })
			} else {
				this.store.saveJobSync(currentJob)
			}
		})
	}

	async start(): Promise<void> {
		if (!this.enabled) {
			console.log("[scheduler] disabled")
			return
		}

		await this.locked(async () => {
			const jobs = this.store.getAllJobsSync()
			for (const job of jobs) {
				if (typeof job.state.runningAtMs === "number") {
					job.state.runningAtMs = undefined
				}
			}
			this.store.saveAllJobsSync()

			this.recomputeNextRunsForMaintenance()
		})

		this.armTimer()
		console.log("[scheduler] started")
	}

	stop(): void {
		this.stopTimer()
		this.state.running = false
	}

	async status(): Promise<SchedulerStatus> {
		return this.locked(async () => {
			const jobs = this.store.getAllJobsSync()
			return {
				enabled: this.enabled,
				jobs: jobs.length,
				nextWakeAtMs: this.nextWakeAtMs() ?? null
			}
		})
	}

	async add(input: CronJobCreate): Promise<CronJob> {
		return this.locked(async () => {
			const now = Date.now()
			const id = input.id ?? randomUUID()

			const job: CronJob = {
				id,
				agentId: input.agentId,
				sessionKey: input.sessionKey,
				name: input.name,
				description: input.description,
				enabled: input.enabled ?? true,
				deleteAfterRun: input.deleteAfterRun,
				createdAtMs: now,
				updatedAtMs: now,
				schedule: input.schedule,
				sessionTarget: input.sessionTarget ?? "isolated",
				wakeMode: input.wakeMode ?? "now",
				payload: input.payload,
				delivery: input.delivery,
				state: {
					...input.state,
					nextRunAtMs: undefined
				}
			}

			job.state.nextRunAtMs = this.computeJobNextRunAtMs(job, now)

			this.store.saveJobSync(job)
			this.armTimer()

			this.emit({
				jobId: job.id,
				action: "added",
				nextRunAtMs: job.state.nextRunAtMs
			})

			return job
		})
	}

	async get(id: string): Promise<CronJob | undefined> {
		return this.store.getJobSync(id)
	}

	async list(opts?: { includeDisabled?: boolean }): Promise<CronJob[]> {
		const jobs = this.store.getAllJobsSync()
		const includeDisabled = opts?.includeDisabled === true
		const filtered = jobs.filter((j) => includeDisabled || j.enabled)
		return filtered.sort(
			(a, b) => (a.state.nextRunAtMs ?? 0) - (b.state.nextRunAtMs ?? 0)
		)
	}

	async listPage(opts?: ListPageOptions): Promise<PaginatedResult<CronJob>> {
		const jobs = this.store.getAllJobsSync()

		const includeDisabled =
			opts?.enabled === "all" || opts?.enabled === "disabled"
		const includeEnabled = opts?.enabled !== "disabled"
		const query = opts?.query?.trim().toLowerCase() ?? ""

		const filtered = jobs.filter((job) => {
			if (!includeDisabled && !job.enabled) return false
			if (!includeEnabled && job.enabled) return false
			if (query) {
				const haystack = [job.name, job.description ?? ""]
					.join(" ")
					.toLowerCase()
				return haystack.includes(query)
			}
			return true
		})

		const sortBy = opts?.sortBy ?? "nextRunAtMs"
		const sortDir = opts?.sortDir ?? "asc"
		const dir = sortDir === "desc" ? -1 : 1

		filtered.sort((a, b) => {
			let cmp = 0
			if (sortBy === "name") {
				cmp = a.name.localeCompare(b.name)
			} else if (sortBy === "updatedAtMs") {
				cmp = a.updatedAtMs - b.updatedAtMs
			} else {
				const aNext = a.state.nextRunAtMs
				const bNext = b.state.nextRunAtMs
				if (typeof aNext === "number" && typeof bNext === "number") {
					cmp = aNext - bNext
				} else if (typeof aNext === "number") {
					cmp = -1
				} else if (typeof bNext === "number") {
					cmp = 1
				}
			}
			return cmp * dir
		})

		const total = filtered.length
		const offset = Math.max(0, Math.min(total, opts?.offset ?? 0))
		const limit = Math.max(1, Math.min(200, opts?.limit ?? 50))
		const items = filtered.slice(offset, offset + limit)
		const nextOffset = offset + items.length

		return {
			items,
			total,
			offset,
			limit,
			hasMore: nextOffset < total,
			nextOffset: nextOffset < total ? nextOffset : null
		}
	}

	async update(id: string, patch: CronJobPatch): Promise<CronJob> {
		return this.locked(async () => {
			const job = this.store.getJobSync(id)
			if (!job) {
				throw new Error(`Job not found: ${id}`)
			}

			if (patch.name !== undefined) job.name = patch.name
			if (patch.description !== undefined) job.description = patch.description
			if (patch.enabled !== undefined) job.enabled = patch.enabled
			if (patch.deleteAfterRun !== undefined)
				job.deleteAfterRun = patch.deleteAfterRun
			if (patch.schedule !== undefined) job.schedule = patch.schedule
			if (patch.sessionTarget !== undefined)
				job.sessionTarget = patch.sessionTarget
			if (patch.wakeMode !== undefined) job.wakeMode = patch.wakeMode
			if (patch.payload !== undefined) job.payload = patch.payload
			if (patch.delivery !== undefined) job.delivery = patch.delivery

			job.updatedAtMs = Date.now()

			if (job.enabled) {
				job.state.nextRunAtMs = this.computeJobNextRunAtMs(job, job.updatedAtMs)
			} else {
				job.state.nextRunAtMs = undefined
				job.state.runningAtMs = undefined
			}

			this.store.saveJobSync(job)
			this.armTimer()

			this.emit({
				jobId: job.id,
				action: "updated",
				nextRunAtMs: job.state.nextRunAtMs
			})

			return job
		})
	}

	async remove(id: string): Promise<{ ok: boolean; removed: boolean }> {
		return this.locked(async () => {
			const existed = this.store.getJobSync(id) !== undefined
			if (existed) {
				this.store.deleteJobSync(id)
				this.armTimer()
				this.emit({ jobId: id, action: "removed" })
			}
			return { ok: true, removed: existed }
		})
	}

	async run(
		id: string,
		mode?: "due" | "force"
	): Promise<{ ok: boolean; ran: boolean; reason?: string }> {
		const job = this.store.getJobSync(id)
		if (!job) {
			return { ok: false, ran: false }
		}

		if (typeof job.state.runningAtMs === "number") {
			return { ok: true, ran: false, reason: "already-running" }
		}

		const now = Date.now()
		const due =
			mode === "force" ||
			(job.enabled &&
				typeof job.state.nextRunAtMs === "number" &&
				now >= job.state.nextRunAtMs)
		if (!due) {
			return { ok: true, ran: false, reason: "not-due" }
		}

		await this.executeJob(job)
		return { ok: true, ran: true }
	}
}

export async function createSchedulerService(
	config: SchedulerServiceConfig
): Promise<SchedulerService> {
	await config.store.init()
	return new SchedulerService(config)
}
