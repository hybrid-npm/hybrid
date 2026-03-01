import Database from "better-sqlite3"
export type DatabaseSync = Database.Database

export function ensureMemoryIndexSchema(params: {
	db: DatabaseSync
	embeddingCacheTable: string
	ftsTable: string
	ftsEnabled: boolean
}): { ftsAvailable: boolean; ftsError?: string } {
	params.db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

	params.db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'memory',
      hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL,
      user_id TEXT,
      conversation_id TEXT,
      PRIMARY KEY (path, source, user_id, conversation_id)
    );
  `)

	params.db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT NOT NULL,
      path TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'memory',
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      hash TEXT NOT NULL,
      model TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      user_id TEXT,
      conversation_id TEXT,
      PRIMARY KEY (id, source, user_id, conversation_id)
    );
  `)

	params.db.exec(`
    CREATE TABLE IF NOT EXISTS ${params.embeddingCacheTable} (
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      provider_key TEXT NOT NULL,
      hash TEXT NOT NULL,
      embedding TEXT NOT NULL,
      dims INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (provider, model, provider_key, hash)
    );
  `)

	params.db.exec(
		`CREATE INDEX IF NOT EXISTS idx_embedding_cache_updated_at ON ${params.embeddingCacheTable}(updated_at);`
	)

	let ftsAvailable = false
	let ftsError: string | undefined
	if (params.ftsEnabled) {
		try {
			params.db.exec(
				`CREATE VIRTUAL TABLE IF NOT EXISTS ${params.ftsTable} USING fts5(
          text,
          id UNINDEXED,
          path UNINDEXED,
          source UNINDEXED,
          model UNINDEXED,
          start_line UNINDEXED,
          end_line UNINDEXED,
          user_id UNINDEXED,
          conversation_id UNINDEXED
        );`
			)
			ftsAvailable = true
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			ftsAvailable = false
			ftsError = message
		}
	}

	ensureColumn(params.db, "files", "source", "TEXT NOT NULL DEFAULT 'memory'")
	ensureColumn(params.db, "chunks", "source", "TEXT NOT NULL DEFAULT 'memory'")
	ensureColumn(params.db, "files", "user_id", "TEXT")
	ensureColumn(params.db, "files", "conversation_id", "TEXT")
	ensureColumn(params.db, "chunks", "user_id", "TEXT")
	ensureColumn(params.db, "chunks", "conversation_id", "TEXT")

	params.db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);`)
	params.db.exec(
		`CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);`
	)
	params.db.exec(
		`CREATE INDEX IF NOT EXISTS idx_chunks_user_id ON chunks(user_id);`
	)
	params.db.exec(
		`CREATE INDEX IF NOT EXISTS idx_chunks_conversation_id ON chunks(conversation_id);`
	)

	return { ftsAvailable, ...(ftsError ? { ftsError } : {}) }
}

function ensureColumn(
	db: DatabaseSync,
	table: "files" | "chunks",
	column: string,
	definition: string
): void {
	const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
		name: string
	}>
	if (rows.some((row) => row.name === column)) {
		return
	}
	db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}
