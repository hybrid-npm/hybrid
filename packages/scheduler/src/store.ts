import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import initSqlJs from "sql.js"

import type {
	CronJob,
	CronJobState,
	CronPayload,
	CronSchedule,
	SessionTarget,
	WakeMode
} from "@hybrd/types"

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cron_jobs (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    session_key TEXT,
    name TEXT NOT NULL,
    description TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    delete_after_run INTEGER,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    schedule TEXT NOT NULL,
    session_target TEXT NOT NULL DEFAULT 'isolated',
    wake_mode TEXT NOT NULL DEFAULT 'now',
    payload TEXT NOT NULL,
    delivery TEXT,
    state TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run ON cron_jobs(id);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_enabled ON cron_jobs(enabled);
`

export interface SqliteSchedulerStoreOptions {
	dbPath?: string
	onSave?: (data: Uint8Array) => void | Promise<void>
	loadOnInit?: boolean
}

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>
type SqlJsDatabase = InstanceType<SqlJsStatic["Database"]>

export class SqliteSchedulerStore {
	private db: SqlJsDatabase | null = null
	private dbPath: string
	private onSave?: (data: Uint8Array) => void | Promise<void>
	private loadOnInit: boolean
	private initPromise: Promise<void> | null = null
	private dirty = false
	private saveTimer?: ReturnType<typeof setTimeout>
	private jobsCache: Map<string, CronJob> | null = null

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
		let SQL: SqlJsStatic
		try {
			const req = createRequire(process.cwd())
			const sqlJsPath = dirname(req.resolve("sql.js"))
			const wasmPath = join(sqlJsPath, "sql-wasm.wasm")
			const wasmBinary = readFileSync(wasmPath)
			SQL = await initSqlJs({ wasmBinary } as any)
		} catch {
			SQL = await initSqlJs()
		}

		if (this.dbPath === ":memory:" || !this.loadOnInit) {
			this.db = new SQL.Database()
		} else {
			try {
				const buffer = readFileSync(this.dbPath)
				this.db = new SQL.Database(new Uint8Array(buffer))
			} catch {
				this.db = new SQL.Database()
			}
		}

		this.db.run(SCHEMA)
		this.loadCache()
		this.scheduleSave()
	}

	private loadCache(): void {
		if (!this.db) return
		const cache = new Map<string, CronJob>()

		const result = this.db.exec(
			"SELECT id, agent_id, session_key, name, description, enabled, delete_after_run, created_at_ms, updated_at_ms, schedule, session_target, wake_mode, payload, delivery, state FROM cron_jobs"
		)

		const firstResult = result[0]
		if (firstResult) {
			for (const row of firstResult.values) {
				const job = this.rowToJob(row as unknown[])
				if (job) {
					cache.set(job.id, job)
				}
			}
		}

		this.jobsCache = cache
	}

	private scheduleSave(): void {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer)
		}

		this.saveTimer = setTimeout(() => {
			void this.save()
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
		this.jobsCache = null
	}

	private rowToJob(row: unknown[]): CronJob | null {
		try {
			const schedule = JSON.parse(String(row[9])) as CronSchedule
			const payload = JSON.parse(String(row[12])) as CronPayload
			const delivery = row[13] ? JSON.parse(String(row[13])) : undefined
			const state = JSON.parse(String(row[14])) as CronJobState

			return {
				id: String(row[0]),
				agentId: row[1] ? String(row[1]) : undefined,
				sessionKey: row[2] ? String(row[2]) : undefined,
				name: String(row[3]),
				description: row[4] ? String(row[4]) : undefined,
				enabled: Boolean(row[5]),
				deleteAfterRun: row[6] ? Boolean(row[6]) : undefined,
				createdAtMs: Number(row[7]),
				updatedAtMs: Number(row[8]),
				schedule,
				sessionTarget: (row[10] as SessionTarget) ?? "isolated",
				wakeMode: (row[11] as WakeMode) ?? "now",
				payload,
				delivery,
				state
			}
		} catch {
			return null
		}
	}

	private jobToRow(job: CronJob): unknown[] {
		return [
			job.id,
			job.agentId ?? null,
			job.sessionKey ?? null,
			job.name,
			job.description ?? null,
			job.enabled ? 1 : 0,
			job.deleteAfterRun ? 1 : null,
			job.createdAtMs,
			job.updatedAtMs,
			JSON.stringify(job.schedule),
			job.sessionTarget,
			job.wakeMode,
			JSON.stringify(job.payload),
			job.delivery ? JSON.stringify(job.delivery) : null,
			JSON.stringify(job.state)
		]
	}

	private ensureDb(): SqlJsDatabase {
		if (!this.db) {
			throw new Error("Store not initialized. Call init() first.")
		}
		return this.db
	}

	private ensureCache(): Map<string, CronJob> {
		if (!this.jobsCache) {
			throw new Error("Cache not initialized. Call init() first.")
		}
		return this.jobsCache
	}

	getJobSync(id: string): CronJob | undefined {
		const cache = this.ensureCache()
		return cache.get(id)
	}

	getAllJobsSync(): CronJob[] {
		const cache = this.ensureCache()
		return Array.from(cache.values())
	}

	saveJobSync(job: CronJob): void {
		const db = this.ensureDb()
		const cache = this.ensureCache()

		db.run(
			`INSERT OR REPLACE INTO cron_jobs 
            (id, agent_id, session_key, name, description, enabled, delete_after_run, created_at_ms, updated_at_ms, schedule, session_target, wake_mode, payload, delivery, state) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			this.jobToRow(job)
		)

		cache.set(job.id, job)
		this.dirty = true
		this.scheduleSave()
	}

	saveAllJobsSync(): void {
		const db = this.ensureDb()
		const cache = this.ensureCache()

		for (const job of cache.values()) {
			db.run(
				`INSERT OR REPLACE INTO cron_jobs 
                (id, agent_id, session_key, name, description, enabled, delete_after_run, created_at_ms, updated_at_ms, schedule, session_target, wake_mode, payload, delivery, state) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				this.jobToRow(job)
			)
		}

		this.dirty = true
		this.scheduleSave()
	}

	deleteJobSync(id: string): void {
		const db = this.ensureDb()
		const cache = this.ensureCache()

		db.run("DELETE FROM cron_jobs WHERE id = ?", [id])
		cache.delete(id)
		this.dirty = true
		this.scheduleSave()
	}

	async getTask(id: string): Promise<CronJob | undefined> {
		return this.getJobSync(id)
	}

	async getAllTasks(): Promise<CronJob[]> {
		return this.getAllJobsSync()
	}

	async saveTask(task: CronJob): Promise<void> {
		this.saveJobSync(task)
	}

	async deleteTask(id: string): Promise<void> {
		this.deleteJobSync(id)
	}
}

export async function createSqliteStore(
	options?: SqliteSchedulerStoreOptions
): Promise<SqliteSchedulerStore> {
	const resolvedOptions = { ...options }

	// If a real dbPath is provided but no onSave callback, add a default
	// file-write callback so that changes are actually persisted to disk.
	if (
		resolvedOptions.dbPath &&
		resolvedOptions.dbPath !== ":memory:" &&
		!resolvedOptions.onSave
	) {
		const { writeFileSync } = await import("node:fs")
		const { dirname } = await import("node:path")
		const { mkdirSync, existsSync } = await import("node:fs")
		const dbPath = resolvedOptions.dbPath

		// Ensure the parent directory exists
		const dir = dirname(dbPath)
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true })
		}

		resolvedOptions.onSave = (data: Uint8Array) => {
			writeFileSync(dbPath, data)
		}
	}

	const store = new SqliteSchedulerStore(resolvedOptions)
	await store.init()
	return store
}
