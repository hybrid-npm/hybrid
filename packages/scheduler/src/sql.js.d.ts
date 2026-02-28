declare module "sql.js" {
	export interface Database {
		run(sql: string, params?: unknown[]): void
		exec(sql: string, params?: unknown[]): QueryExecResult[]
		export(): Uint8Array
		close(): void
	}

	export interface QueryExecResult {
		columns: string[]
		values: unknown[][]
	}

	export interface SqlJsStatic {
		Database: new (data?: ArrayLike<number>) => Database
	}

	export default function initSqlJs(config?: {
		locateFile?: (file: string) => string
	}): Promise<SqlJsStatic>
}
