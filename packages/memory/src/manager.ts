import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import Database from "better-sqlite3"
import {
	buildFileEntry,
	chunkMarkdown,
	ensureDir,
	listMemoryFiles
} from "./internal.js"
import { createEmbeddingProvider } from "./providers/index.js"
import type { EmbeddingProvider } from "./providers/types.js"
import type { DatabaseSync } from "./schema.js"
import { ensureMemoryIndexSchema } from "./schema.js"
import { mergeHybridResults, searchKeyword, searchVector } from "./search.js"
import {
	type MemoryProviderStatus,
	type MemorySearchManager,
	type MemorySearchResult,
	type MemorySource,
	type MemorySyncProgressUpdate,
	type ResolvedMemoryConfig
} from "./types.js"

const SNIPPET_MAX_CHARS = 700
const VECTOR_TABLE = "chunks_vec"
const FTS_TABLE = "chunks_fts"
const EMBEDDING_CACHE_TABLE = "embedding_cache"
const BATCH_FAILURE_LIMIT = 2

const INDEX_CACHE = new Map<string, MemoryIndexManager>()
const INDEX_CACHE_PENDING = new Map<string, Promise<MemoryIndexManager>>()

export class MemoryIndexManager implements MemorySearchManager {
	private readonly cacheKey: string
	private readonly agentId: string
	private readonly workspaceDir: string
	private readonly settings: ResolvedMemoryConfig
	private readonly userId?: string
	private readonly conversationId?: string
	private provider: EmbeddingProvider | null
	private readonly requestedProvider: string
	private readonly ftsEnabled: boolean
	private db: DatabaseSync
	private readonly sources: Set<MemorySource>
	private readonly cache: { enabled: boolean; maxEntries?: number }
	private readonly vector: {
		enabled: boolean
		available: boolean | null
		dims?: number
	}
	private ftsAvailable = false
	private closed = false
	private dirty = false

	static async get(options: {
		agentId: string
		workspaceDir: string
		config: ResolvedMemoryConfig
		userId?: string
		conversationId?: string
	}): Promise<MemoryIndexManager | null> {
		if (!options.config.enabled) {
			return null
		}

		const key = `${options.agentId}:${options.workspaceDir}:${options.userId || "global"}:${options.conversationId || "global"}:${JSON.stringify(options.config)}`

		const existing = INDEX_CACHE.get(key)
		if (existing) {
			return existing
		}

		const pending = INDEX_CACHE_PENDING.get(key)
		if (pending) {
			return pending
		}

		const createPromise = (async () => {
			const providerResult = await createEmbeddingProvider({
				provider: options.config.provider,
				remote: options.config.remote,
				model: options.config.model,
				fallback: options.config.fallback,
				local: options.config.local
			})

			const manager = new MemoryIndexManager({
				...options,
				providerResult
			})

			INDEX_CACHE.set(key, manager)
			return manager
		})()

		INDEX_CACHE_PENDING.set(key, createPromise)

		try {
			return await createPromise
		} finally {
			if (INDEX_CACHE_PENDING.get(key) === createPromise) {
				INDEX_CACHE_PENDING.delete(key)
			}
		}
	}

	private constructor(options: {
		agentId: string
		workspaceDir: string
		config: ResolvedMemoryConfig
		userId?: string
		conversationId?: string
		providerResult: Awaited<ReturnType<typeof createEmbeddingProvider>>
	}) {
		this.cacheKey = ""
		this.agentId = options.agentId
		this.workspaceDir = options.workspaceDir
		this.settings = options.config
		this.userId = options.userId
		this.conversationId = options.conversationId
		this.provider = options.providerResult.provider
		this.requestedProvider = options.providerResult.requestedProvider
		this.sources = new Set(options.config.sources)
		// FTS is always enabled for full-text search
		this.ftsEnabled = true
		this.cache = {
			enabled: options.config.cache.enabled,
			maxEntries: options.config.cache.maxEntries
		}
		this.vector = {
			enabled: options.config.store.vector.enabled,
			available: null
		}

		this.db = this.openDatabase()
		this.ensureSchema()
	}

	private openDatabase(): DatabaseSync {
		const stateDir = path.join(os.homedir(), ".hybrid", "memory")
		ensureDir(stateDir)
		const dbPath = path.join(stateDir, `${this.agentId}.sqlite`)
		return new Database(dbPath) as unknown as DatabaseSync
	}

	private ensureSchema() {
		const result = ensureMemoryIndexSchema({
			db: this.db,
			embeddingCacheTable: EMBEDDING_CACHE_TABLE,
			ftsTable: FTS_TABLE,
			ftsEnabled: this.ftsEnabled
		})
		this.ftsAvailable = result.ftsAvailable
	}

	async search(
		query: string,
		opts?: {
			maxResults?: number
			minScore?: number
			scope?:
				| { type: "global" }
				| { type: "user"; userId: string }
				| { type: "conversation"; userId: string; conversationId: string }
		}
	): Promise<MemorySearchResult[]> {
		if (this.closed) {
			return []
		}

		const cleaned = query.trim()
		if (!cleaned) {
			return []
		}

		const minScore = opts?.minScore ?? this.settings.query.minScore
		const maxResults = opts?.maxResults ?? this.settings.query.maxResults
		const hybrid = this.settings.query.hybrid
		const scope = opts?.scope

		if (!this.provider) {
			if (!this.ftsEnabled || !this.ftsAvailable) {
				return []
			}

			const keywordResults = await searchKeyword({
				db: this.db,
				ftsTable: FTS_TABLE,
				providerModel: undefined,
				query: cleaned,
				limit: maxResults,
				snippetMaxChars: SNIPPET_MAX_CHARS,
				scope: scope as any,
				sources: Array.from(this.sources)
			})

			return keywordResults
				.filter((r) => r.score >= minScore)
				.map((r) => ({
					path: r.path,
					startLine: r.startLine,
					endLine: r.endLine,
					score: r.score,
					snippet: r.snippet,
					source: r.source as MemorySource,
					scope: r.scope
				}))
		}

		const keywordResults = hybrid.enabled
			? await searchKeyword({
					db: this.db,
					ftsTable: FTS_TABLE,
					providerModel: this.provider.model,
					query: cleaned,
					limit: Math.min(200, maxResults * 4),
					snippetMaxChars: SNIPPET_MAX_CHARS,
					scope: scope as any,
					sources: Array.from(this.sources)
				})
			: []

		let queryVec: number[] = []
		try {
			queryVec = await this.provider.embedQuery(cleaned)
		} catch {
			// Embedding failed, fall back to keyword-only
		}

		const vectorResults =
			queryVec.length > 0
				? await searchVector({
						db: this.db,
						vectorTable: VECTOR_TABLE,
						providerModel: this.provider.model,
						queryVec,
						limit: Math.min(200, maxResults * 4),
						snippetMaxChars: SNIPPET_MAX_CHARS,
						ensureVectorReady: async (dimensions) => {
							if (!this.vector.enabled) return false
							return true
						},
						scope: scope as any,
						sources: Array.from(this.sources)
					})
				: []

		if (!hybrid.enabled) {
			return vectorResults
				.filter((r) => r.score >= minScore)
				.slice(0, maxResults)
				.map((r) => ({
					...r,
					source: r.source as MemorySource
				}))
		}

		const merged = await mergeHybridResults({
			vector: vectorResults.map((r) => ({
				id: r.id,
				path: r.path,
				startLine: r.startLine,
				endLine: r.endLine,
				source: r.source,
				snippet: r.snippet,
				vectorScore: r.score,
				scope: r.scope
			})),
			keyword: keywordResults.map((r) => ({
				id: r.id,
				path: r.path,
				startLine: r.startLine,
				endLine: r.endLine,
				source: r.source,
				snippet: r.snippet,
				textScore: r.textScore,
				scope: r.scope
			})),
			vectorWeight: hybrid.vectorWeight,
			textWeight: hybrid.textWeight
		})

		return merged.filter((r) => r.score >= minScore).slice(0, maxResults)
	}

	async readFile(params: {
		relPath: string
		from?: number
		lines?: number
	}): Promise<{ text: string; path: string }> {
		const rawPath = params.relPath.trim()
		if (!rawPath) {
			throw new Error("path required")
		}

		const absPath = path.isAbsolute(rawPath)
			? path.resolve(rawPath)
			: path.resolve(this.workspaceDir, rawPath)

		const statResult = await fs.stat(absPath).catch(() => null)
		if (!statResult) {
			return { text: "", path: params.relPath }
		}

		const content = await fs.readFile(absPath, "utf-8")

		if (!params.from && !params.lines) {
			return { text: content, path: params.relPath }
		}

		const lines = content.split("\n")
		const start = Math.max(1, params.from ?? 1)
		const count = Math.max(1, params.lines ?? lines.length)
		const slice = lines.slice(start - 1, start - 1 + count)

		return { text: slice.join("\n"), path: params.relPath }
	}

	status(): MemoryProviderStatus {
		const sources = Array.from(this.sources)
		const sourceFilter =
			sources.length > 0
				? {
						sql: ` AND source IN (${sources.map(() => "?").join(",")})`,
						params: sources
					}
				: { sql: "", params: [] as string[] }

		const files = this.db
			.prepare(`SELECT COUNT(*) as c FROM files WHERE 1=1${sourceFilter.sql}`)
			.get(...sourceFilter.params) as { c: number }

		const chunks = this.db
			.prepare(`SELECT COUNT(*) as c FROM chunks WHERE 1=1${sourceFilter.sql}`)
			.get(...sourceFilter.params) as { c: number }

		return {
			backend: "builtin",
			provider: this.provider?.id || "none",
			model: this.provider?.model,
			requestedProvider: this.requestedProvider,
			files: files?.c ?? 0,
			chunks: chunks?.c ?? 0,
			dirty: this.dirty,
			workspaceDir: this.workspaceDir,
			sources,
			fts: {
				enabled: this.ftsEnabled,
				available: this.ftsAvailable
			},
			vector: {
				enabled: this.vector.enabled,
				available: this.vector.available ?? undefined,
				dims: this.vector.dims
			},
			cache: {
				enabled: this.cache.enabled,
				maxEntries: this.cache.maxEntries
			},
			batch: {
				enabled: false,
				failures: 0,
				limit: BATCH_FAILURE_LIMIT,
				wait: true,
				concurrency: 2,
				pollIntervalMs: 2000,
				timeoutMs: 60000
			}
		}
	}

	async sync(params?: {
		reason?: string
		force?: boolean
		progress?: (update: MemorySyncProgressUpdate) => void
	}): Promise<void> {
		if (this.closed) {
			return
		}

		const needsFullReindex = params?.force || this.dirty

		// Always sync files even without a provider (for FTS)
		if (needsFullReindex || this.sources.has("memory")) {
			await this.syncMemoryFiles(params?.progress)
		}

		this.dirty = false
	}

	private async syncMemoryFiles(
		_progress?: (update: MemorySyncProgressUpdate) => void
	): Promise<void> {
		const files = await listMemoryFiles(
			this.workspaceDir,
			this.settings.extraPaths,
			this.userId,
			this.conversationId
		)

		const fileEntries = await Promise.all(
			files.map((file) =>
				buildFileEntry(
					file,
					this.workspaceDir,
					this.userId,
					this.conversationId
				)
			)
		)

		const validEntries = fileEntries.filter(
			(e): e is NonNullable<typeof e> => e !== null
		)

		for (const entry of validEntries) {
			const record = this.db
				.prepare(
					`SELECT hash FROM files WHERE path = ? AND source = ? AND user_id IS ? AND conversation_id IS ?`
				)
				.get(
					entry.path,
					"memory",
					entry.userId || null,
					entry.conversationId || null
				) as { hash: string } | undefined

			if (record?.hash === entry.hash) {
				continue
			}

			await this.indexFile(entry)
		}

		this.dirty = false
	}

	private async indexFile(entry: {
		path: string
		absPath: string
		hash: string
		userId?: string
		conversationId?: string
	}): Promise<void> {
		const content = await fs.readFile(entry.absPath, "utf-8")
		const chunks = chunkMarkdown(content, {
			tokens: this.settings.chunking.tokens,
			overlap: this.settings.chunking.overlap
		})

		const now = Date.now()

		this.db.exec("BEGIN TRANSACTION")

		try {
			this.db
				.prepare(
					`INSERT OR REPLACE INTO files (path, source, hash, mtime, size, user_id, conversation_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
				)
				.run(
					entry.path,
					"memory",
					entry.hash,
					Date.now(),
					content.length,
					entry.userId || null,
					entry.conversationId || null
				)

			for (const chunk of chunks) {
				const chunkId = `${entry.path}:${chunk.startLine}-${chunk.endLine}`

				let embedding: number[] = []
				if (this.provider) {
					try {
						embedding = await this.provider.embedQuery(chunk.text)
					} catch {
						embedding = []
					}
				}

				this.db
					.prepare(
						`INSERT OR REPLACE INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at, user_id, conversation_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
					)
					.run(
						chunkId,
						entry.path,
						"memory",
						chunk.startLine,
						chunk.endLine,
						chunk.hash,
						this.provider?.model || "fts-only",
						chunk.text,
						JSON.stringify(embedding),
						now,
						entry.userId || null,
						entry.conversationId || null
					)

				// Also insert into FTS table for full-text search
				if (this.ftsAvailable) {
					this.db
						.prepare(
							`INSERT OR REPLACE INTO ${FTS_TABLE} (text, id, path, source, model, start_line, end_line, user_id, conversation_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
						)
						.run(
							chunk.text,
							chunkId,
							entry.path,
							"memory",
							this.provider?.model || "fts-only",
							chunk.startLine,
							chunk.endLine,
							entry.userId || null,
							entry.conversationId || null
						)
				}
			}

			this.db.exec("COMMIT")
		} catch (err) {
			this.db.exec("ROLLBACK")
			throw err
		}
	}

	probeEmbeddingAvailability(): Promise<{
		ok: boolean
		error?: string
	}> {
		if (!this.provider) {
			return Promise.resolve({
				ok: false,
				error: "No embedding provider available (FTS-only mode)"
			})
		}

		try {
			const result = this.provider.embedQuery("test")
			return result
				.then(() => ({ ok: true }))
				.catch((err) => ({
					ok: false,
					error: err instanceof Error ? err.message : String(err)
				}))
		} catch (err) {
			return Promise.resolve({
				ok: false,
				error: err instanceof Error ? err.message : String(err)
			})
		}
	}

	probeVectorAvailability(): Promise<boolean> {
		if (!this.provider || !this.vector.enabled) {
			return Promise.resolve(false)
		}
		return Promise.resolve(this.vector.available ?? false)
	}

	close(): Promise<void> {
		if (this.closed) {
			return Promise.resolve()
		}
		this.closed = true
		try {
			this.db.close()
		} catch {}
		INDEX_CACHE.delete(this.cacheKey)
		return Promise.resolve()
	}
}
