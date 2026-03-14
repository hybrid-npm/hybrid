import { parseEmbedding } from "./internal.js"
import type { DatabaseSync } from "./schema.js"
import type { MemoryScope, MemorySearchResult, MemorySource } from "./types.js"

const SNIPPET_MAX_CHARS = 700
const VECTOR_TABLE = "chunks_vec"
const FTS_TABLE = "chunks_fts"

export type SearchSource = string

export type SearchRowResult = {
	id: string
	path: string
	startLine: number
	endLine: number
	score: number
	snippet: string
	source: SearchSource
	scope?: MemoryScope
}

function truncateText(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text
	}
	return text.slice(0, maxChars - 3) + "..."
}

function buildScopeFilter(scope?: MemoryScope): {
	sql: string
	params: (string | null)[]
} {
	if (!scope) {
		return { sql: "", params: [] }
	}

	if (scope.type === "global") {
		return {
			sql: " AND user_id = '' AND conversation_id = ''",
			params: []
		}
	}

	if (scope.type === "user") {
		return {
			sql: " AND user_id = ? AND conversation_id = ''",
			params: [scope.userId]
		}
	}

	if (scope.type === "conversation") {
		return {
			sql: " AND user_id = ? AND conversation_id = ?",
			params: [scope.userId, scope.conversationId]
		}
	}

	return { sql: "", params: [] }
}

export async function searchVector(params: {
	db: DatabaseSync
	vectorTable: string
	providerModel: string
	queryVec: number[]
	limit: number
	snippetMaxChars?: number
	ensureVectorReady: (dimensions: number) => Promise<boolean>
	scope?: MemoryScope
	sources?: MemorySource[]
}): Promise<SearchRowResult[]> {
	const maxChars = params.snippetMaxChars || SNIPPET_MAX_CHARS

	if (params.queryVec.length === 0 || params.limit <= 0) {
		return []
	}

	const scopeFilter = buildScopeFilter(params.scope)
	const sourceFilter = buildSourceFilter(params.sources)
	const combinedParams = [...scopeFilter.params, ...sourceFilter.params]

	if (await params.ensureVectorReady(params.queryVec.length)) {
		const rows = params.db
			.prepare(
				`SELECT c.id, c.path, c.start_line, c.end_line, c.text,
                c.source, c.user_id, c.conversation_id,
                vec_distance_cosine(v.embedding, ?) AS dist
           FROM ${params.vectorTable} v
           JOIN chunks c ON c.id = v.id
          WHERE c.model = ?${scopeFilter.sql}${sourceFilter.sql}
          ORDER BY dist ASC
          LIMIT ?`
			)
			.all(
				Buffer.from(new Float32Array(params.queryVec).buffer),
				params.providerModel,
				...combinedParams,
				params.limit
			) as Array<{
			id: string
			path: string
			start_line: number
			end_line: number
			text: string
			source: SearchSource
			user_id: string | null
			conversation_id: string | null
			dist: number
		}>

		return rows.map((row) => ({
			id: row.id,
			path: row.path,
			startLine: row.start_line,
			endLine: row.end_line,
			score: 1 - row.dist,
			snippet: truncateText(row.text, maxChars),
			source: row.source,
			scope: buildScope(
				row.user_id || undefined,
				row.conversation_id || undefined
			)
		}))
	}

	return []
}

export function listChunks(params: {
	db: DatabaseSync
	providerModel: string
	scope?: MemoryScope
	sources?: MemorySource[]
}): Array<{
	id: string
	path: string
	startLine: number
	endLine: number
	text: string
	embedding: number[]
	source: SearchSource
}> {
	const scopeFilter = buildScopeFilter(params.scope)
	const sourceFilter = buildSourceFilter(params.sources)
	const combinedParams = [...scopeFilter.params, ...sourceFilter.params]

	const rows = params.db
		.prepare(
			`SELECT id, path, start_line, end_line, text, embedding, source
         FROM chunks
        WHERE model = ?${scopeFilter.sql}${sourceFilter.sql}`
		)
		.all(params.providerModel, ...combinedParams) as Array<{
		id: string
		path: string
		start_line: number
		end_line: number
		text: string
		embedding: string
		source: SearchSource
	}>

	return rows.map((row) => ({
		id: row.id,
		path: row.path,
		startLine: row.start_line,
		endLine: row.end_line,
		text: row.text,
		embedding: parseEmbedding(row.embedding),
		source: row.source
	}))
}

export async function searchKeyword(params: {
	db: DatabaseSync
	ftsTable: string
	providerModel: string | undefined
	query: string
	limit: number
	snippetMaxChars?: number
	scope?: MemoryScope
	sources?: MemorySource[]
}): Promise<Array<SearchRowResult & { textScore: number }>> {
	const maxChars = params.snippetMaxChars || SNIPPET_MAX_CHARS

	if (params.limit <= 0) {
		return []
	}

	const scopeFilter = buildScopeFilter(params.scope)
	const sourceFilter = buildSourceFilter(params.sources)
	const combinedParams = [...scopeFilter.params, ...sourceFilter.params]

	const ftsQuery = buildFtsQuery(params.query)
	if (!ftsQuery) {
		return []
	}

	const modelClause = params.providerModel ? " AND model = ?" : ""
	const modelParams = params.providerModel ? [params.providerModel] : []

	const rows = params.db
		.prepare(
			`SELECT id, path, source, start_line, end_line, text, user_id, conversation_id,
              bm25(${params.ftsTable}) AS rank
         FROM ${params.ftsTable}
        WHERE ${params.ftsTable} MATCH ?${modelClause}${scopeFilter.sql}${sourceFilter.sql}
        ORDER BY rank ASC
        LIMIT ?`
		)
		.all(ftsQuery, ...modelParams, ...combinedParams, params.limit) as Array<{
		id: string
		path: string
		source: SearchSource
		start_line: number
		end_line: number
		text: string
		user_id: string | null
		conversation_id: string | null
		rank: number
	}>

	return rows.map((row) => {
		const textScore = bm25RankToScore(row.rank)
		return {
			id: row.id,
			path: row.path,
			startLine: row.start_line,
			endLine: row.end_line,
			score: textScore,
			textScore,
			snippet: truncateText(row.text, maxChars),
			source: row.source,
			scope: buildScope(
				row.user_id || undefined,
				row.conversation_id || undefined
			)
		}
	})
}

function buildFtsQuery(raw: string): string | null {
	const tokens =
		raw
			.match(/[\p{L}\p{N}_]+/gu)
			?.map((t) => t.trim())
			.filter(Boolean) ?? []
	if (tokens.length === 0) {
		return null
	}
	const quoted = tokens.map((t) => `"${t.replaceAll('"', "")}"`)
	return quoted.join(" AND ")
}

function bm25RankToScore(rank: number): number {
	const normalized = Number.isFinite(rank) ? Math.max(0, rank) : 999
	return 1 / (1 + normalized)
}

function buildSourceFilter(sources?: MemorySource[]): {
	sql: string
	params: string[]
} {
	if (!sources || sources.length === 0) {
		return { sql: "", params: [] }
	}
	const placeholders = sources.map(() => "?").join(", ")
	return { sql: ` AND source IN (${placeholders})`, params: sources }
}

function buildScope(
	userId?: string,
	conversationId?: string
): MemoryScope | undefined {
	if (!userId && !conversationId) {
		return { type: "global" }
	}
	if (userId && !conversationId) {
		return { type: "user", userId }
	}
	if (userId && conversationId) {
		return { type: "conversation", userId, conversationId }
	}
	return undefined
}

export type HybridVectorResult = {
	id: string
	path: string
	startLine: number
	endLine: number
	source: string
	snippet: string
	vectorScore: number
	scope?: MemoryScope
}

export type HybridKeywordResult = {
	id: string
	path: string
	startLine: number
	endLine: number
	source: string
	snippet: string
	textScore: number
	scope?: MemoryScope
}

export async function mergeHybridResults(params: {
	vector: HybridVectorResult[]
	keyword: HybridKeywordResult[]
	vectorWeight: number
	textWeight: number
}): Promise<MemorySearchResult[]> {
	const byId = new Map<
		string,
		{
			id: string
			path: string
			startLine: number
			endLine: number
			source: string
			snippet: string
			vectorScore: number
			textScore: number
			scope?: MemoryScope
		}
	>()

	for (const r of params.vector) {
		byId.set(r.id, {
			id: r.id,
			path: r.path,
			startLine: r.startLine,
			endLine: r.endLine,
			source: r.source,
			snippet: r.snippet,
			vectorScore: r.vectorScore,
			textScore: 0,
			scope: r.scope
		})
	}

	for (const r of params.keyword) {
		const existing = byId.get(r.id)
		if (existing) {
			existing.textScore = r.textScore
			if (r.snippet && r.snippet.length > 0) {
				existing.snippet = r.snippet
			}
		} else {
			byId.set(r.id, {
				id: r.id,
				path: r.path,
				startLine: r.startLine,
				endLine: r.endLine,
				source: r.source,
				snippet: r.snippet,
				vectorScore: 0,
				textScore: r.textScore,
				scope: r.scope
			})
		}
	}

	const merged = Array.from(byId.values()).map((entry) => {
		const score =
			params.vectorWeight * entry.vectorScore +
			params.textWeight * entry.textScore
		return {
			path: entry.path,
			startLine: entry.startLine,
			endLine: entry.endLine,
			score,
			snippet: entry.snippet,
			source: entry.source as MemorySource,
			scope: entry.scope
		}
	})

	return merged.sort((a, b) => b.score - a.score)
}
