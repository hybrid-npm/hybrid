import { existsSync, mkdirSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Role } from "./acl.js"
import { getMemoryPaths } from "./paths.js"

export type MemoryCategory =
	| "preferences"
	| "learnings"
	| "decisions"
	| "context"
	| "notes"

export interface AutoMemoryEntry {
	category: MemoryCategory
	content: string
	timestamp?: string
}

const CATEGORY_HEADERS: Record<MemoryCategory, string> = {
	preferences: "## User Preferences",
	learnings: "## Learnings",
	decisions: "## Decisions",
	context: "## Context",
	notes: "## Notes"
}

const DEFAULT_TEMPLATE = `# Agent Memory

This file stores persistent memory across conversations.

## User Preferences

## Learnings

## Decisions

## Context

## Notes
`

function ensureDir(dir: string): void {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true })
	}
}

export async function appendToMemory(
	workspaceDir: string,
	entry: AutoMemoryEntry,
	userId: string,
	role: Role
): Promise<{ success: boolean; message: string }> {
	const paths = getMemoryPaths(workspaceDir, userId, role)
	const memoryDir = paths.write
	const memoryPath = join(memoryDir, "MEMORY.md")

	ensureDir(memoryDir)

	if (!existsSync(memoryPath)) {
		await writeFile(memoryPath, DEFAULT_TEMPLATE, "utf-8")
	}

	const content = await readFile(memoryPath, "utf-8")
	const categoryHeader = CATEGORY_HEADERS[entry.category]
	const timestamp = entry.timestamp || new Date().toISOString().split("T")[0]
	const line = `- ${entry.content} (${timestamp})`

	if (!content.includes(categoryHeader)) {
		const updatedContent = `${content}\n\n${categoryHeader}\n\n${line}\n`
		await writeFile(memoryPath, updatedContent, "utf-8")
		return { success: true, message: `Added to new section: ${entry.category}` }
	}

	const lines = content.split("\n")
	let insertIndex = -1
	let inTargetSection = false

	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === categoryHeader) {
			inTargetSection = true
			continue
		}

		if (inTargetSection && lines[i].startsWith("## ")) {
			insertIndex = i
			break
		}

		if (inTargetSection && lines[i].trim() !== "" && insertIndex === -1) {
			if (lines[i].includes(entry.content)) {
				return { success: false, message: "Similar entry already exists" }
			}
		}
	}

	if (insertIndex === -1) {
		insertIndex = lines.length
	}

	const beforeInsertContent = lines.slice(0, insertIndex).join("\n")
	const afterInsertContent = lines.slice(insertIndex).join("\n")

	let newContent: string
	if (
		beforeInsertContent.endsWith("\n") &&
		afterInsertContent.startsWith("-")
	) {
		newContent = `${beforeInsertContent}${line}\n${afterInsertContent}`
	} else if (beforeInsertContent.endsWith("\n\n")) {
		newContent = `${beforeInsertContent}${line}\n${afterInsertContent}`
	} else {
		newContent = `${beforeInsertContent}\n${line}\n${afterInsertContent}`
	}

	await writeFile(memoryPath, newContent, "utf-8")
	return { success: true, message: `Added to ${entry.category}` }
}

export async function readMemorySection(
	workspaceDir: string,
	category: MemoryCategory,
	userId: string,
	role: Role
): Promise<string[]> {
	const paths = getMemoryPaths(workspaceDir, userId, role)
	const allEntries: string[] = []
	const seen = new Set<string>()

	for (const memoryDir of paths.read) {
		const memoryPath = join(memoryDir, "MEMORY.md")

		if (!existsSync(memoryPath)) {
			continue
		}

		const content = await readFile(memoryPath, "utf-8")
		const categoryHeader = CATEGORY_HEADERS[category]
		const lines = content.split("\n")
		let inTargetSection = false

		for (const line of lines) {
			if (line.trim() === categoryHeader) {
				inTargetSection = true
				continue
			}

			if (inTargetSection && line.startsWith("## ")) {
				break
			}

			if (inTargetSection && line.startsWith("- ")) {
				const entry = line.slice(2)
				if (!seen.has(entry)) {
					seen.add(entry)
					allEntries.push(entry)
				}
			}
		}
	}

	return allEntries
}

export async function clearMemorySection(
	workspaceDir: string,
	category: MemoryCategory,
	userId: string,
	role: Role
): Promise<void> {
	const paths = getMemoryPaths(workspaceDir, userId, role)
	const memoryDir = paths.write
	const memoryPath = join(memoryDir, "MEMORY.md")

	if (!existsSync(memoryPath)) {
		return
	}

	const content = await readFile(memoryPath, "utf-8")
	const categoryHeader = CATEGORY_HEADERS[category]
	const lines = content.split("\n")
	const newLines: string[] = []
	let inTargetSection = false

	for (const line of lines) {
		if (line.trim() === categoryHeader) {
			inTargetSection = true
			newLines.push(line)
			continue
		}

		if (inTargetSection && line.startsWith("## ")) {
			inTargetSection = false
		}

		if (!inTargetSection || !line.startsWith("- ")) {
			newLines.push(line)
		}
	}

	await writeFile(memoryPath, newLines.join("\n"), "utf-8")
}
