import { existsSync, mkdirSync } from "node:fs"
import { readFile, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
	getArchivesPath,
	getAreasPath,
	getParaRoot,
	getProjectsPath,
	getResourcesPath
} from "./paths.js"

export type ParaBucket = "projects" | "areas" | "resources" | "archives"
export type EntityCategory = "people" | "companies" | "topics" | "projects"
export type FactCategory =
	| "relationship"
	| "milestone"
	| "status"
	| "preference"
	| "user-signal"
export type FactStatus = "active" | "superseded"
export type DecayTier = "hot" | "warm" | "cold"

export interface AtomicFact {
	id: string
	fact: string
	category: FactCategory
	timestamp: string
	source: string
	status: FactStatus
	supersededBy?: string
	relatedEntities: string[]
	lastAccessed: string
	accessCount: number
}

export interface Entity {
	path: string
	name: string
	bucket: ParaBucket
	category?: EntityCategory
	items: AtomicFact[]
}

export interface ItemsFile {
	entityId: string
	entityName: string
	bucket: ParaBucket
	category?: EntityCategory
	createdAt: string
	updatedAt: string
	items: AtomicFact[]
}

function ensureDir(dir: string): void {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true })
	}
}

function getBucketPath(workspaceDir: string, bucket: ParaBucket): string {
	switch (bucket) {
		case "projects":
			return getProjectsPath(workspaceDir)
		case "areas":
			return getAreasPath(workspaceDir)
		case "resources":
			return getResourcesPath(workspaceDir)
		case "archives":
			return getArchivesPath(workspaceDir)
	}
}

function generateId(): string {
	return `fact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function createEntity(
	workspaceDir: string,
	name: string,
	bucket: ParaBucket,
	category?: EntityCategory
): Promise<{ success: boolean; message: string; path: string }> {
	const bucketPath = getBucketPath(workspaceDir, bucket)
	const entityPath = category
		? join(bucketPath, category, name)
		: join(bucketPath, name)

	if (existsSync(entityPath)) {
		return {
			success: false,
			message: `Entity already exists: ${name}`,
			path: entityPath
		}
	}

	ensureDir(entityPath)

	const now = new Date().toISOString().split("T")[0]

	// Create items.json
	const itemsFile: ItemsFile = {
		entityId: `entity-${Date.now()}`,
		entityName: name,
		bucket,
		category,
		createdAt: now,
		updatedAt: now,
		items: []
	}

	await writeFile(
		join(entityPath, "items.json"),
		JSON.stringify(itemsFile, null, 2),
		"utf-8"
	)

	// Create empty summary.md
	await writeFile(
		join(entityPath, "summary.md"),
		`# ${name}\n\n*No active facts yet.*\n`,
		"utf-8"
	)

	return { success: true, message: `Created entity: ${name}`, path: entityPath }
}

export async function addFact(
	workspaceDir: string,
	entityPath: string,
	fact: string,
	category: FactCategory,
	relatedEntities: string[] = []
): Promise<{ success: boolean; message: string; factId: string }> {
	const itemsPath = join(entityPath, "items.json")

	if (!existsSync(itemsPath)) {
		return { success: false, message: "Entity not found", factId: "" }
	}

	const content = await readFile(itemsPath, "utf-8")
	const itemsFile: ItemsFile = JSON.parse(content)

	const now = new Date().toISOString().split("T")[0]
	const newFact: AtomicFact = {
		id: generateId(),
		fact,
		category,
		timestamp: now,
		source: now,
		status: "active",
		relatedEntities,
		lastAccessed: now,
		accessCount: 0
	}

	itemsFile.items.push(newFact)
	itemsFile.updatedAt = now

	await writeFile(itemsPath, JSON.stringify(itemsFile, null, 2), "utf-8")

	return { success: true, message: `Added fact to entity`, factId: newFact.id }
}

export async function supersedeFact(
	workspaceDir: string,
	entityPath: string,
	factId: string,
	newFact: string
): Promise<{ success: boolean; message: string }> {
	const itemsPath = join(entityPath, "items.json")

	if (!existsSync(itemsPath)) {
		return { success: false, message: "Entity not found" }
	}

	const content = await readFile(itemsPath, "utf-8")
	const itemsFile: ItemsFile = JSON.parse(content)

	const oldFactIndex = itemsFile.items.findIndex((f) => f.id === factId)
	if (oldFactIndex === -1) {
		return { success: false, message: "Fact not found" }
	}

	const now = new Date().toISOString().split("T")[0]
	const newFactRecord: AtomicFact = {
		id: generateId(),
		fact: newFact,
		category: itemsFile.items[oldFactIndex].category,
		timestamp: now,
		source: now,
		status: "active",
		relatedEntities: itemsFile.items[oldFactIndex].relatedEntities,
		lastAccessed: now,
		accessCount: 0
	}

	itemsFile.items[oldFactIndex].status = "superseded"
	itemsFile.items[oldFactIndex].supersededBy = newFactRecord.id
	itemsFile.items.push(newFactRecord)
	itemsFile.updatedAt = now

	await writeFile(itemsPath, JSON.stringify(itemsFile, null, 2), "utf-8")

	return { success: true, message: "Fact superseded" }
}

export async function accessFact(
	entityPath: string,
	factId: string
): Promise<void> {
	const itemsPath = join(entityPath, "items.json")

	if (!existsSync(itemsPath)) return

	const content = await readFile(itemsPath, "utf-8")
	const itemsFile: ItemsFile = JSON.parse(content)

	const fact = itemsFile.items.find((f) => f.id === factId)
	if (!fact) return

	fact.lastAccessed = new Date().toISOString().split("T")[0]
	fact.accessCount += 1

	await writeFile(itemsPath, JSON.stringify(itemsFile, null, 2), "utf-8")
}

export function computeDecayTier(
	fact: AtomicFact,
	now: Date = new Date()
): DecayTier {
	const lastAccessed = new Date(fact.lastAccessed)
	const daysSinceAccess = Math.floor(
		(now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24)
	)

	// High access count resistance
	if (fact.accessCount >= 10) {
		return "warm" // Indefinitely warm
	}

	if (fact.accessCount >= 5 && daysSinceAccess <= 14) {
		return "hot" // Extended hot period
	}

	if (daysSinceAccess <= 7) {
		return "hot"
	}

	if (daysSinceAccess <= 30) {
		return "warm"
	}

	return "cold"
}

export async function generateSummary(
	entityPath: string,
	entityName: string
): Promise<string> {
	const itemsPath = join(entityPath, "items.json")

	if (!existsSync(itemsPath)) {
		return `# ${entityName}\n\n*No facts recorded.*\n`
	}

	const content = await readFile(itemsPath, "utf-8")
	const itemsFile: ItemsFile = JSON.parse(content)

	const activeFacts = itemsFile.items.filter((f) => f.status === "active")

	// Compute decay tiers
	const hotFacts: AtomicFact[] = []
	const warmFacts: AtomicFact[] = []

	for (const fact of activeFacts) {
		const tier = computeDecayTier(fact)
		if (tier === "hot") hotFacts.push(fact)
		else if (tier === "warm") warmFacts.push(fact)
		// Cold facts excluded from summary
	}

	// Sort by access count (descending)
	hotFacts.sort((a, b) => b.accessCount - a.accessCount)
	warmFacts.sort((a, b) => b.accessCount - a.accessCount)

	let summary = `# ${entityName}\n\n`

	if (hotFacts.length > 0) {
		summary += `## Current\n\n`
		for (const fact of hotFacts) {
			summary += `- ${fact.fact}\n`
		}
		summary += "\n"
	}

	if (warmFacts.length > 0) {
		summary += `## Background\n\n`
		for (const fact of warmFacts) {
			summary += `- ${fact.fact}\n`
		}
		summary += "\n"
	}

	if (hotFacts.length === 0 && warmFacts.length === 0) {
		summary += `*No active facts in current context.*\n`
	}

	return summary
}

export async function rewriteSummaries(
	workspaceDir: string
): Promise<{ count: number }> {
	const paraRoot = getParaRoot(workspaceDir)
	let count = 0

	const buckets: ParaBucket[] = ["projects", "areas", "resources", "archives"]

	for (const bucket of buckets) {
		const bucketPath = getBucketPath(workspaceDir, bucket)
		if (!existsSync(bucketPath)) continue

		const entries = await readdir(bucketPath, { withFileTypes: true })

		for (const entry of entries) {
			if (!entry.isDirectory()) continue

			const entityPath = join(bucketPath, entry.name)
			const summary = await generateSummary(entityPath, entry.name)
			await writeFile(join(entityPath, "summary.md"), summary, "utf-8")
			count++
		}
	}

	return { count }
}

export async function searchFacts(
	workspaceDir: string,
	query: string,
	options?: {
		bucket?: ParaBucket
		includeCold?: boolean
	}
): Promise<
	Array<{ fact: AtomicFact; entityPath: string; entityName: string }>
> {
	const results: Array<{
		fact: AtomicFact
		entityPath: string
		entityName: string
	}> = []

	const buckets = options?.bucket
		? [options.bucket]
		: (["projects", "areas", "resources", "archives"] as ParaBucket[])

	const queryLower = query.toLowerCase()

	for (const bucket of buckets) {
		const bucketPath = getBucketPath(workspaceDir, bucket)
		if (!existsSync(bucketPath)) continue

		const entries = await readdir(bucketPath, { withFileTypes: true })

		for (const entry of entries) {
			if (!entry.isDirectory()) continue

			const entityPath = join(bucketPath, entry.name)
			const itemsPath = join(entityPath, "items.json")

			if (!existsSync(itemsPath)) continue

			const content = await readFile(itemsPath, "utf-8")
			const itemsFile: ItemsFile = JSON.parse(content)

			for (const fact of itemsFile.items) {
				if (fact.status !== "active") continue

				const tier = computeDecayTier(fact)
				if (!options?.includeCold && tier === "cold") continue

				if (fact.fact.toLowerCase().includes(queryLower)) {
					results.push({
						fact,
						entityPath,
						entityName: itemsFile.entityName
					})
				}
			}
		}
	}

	return results
}
