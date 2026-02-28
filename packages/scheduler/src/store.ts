import initSqlJs, { type Database } from "sql.js"

import type { ScheduleType, ScheduledTask, TaskStatus } from "@hybrd/types"

const SCHEMA = `
CREATE TABLE IF NOT EXISTS scheduled_tasks (
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
    run_count INTEGER NOT NULL DEFAULT 0,
    run_context TEXT
);
`

export interface SqliteSchedulerStoreOptions {
	dbPath?: string
	onSave?: (data: Uint8Array) => void | Promise<void>
	loadOnInit?: boolean
}

export class SqliteSchedulerStore {
	private db: Database | null = null
	private dbPath: string
	private onSave?: (data: Uint8Array) => void | Promise<void>
	private loadOnInit: boolean
	private initPromise: Promise<void> | null = null
	private dirty = false
	private saveTimer?: ReturnType<typeof setTimeout>

	constructor(options: SqliteSchedulerStoreOptions = {}) {
		this.dbPath = options.dbPath ?? ":memory:"
		this.onSave = options.onSave
		this.loadOnInit = options.loadOnInit ?? true
	}

	async init(): Promise<void> {
		if (this.initPromise) {
			return this.initPromise
		}

		this.initPromise = this._init()
		return this.initPromise
	}

	private async _init(): Promise<void> {
		const SQL = await initSqlJs()

		if (this.dbPath === ":memory:" || !this.loadOnInit) {
			this.db = new SQL.Database()
		} else {
			try {
				const response = await fetch(this.dbPath)
				const buffer = await response.arrayBuffer()
				this.db = new SQL.Database(new Uint8Array(buffer))
			} catch {
				this.db = new SQL.Database()
			}
		}

		this.db.run(SCHEMA)
		this.scheduleSave()
	}

	private scheduleSave(): void {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer)
		}

		this.saveTimer = setTimeout(() => {
			this.save()
		}, 1000)
	}

	async save(): Promise<void> {
		if (!this.db || !this.dirty) return

		const data = this.db.export()
		this.dirty = false

		if (this.onSave) {
			await this.onSave(data)
		}
	}

	async close(): Promise<void> {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer)
		}
		await this.save()
		this.db?.close()
		this.db = null
	}

	private rowToTask(row: unknown[]): ScheduledTask {
		return {
			id: String(row[0]),
			name: String(row[1]),
			scheduleType: row[2] as ScheduleType,
			scheduleValue: String(row[3]),
			payload: row[4] ? JSON.parse(String(row[4])) : undefined,
			status: (row[5] as TaskStatus) ?? "active",
			nextRun: row[6] ? new Date(String(row[6])) : null,
			lastRun: row[7] ? new Date(String(row[7])) : null,
			lastResult: row[8] ? String(row[8]) : undefined,
			lastError: row[9] ? String(row[9]) : undefined,
			createdAt: new Date(String(row[10])),
			runCount: Number(row[11]) ?? 0,
			runContext: row[12] ? JSON.parse(String(row[12])) : undefined
		}
	}

	private async getDb(): Promise<Database> {
		if (!this.db) {
			await this.init()
		}
		return this.db as Database
	}

	async getTask(id: string): Promise<ScheduledTask | undefined> {
		const db = await this.getDb()

		const result = db.exec(
			"SELECT id, name, schedule_type, schedule_value, payload, status, next_run, last_run, last_result, last_error, created_at, run_count, run_context FROM scheduled_tasks WHERE id = ?",
			[id]
		)

		const firstResult = result[0]
		if (!firstResult || firstResult.values.length === 0) {
			return undefined
		}

		return this.rowToTask(firstResult.values[0] as unknown[])
	}

	async getAllTasks(): Promise<ScheduledTask[]> {
		const db = await this.getDb()

		const result = db.exec(
			"SELECT id, name, schedule_type, schedule_value, payload, status, next_run, last_run, last_result, last_error, created_at, run_count, run_context FROM scheduled_tasks ORDER BY next_run"
		)

		const firstResult = result[0]
		if (!firstResult) {
			return []
		}

		return firstResult.values.map((row: unknown[]) => this.rowToTask(row))
	}

	async getActiveTasks(): Promise<ScheduledTask[]> {
		const db = await this.getDb()

		const result = db.exec(
			"SELECT id, name, schedule_type, schedule_value, payload, status, next_run, last_run, last_result, last_error, created_at, run_count, run_context FROM scheduled_tasks WHERE status = 'active' AND next_run IS NOT NULL ORDER BY next_run"
		)

		const firstResult = result[0]
		if (!firstResult) {
			return []
		}

		return firstResult.values.map((row: unknown[]) => this.rowToTask(row))
	}

	async getDueTasks(now: Date): Promise<ScheduledTask[]> {
		const db = await this.getDb()

		const result = db.exec(
			"SELECT id, name, schedule_type, schedule_value, payload, status, next_run, last_run, last_result, last_error, created_at, run_count, run_context FROM scheduled_tasks WHERE status = 'active' AND next_run IS NOT NULL AND next_run <= ? ORDER BY next_run",
			[now.toISOString()]
		)

		const firstResult = result[0]
		if (!firstResult) {
			return []
		}

		return firstResult.values.map((row: unknown[]) => this.rowToTask(row))
	}

	async saveTask(task: ScheduledTask): Promise<void> {
		const db = await this.getDb()

		db.run(
			`INSERT OR REPLACE INTO scheduled_tasks 
            (id, name, schedule_type, schedule_value, payload, status, next_run, last_run, last_result, last_error, created_at, run_count, run_context) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				task.id,
				task.name,
				task.scheduleType,
				task.scheduleValue,
				task.payload ? JSON.stringify(task.payload) : null,
				task.status,
				task.nextRun?.toISOString() ?? null,
				task.lastRun?.toISOString() ?? null,
				task.lastResult ?? null,
				task.lastError ?? null,
				task.createdAt.toISOString(),
				task.runCount,
				task.runContext ? JSON.stringify(task.runContext) : null
			]
		)

		this.dirty = true
		this.scheduleSave()
	}

	async deleteTask(id: string): Promise<void> {
		const db = await this.getDb()

		db.run("DELETE FROM scheduled_tasks WHERE id = ?", [id])
		this.dirty = true
		this.scheduleSave()
	}

	async updateTaskStatus(
		id: string,
		status: TaskStatus,
		nextRun: Date | null,
		lastRun?: Date,
		lastResult?: string,
		lastError?: string
	): Promise<void> {
		const db = await this.getDb()

		db.run(
			`UPDATE scheduled_tasks 
            SET status = ?, next_run = ?, last_run = ?, last_result = ?, last_error = ?, run_count = run_count + 1 
            WHERE id = ?`,
			[
				status,
				nextRun?.toISOString() ?? null,
				lastRun?.toISOString() ?? null,
				lastResult ?? null,
				lastError ?? null,
				id
			]
		)

		this.dirty = true
		this.scheduleSave()
	}
}

export async function createSqliteStore(
	options?: SqliteSchedulerStoreOptions
): Promise<SqliteSchedulerStore> {
	const store = new SqliteSchedulerStore(options)
	await store.init()
	return store
}
