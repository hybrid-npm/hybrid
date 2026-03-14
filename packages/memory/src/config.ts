import os from "node:os"
import path from "node:path"
import type { MemorySource, ResolvedMemoryConfig } from "./types.js"

const DEFAULT_CHUNK_TOKENS = 400
const DEFAULT_CHUNK_OVERLAP = 80
const DEFAULT_WATCH_DEBOUNCE_MS = 1500
const DEFAULT_MAX_RESULTS = 6
const DEFAULT_MIN_SCORE = 0.35
const DEFAULT_HYBRID_ENABLED = true
const DEFAULT_HYBRID_VECTOR_WEIGHT = 0.7
const DEFAULT_HYBRID_TEXT_WEIGHT = 0.3
const DEFAULT_CACHE_ENABLED = true

export type MemoryConfigInput = {
	enabled?: boolean
	sources?: Array<"memory" | "sessions">
	extraPaths?: string[]
	provider?: "openai" | "local" | "gemini" | "voyage" | "mistral" | "auto"
	remote?: {
		baseUrl?: string
		apiKey?: string
		headers?: Record<string, string>
		batch?: {
			enabled?: boolean
			wait?: boolean
			concurrency?: number
			pollIntervalMs?: number
			timeoutMinutes?: number
		}
	}
	fallback?: "openai" | "gemini" | "local" | "voyage" | "mistral" | "none"
	model?: string
	local?: {
		modelPath?: string
		modelCacheDir?: string
	}
	store?: {
		path?: string
		vector?: {
			enabled?: boolean
			extensionPath?: string
		}
	}
	chunking?: {
		tokens?: number
		overlap?: number
	}
	sync?: {
		onSessionStart?: boolean
		onSearch?: boolean
		watch?: boolean
		watchDebounceMs?: number
		intervalMinutes?: number
		sessions?: {
			deltaBytes?: number
			deltaMessages?: number
		}
	}
	query?: {
		maxResults?: number
		minScore?: number
		hybrid?: {
			enabled?: boolean
			vectorWeight?: number
			textWeight?: number
			candidateMultiplier?: number
			mmr?: {
				enabled?: boolean
				lambda?: number
			}
			temporalDecay?: {
				enabled?: boolean
				halfLifeDays?: number
			}
		}
	}
	cache?: {
		enabled?: boolean
		maxEntries?: number
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}

function resolveStorePath(agentId: string, raw?: string): string {
	const stateDir = path.join(os.homedir(), ".hybrid", "memory")
	const fallback = path.join(stateDir, `${agentId}.sqlite`)

	if (!raw) {
		return fallback
	}

	const withToken = raw.includes("{agentId}")
		? raw.replaceAll("{agentId}", agentId)
		: raw

	return withToken.startsWith("~")
		? path.join(os.homedir(), withToken.slice(1))
		: path.isAbsolute(withToken)
			? withToken
			: path.resolve(withToken)
}

export function resolveMemoryConfig(
	input: MemoryConfigInput,
	agentId: string
): ResolvedMemoryConfig {
	const enabled = input.enabled ?? true
	const provider = input.provider ?? "auto"
	const fallback = input.fallback ?? "none"
	const modelDefault =
		provider === "gemini"
			? "gemini-embedding-001"
			: provider === "openai"
				? "text-embedding-3-small"
				: provider === "voyage"
					? "voyage-4-large"
					: provider === "mistral"
						? "mistral-embed"
						: undefined
	const model = input.model ?? modelDefault ?? "text-embedding-3-small"

	const sources: Array<MemorySource> = input.sources?.length
		? (input.sources as Array<MemorySource>)
		: ["memory"]

	const remote = input.remote
		? {
				baseUrl: input.remote.baseUrl,
				apiKey: input.remote.apiKey,
				headers: input.remote.headers,
				batch: {
					enabled: input.remote.batch?.enabled ?? false,
					wait: input.remote.batch?.wait ?? true,
					concurrency: Math.max(1, input.remote.batch?.concurrency ?? 2),
					pollIntervalMs: input.remote.batch?.pollIntervalMs ?? 2000,
					timeoutMinutes: input.remote.batch?.timeoutMinutes ?? 60
				}
			}
		: undefined

	const local = input.local ?? {}

	const store = {
		driver: "sqlite" as const,
		path: resolveStorePath(agentId, input.store?.path),
		vector: {
			enabled: input.store?.vector?.enabled ?? true,
			extensionPath: input.store?.vector?.extensionPath
		}
	}

	const chunking = {
		tokens: input.chunking?.tokens ?? DEFAULT_CHUNK_TOKENS,
		overlap: clamp(
			input.chunking?.overlap ?? DEFAULT_CHUNK_OVERLAP,
			0,
			(input.chunking?.tokens ?? DEFAULT_CHUNK_TOKENS) - 1
		)
	}

	const sync = {
		onSessionStart: input.sync?.onSessionStart ?? true,
		onSearch: input.sync?.onSearch ?? true,
		watch: input.sync?.watch ?? true,
		watchDebounceMs: input.sync?.watchDebounceMs ?? DEFAULT_WATCH_DEBOUNCE_MS,
		intervalMinutes: input.sync?.intervalMinutes ?? 0,
		sessions: {
			deltaBytes: input.sync?.sessions?.deltaBytes ?? 100_000,
			deltaMessages: input.sync?.sessions?.deltaMessages ?? 50
		}
	}

	const query = {
		maxResults: input.query?.maxResults ?? DEFAULT_MAX_RESULTS,
		minScore: clamp(input.query?.minScore ?? DEFAULT_MIN_SCORE, 0, 1),
		hybrid: {
			enabled: input.query?.hybrid?.enabled ?? DEFAULT_HYBRID_ENABLED,
			vectorWeight: clamp(
				input.query?.hybrid?.vectorWeight ?? DEFAULT_HYBRID_VECTOR_WEIGHT,
				0,
				1
			),
			textWeight: clamp(
				input.query?.hybrid?.textWeight ?? DEFAULT_HYBRID_TEXT_WEIGHT,
				0,
				1
			),
			candidateMultiplier: clamp(
				input.query?.hybrid?.candidateMultiplier ?? 4,
				1,
				20
			),
			mmr: {
				enabled: input.query?.hybrid?.mmr?.enabled ?? false,
				lambda: clamp(input.query?.hybrid?.mmr?.lambda ?? 0.7, 0, 1)
			},
			temporalDecay: {
				enabled: input.query?.hybrid?.temporalDecay?.enabled ?? false,
				halfLifeDays: Math.max(
					1,
					input.query?.hybrid?.temporalDecay?.halfLifeDays ?? 30
				)
			}
		}
	}

	const vectorWeight = query.hybrid.vectorWeight
	const textWeight = query.hybrid.textWeight
	const sum = vectorWeight + textWeight
	if (sum > 0) {
		query.hybrid.vectorWeight = vectorWeight / sum
		query.hybrid.textWeight = textWeight / sum
	} else {
		query.hybrid.vectorWeight = DEFAULT_HYBRID_VECTOR_WEIGHT
		query.hybrid.textWeight = DEFAULT_HYBRID_TEXT_WEIGHT
	}

	const cache = {
		enabled: input.cache?.enabled ?? DEFAULT_CACHE_ENABLED,
		maxEntries:
			typeof input.cache?.maxEntries === "number" && input.cache.maxEntries > 0
				? input.cache.maxEntries
				: undefined
	}

	return {
		enabled,
		sources,
		extraPaths: input.extraPaths ?? [],
		provider,
		remote,
		fallback,
		model,
		local,
		store,
		chunking,
		sync,
		query,
		cache
	}
}

export function getDefaultMemoryConfig(): ResolvedMemoryConfig {
	return resolveMemoryConfig({}, "default")
}
