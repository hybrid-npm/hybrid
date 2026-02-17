import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { DEFAULT_MOUNTS } from "./types"

export function mountLocalStorage(baseDir?: string): void {
	const root = baseDir ?? process.cwd()

	for (const mount of Object.values(DEFAULT_MOUNTS)) {
		const dir = resolve(root, mount.path.replace(/^\//, ""))
		mkdirSync(dir, { recursive: true })
	}
}
