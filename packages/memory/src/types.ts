export type MemorySource = "memory" | "sessions" | "user" | "conversation"

export type MemoryScope =
	| { type: "global" }
	| { type: "user"; userId: string }
	| { type: "conversation"; userId: string; conversationId: string }

export interface MemorySearchResult {
	path: string
	startLine: number
	endLine: number
	score: number
	snippet: string
	source: MemorySource
	citation?: string
	scope?: MemoryScope
}

export interface MemoryEmbeddingProbeResult {
	ok: boolean
	error?: string
}

export interface MemorySyncProgressUpdate {
	completed: number
	total: number
	label?: string
}

export interface MemoryProviderStatus {
	backend: "builtin" | "qmd"
	provider: string
	model?: string
	requestedProvider?: string
	files?: number
	chunks?: number
	dirty?: boolean
	workspaceDir?: string
	dbPath?: string
	extraPaths?: string[]
	sources?: MemorySource[]
	sourceCounts?: Array<{ source: MemorySource; files: number; chunks: number }>
	cache?: { enabled: boolean; entries?: number; maxEntries?: number }
	fts?: { enabled: boolean; available: boolean; error?: string }
	fallback?: { from: string; reason?: string }
	vector?: {
		enabled: boolean
		available?: boolean
		extensionPath?: string
		loadError?: string
		dims?: number
	}
	batch?: {
		enabled: boolean
		failures: number
		limit: number
		wait: boolean
		concurrency: number
		pollIntervalMs: number
		timeoutMs: number
		lastError?: string
		lastProvider?: string
	}
	custom?: Record<string, unknown>
}

export interface MemorySearchManager {
	search(
		query: string,
		opts?: {
			maxResults?: number
			minScore?: number
			scope?: MemoryScope
			sessionKey?: string
		}
	): Promise<MemorySearchResult[]>
	readFile(params: {
		relPath: string
		from?: number
		lines?: number
		scope?: MemoryScope
	}): Promise<{ text: string; path: string }>
	status(): MemoryProviderStatus
	sync?(params?: {
		reason?: string
		force?: boolean
		scope?: MemoryScope
		progress?: (update: MemorySyncProgressUpdate) => void
	}): Promise<void>
	probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult>
	probeVectorAvailability(): Promise<boolean>
	close?(): Promise<void>
}

export interface ResolvedMemoryConfig {
	enabled: boolean
	sources: Array<MemorySource>
	extraPaths: string[]
	provider: "openai" | "local" | "gemini" | "voyage" | "mistral" | "auto"
	remote?: {
		baseUrl?: string
		apiKey?: string
		headers?: Record<string, string>
		batch?: {
			enabled: boolean
			wait: boolean
			concurrency: number
			pollIntervalMs: number
			timeoutMinutes: number
		}
	}
	fallback: "openai" | "gemini" | "local" | "voyage" | "mistral" | "none"
	model: string
	local: {
		modelPath?: string
		modelCacheDir?: string
	}
	store: {
		driver: "sqlite"
		path: string
		vector: {
			enabled: boolean
			extensionPath?: string
		}
	}
	chunking: {
		tokens: number
		overlap: number
	}
	sync: {
		onSessionStart: boolean
		onSearch: boolean
		watch: boolean
		watchDebounceMs: number
		intervalMinutes: number
		sessions: {
			deltaBytes: number
			deltaMessages: number
		}
	}
	query: {
		maxResults: number
		minScore: number
		hybrid: {
			enabled: boolean
			vectorWeight: number
			textWeight: number
			candidateMultiplier: number
			mmr: {
				enabled: boolean
				lambda: number
			}
			temporalDecay: {
				enabled: boolean
				halfLifeDays: number
			}
		}
	}
	cache: {
		enabled: boolean
		maxEntries?: number
	}
}

export interface MemoryIndexManagerOptions {
	agentId: string
	workspaceDir: string
	config: ResolvedMemoryConfig
	userId?: string
	conversationId?: string
}

export type { EmbeddingProvider } from "./providers/types.js"
