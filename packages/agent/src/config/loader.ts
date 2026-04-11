import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { hybridConfigSchema, type HybridConfig } from "./schema.js"

const CONFIG_FILES = [
	"hybrid.config.ts",
	"hybrid.config.js",
	"hybrid.config.mjs",
	"hybrid.config.json"
]

export function findConfigFile(dir: string): string | null {
	for (const file of CONFIG_FILES) {
		const path = join(dir, file)
		if (existsSync(path)) {
			return path
		}
	}
	return null
}

async function loadTsConfig(filePath: string): Promise<HybridConfig> {
	const fileUrl = pathToFileURL(filePath).href
	const mod = await import(fileUrl)
	const config = mod.default || mod.config || mod
	return config as HybridConfig
}

function loadJsonConfig(filePath: string): HybridConfig {
	const raw = readFileSync(filePath, "utf-8")
	return JSON.parse(raw) as HybridConfig
}

export async function loadHybridConfig(
	dir: string
): Promise<{ config: HybridConfig; source: string | null }> {
	const configPath = findConfigFile(dir)

	if (!configPath) {
		return { config: {}, source: null }
	}

	let raw: HybridConfig

	if (configPath.endsWith(".json")) {
		raw = loadJsonConfig(configPath)
	} else {
		raw = await loadTsConfig(configPath)
	}

	const result = hybridConfigSchema.safeParse(raw)

	if (!result.success) {
		throw new Error(
			`Invalid hybrid.config.ts:\n${result.error.errors
				.map((e) => `  ${e.path.join(".")}: ${e.message}`)
				.join("\n")}`
		)
	}

	return { config: result.data, source: configPath }
}
