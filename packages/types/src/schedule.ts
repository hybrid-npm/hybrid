export type ScheduleType = "cron" | "interval" | "once";

export type TaskStatus = "active" | "paused" | "completed" | "failed";

export interface ScheduledTask<
	TPayload = unknown,
	TRunContext = unknown
> {
	id: string;
	name: string;
	scheduleType: ScheduleType;
	scheduleValue: string;
	payload: TPayload;
	status: TaskStatus;
	nextRun: Date | null;
	lastRun: Date | null;
	lastResult?: string;
	lastError?: string;
	createdAt: Date;
	runCount: number;
	runContext?: TRunContext;
}

export interface ScheduledTaskRun<
	TPayload = unknown,
	TRunContext = unknown
> {
	taskId: string;
	scheduledAt: Date;
	startedAt: Date;
	completedAt?: Date;
	payload: TPayload;
	result?: string;
	error?: string;
	runContext?: TRunContext;
}

export interface ScheduleConfig {
	pollIntervalMs: number;
	maxConcurrentRuns?: number;
	timezone?: string;
}

export type TaskHandler<TPayload = unknown, TRunContext = unknown> = (
	task: ScheduledTask<TPayload, TRunContext>,
	run: ScheduledTaskRun<TPayload, TRunContext>
) => Promise<void>;

export interface SchedulerEvents {
	taskDue: (task: ScheduledTask) => void;
	taskStarted: (run: ScheduledTaskRun) => void;
	taskCompleted: (run: ScheduledTaskRun) => void;
	taskFailed: (run: ScheduledTaskRun) => void;
	taskScheduled: (task: ScheduledTask) => void;
	taskCancelled: (taskId: string) => void;
}

export interface CreateScheduledTaskInput<TPayload = unknown> {
	id?: string;
	name: string;
	scheduleType: ScheduleType;
	scheduleValue: string;
	payload: TPayload;
	runContext?: unknown;
}
