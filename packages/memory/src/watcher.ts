import path from "node:path"
import chokidar, { type FSWatcher } from "chokidar"
import { normalizeExtraMemoryPaths } from "./internal.js"

const IGNORED_DIRS = new Set([
	".git",
	"node_modules",
	".pnpm-store",
	".venv",
	"venv",
	".tox",
	"__pycache__"
])

export function shouldIgnorePath(watchPath: string): boolean {
	const normalized = path.normalize(watchPath)
	const parts = normalized.split(path.sep).map((s) => s.trim().toLowerCase())
	return parts.some((s) => IGNORED_DIRS.has(s))
}

export function createMemoryWatcher(params: {
	workspaceDir: string
	extraPaths?: string[]
	debounceMs: number
	onChange: () => void
}): FSWatcher {
	const watchPaths = new Set<string>([
		path.join(params.workspaceDir, "MEMORY.md"),
		path.join(params.workspaceDir, "memory.md"),
		path.join(params.workspaceDir, "memory", "**", "*.md")
	])

	const normalizedExtra = normalizeExtraMemoryPaths(
		params.workspaceDir,
		params.extraPaths
	)
	for (const extra of normalizedExtra) {
		watchPaths.add(extra)
	}

	const watcher = chokidar.watch(Array.from(watchPaths), {
		ignoreInitial: true,
		ignored: (p) => shouldIgnorePath(String(p)),
		awaitWriteFinish: {
			stabilityThreshold: params.debounceMs,
			pollInterval: 100
		}
	})

	let debounceTimer: NodeJS.Timeout | null = null

	const markDirty = () => {
		if (debounceTimer) {
			clearTimeout(debounceTimer)
		}
		debounceTimer = setTimeout(() => {
			debounceTimer = null
			params.onChange()
		}, params.debounceMs)
	}

	watcher.on("add", markDirty)
	watcher.on("change", markDirty)
	watcher.on("unlink", markDirty)

	return watcher
}

export async function closeWatcher(watcher: FSWatcher | null): Promise<void> {
	if (!watcher) {
		return
	}
	await watcher.close()
}

export type WatcherHandle = {
	close: () => Promise<void>
}

export function createWatcherHandle(watcher: FSWatcher): WatcherHandle {
	return {
		close: () => closeWatcher(watcher)
	}
}
