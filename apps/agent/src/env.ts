import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Load .dev.vars (Cloudflare convention) into process.env for local dev.
 * Skips silently if the file doesn't exist.
 */
export function loadDevVars() {
	const path = resolve(process.cwd(), ".dev.vars")
	let content: string
	try {
		content = readFileSync(path, "utf-8")
	} catch {
		return
	}
	for (const line of content.split("\n")) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith("#")) continue
		const eq = trimmed.indexOf("=")
		if (eq === -1) continue
		const key = trimmed.slice(0, eq)
		const value = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "")
		if (!(key in process.env)) {
			process.env[key] = value
		}
	}
}
