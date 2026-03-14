export type CronSchedule =
	| { kind: "at"; at: string }
	| { kind: "every"; everyMs: number; anchorMs?: number }
	| { kind: "cron"; expr: string; tz?: string; staggerMs?: number }

export type CronRunStatus = "ok" | "error" | "skipped"
export type CronDeliveryStatus =
	| "delivered"
	| "not-delivered"
	| "unknown"
	| "not-requested"

export interface CronJobState {
	nextRunAtMs?: number
	runningAtMs?: number
	lastRunAtMs?: number
	lastRunStatus?: CronRunStatus
	lastError?: string
	lastDurationMs?: number
	consecutiveErrors?: number
	scheduleErrorCount?: number
	lastDeliveryStatus?: CronDeliveryStatus
	lastDeliveryError?: string
}

export type SessionTarget = "main" | "isolated"
export type WakeMode = "now" | "next-heartbeat"

export type CronPayload =
	| { kind: "systemEvent"; text: string }
	| {
			kind: "agentTurn"
			message: string
			model?: string
			thinking?: string
			timeoutSeconds?: number
			allowUnsafeExternalContent?: boolean
	  }

export interface CronJob {
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
	sessionTarget: SessionTarget
	wakeMode: WakeMode
	payload: CronPayload
	delivery?: {
		mode: "none" | "announce"
		channel?: string
		to?: string
		accountId?: string
		bestEffort?: boolean
	}
	state: CronJobState
}

export interface CronJobCreate {
	id?: string
	agentId?: string
	sessionKey?: string
	name: string
	description?: string
	enabled?: boolean
	deleteAfterRun?: boolean
	schedule: CronSchedule
	sessionTarget?: SessionTarget
	wakeMode?: WakeMode
	payload: CronPayload
	delivery?: CronJob["delivery"]
	state?: Partial<CronJobState>
}

export interface CronJobPatch {
	name?: string
	description?: string
	enabled?: boolean
	deleteAfterRun?: boolean
	schedule?: CronSchedule
	sessionTarget?: SessionTarget
	wakeMode?: WakeMode
	payload?: CronPayload
	delivery?: CronJob["delivery"]
}

export interface CronRun {
	taskId: string
	scheduledAtMs: number
	startedAtMs: number
	completedAtMs?: number
	status?: CronRunStatus
	result?: string
	error?: string
	delivered?: boolean
}

export interface SchedulerConfig {
	pollIntervalMs?: number
	maxConcurrentRuns?: number
	timezone?: string
}

export interface SchedulerStatus {
	enabled: boolean
	storePath?: string
	jobs: number
	nextWakeAtMs: number | null
}

export interface ListPageOptions {
	includeDisabled?: boolean
	limit?: number
	offset?: number
	query?: string
	enabled?: "all" | "enabled" | "disabled"
	sortBy?: "nextRunAtMs" | "updatedAtMs" | "name"
	sortDir?: "asc" | "desc"
}

export interface PaginatedResult<T> {
	items: T[]
	total: number
	offset: number
	limit: number
	hasMore: boolean
	nextOffset: number | null
}

export type SchedulerEvent =
	| { jobId: string; action: "added"; nextRunAtMs?: number }
	| { jobId: string; action: "updated"; nextRunAtMs?: number }
	| { jobId: string; action: "removed" }
	| { jobId: string; action: "started"; runAtMs: number }
	| {
			jobId: string
			action: "finished"
			status: CronRunStatus
			error?: string
			delivered?: boolean
			runAtMs: number
			durationMs?: number
			nextRunAtMs?: number
	  }

export type {
	ChannelId,
	CronDeliveryMode,
	CronDelivery,
	TriggerRequest,
	TriggerResponse,
	ChannelAdapter,
	ChannelDispatcher
} from "./channel.js"
