import fsSync from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { hashText } from "./internal.js"

export type SessionMessage = {
	role: "user" | "assistant" | "system"
	content: string
	timestamp?: number
}

export type SessionEntry = {
	id: string
	userId: string
	conversationId: string
	messages: SessionMessage[]
	createdAt: number
	updatedAt: number
}

export type ConversationMessage = {
	role: "user" | "assistant"
	content: string
	timestamp?: number
}

export type ConversationEntry = {
	id: string
	userId: string
	conversationId: string
	messages: ConversationMessage[]
	createdAt: number
	updatedAt: number
}

export async function saveConversation(params: {
	dir: string
	userId: string
	conversationId: string
	messages: ConversationMessage[]
}): Promise<ConversationEntry> {
	const dir = path.join(params.dir, "conversations", params.userId)
	await fs.mkdir(dir, { recursive: true })

	const now = Date.now()
	const entry: ConversationEntry = {
		id: params.conversationId,
		userId: params.userId,
		conversationId: params.conversationId,
		messages: params.messages,
		createdAt: now,
		updatedAt: now
	}

	const filePath = path.join(dir, `${params.conversationId}.json`)
	await fs.writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8")

	return entry
}

export async function loadConversation(params: {
	dir: string
	userId: string
	conversationId: string
}): Promise<ConversationEntry | null> {
	const filePath = path.join(
		params.dir,
		"conversations",
		params.userId,
		`${params.conversationId}.json`
	)

	try {
		const content = await fs.readFile(filePath, "utf-8")
		const entry = JSON.parse(content) as ConversationEntry
		return entry
	} catch {
		return null
	}
}

export async function listConversations(params: {
	dir: string
	userId?: string
}): Promise<ConversationEntry[]> {
	const baseDir = params.userId
		? path.join(params.dir, "conversations", params.userId)
		: path.join(params.dir, "conversations")

	try {
		const entries = await fs.readdir(baseDir, { withFileTypes: true })
		const conversations: ConversationEntry[] = []

		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue
			}
			const userDir = path.join(baseDir, entry.name)
			const files = await fs.readdir(userDir)

			for (const file of files) {
				if (!file.endsWith(".json")) {
					continue
				}
				try {
					const content = await fs.readFile(path.join(userDir, file), "utf-8")
					const conv = JSON.parse(content) as ConversationEntry
					conversations.push(conv)
				} catch {
					// Skip invalid files
				}
			}
		}

		return conversations.sort((a, b) => b.updatedAt - a.updatedAt)
	} catch {
		return []
	}
}

export function normalizeConversationText(content: unknown): string | null {
	if (typeof content === "string") {
		const normalized = content
			.replace(/\s*\n+\s*/g, " ")
			.replace(/\s+/g, " ")
			.trim()
		return normalized || null
	}

	if (!Array.isArray(content)) {
		return null
	}

	const parts: string[] = []
	for (const block of content) {
		if (!block || typeof block !== "object") {
			continue
		}
		const record = block as { type?: unknown; text?: unknown }
		if (record.type !== "text" || typeof record.text !== "string") {
			continue
		}
		const normalized = record.text
			.replace(/\s*\n+\s*/g, " ")
			.replace(/\s+/g, " ")
			.trim()
		if (normalized) {
			parts.push(normalized)
		}
	}

	if (parts.length === 0) {
		return null
	}
	return parts.join(" ")
}

export function extractConversationContent(
	messages: ConversationMessage[]
): string {
	const collected: string[] = []

	for (const msg of messages) {
		const normalized = normalizeConversationText(msg.content)
		if (!normalized) {
			continue
		}
		const label = msg.role === "user" ? "User" : "Assistant"
		collected.push(`${label}: ${normalized}`)
	}

	return collected.join("\n")
}

export function conversationToMemoryChunks(params: {
	entry: ConversationEntry
	chunking: { tokens: number; overlap: number }
}): Array<{
	text: string
	hash: string
	startMessage: number
	endMessage: number
}> {
	const content = extractConversationContent(params.entry.messages)
	const lines = content.split("\n")

	if (lines.length === 0) {
		return []
	}

	const maxChars = Math.max(32, params.chunking.tokens * 4)
	const chunks: Array<{
		text: string
		hash: string
		startMessage: number
		endMessage: number
	}> = []

	let currentLines: string[] = []
	let startMsg = 0

	const flush = () => {
		if (currentLines.length === 0) {
			return
		}
		const text = currentLines.join("\n")
		chunks.push({
			text,
			hash: hashText(text),
			startMessage: startMsg,
			endMessage: startMsg + currentLines.length - 1
		})
		currentLines = []
	}

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		const lineSize = line.length + 1

		if (
			currentLines.length > 0 &&
			currentLines.join("\n").length + lineSize > maxChars
		) {
			flush()
			startMsg = i
		}
		currentLines.push(line)
	}

	flush()
	return chunks
}

export function buildConversationEntry(
	absPath: string
): ConversationEntry | null {
	try {
		const raw = fsSync.readFileSync(absPath, "utf-8")
		const entry = JSON.parse(raw) as ConversationEntry
		return entry
	} catch {
		return null
	}
}

export function conversationPathForFile(
	absPath: string,
	baseDir: string
): string {
	return path.relative(baseDir, absPath).replace(/\\/g, "/")
}

export async function listConversationFiles(
	dir: string,
	userId?: string
): Promise<string[]> {
	const baseDir = userId
		? path.join(dir, "conversations", userId)
		: path.join(dir, "conversations")

	const result: string[] = []

	async function walk(dirPath: string) {
		try {
			const entries = await fs.readdir(dirPath, { withFileTypes: true })
			for (const entry of entries) {
				const full = path.join(dirPath, entry.name)
				if (entry.isDirectory()) {
					await walk(full)
				} else if (entry.isFile() && entry.name.endsWith(".json")) {
					result.push(full)
				}
			}
		} catch {
			// Skip inaccessible directories
		}
	}

	try {
		await walk(baseDir)
	} catch {
		// Base dir doesn't exist
	}

	return result
}
