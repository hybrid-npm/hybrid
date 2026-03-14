import { existsSync, mkdirSync } from "node:fs"
import { appendFile, readFile, writeFile } from "node:fs/promises"
import { getDailyLogPath, getLogsPath } from "./paths.js"

export interface LogEntry {
	timestamp: string
	type: "event" | "fact" | "decision" | "action"
	content: string
}

function ensureDir(dir: string): void {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true })
	}
}

function formatTime(): string {
	const now = new Date()
	return now.toTimeString().slice(0, 5)
}

export async function appendToLog(
	workspaceDir: string,
	entry: LogEntry
): Promise<void> {
	const logsPath = getLogsPath(workspaceDir)
	ensureDir(logsPath)

	const today = new Date().toISOString().split("T")[0]
	const logPath = getDailyLogPath(workspaceDir, today)

	// Create file with header if it doesn't exist
	if (!existsSync(logPath)) {
		await writeFile(logPath, `# ${today}\n\n`, "utf-8")
	}

	const time = formatTime()
	const typeLabel =
		entry.type === "fact"
			? "[FACT]"
			: entry.type === "decision"
				? "[DECISION]"
				: entry.type === "action"
					? "[ACTION]"
					: ""

	const line = `### ${time}\n- ${typeLabel} ${entry.content}\n\n`

	await appendFile(logPath, line, "utf-8")
}

export async function logEvent(
	workspaceDir: string,
	content: string
): Promise<void> {
	await appendToLog(workspaceDir, {
		timestamp: new Date().toISOString(),
		type: "event",
		content
	})
}

export async function logFact(
	workspaceDir: string,
	content: string
): Promise<void> {
	await appendToLog(workspaceDir, {
		timestamp: new Date().toISOString(),
		type: "fact",
		content
	})
}

export async function logDecision(
	workspaceDir: string,
	content: string
): Promise<void> {
	await appendToLog(workspaceDir, {
		timestamp: new Date().toISOString(),
		type: "decision",
		content
	})
}

export async function logAction(
	workspaceDir: string,
	content: string
): Promise<void> {
	await appendToLog(workspaceDir, {
		timestamp: new Date().toISOString(),
		type: "action",
		content
	})
}

export async function readLog(
	workspaceDir: string,
	date: string
): Promise<string> {
	const logPath = getDailyLogPath(workspaceDir, date)

	if (!existsSync(logPath)) {
		return ""
	}

	return readFile(logPath, "utf-8")
}

export async function extractFactsFromLog(
	workspaceDir: string,
	date: string
): Promise<string[]> {
	const log = await readLog(workspaceDir, date)
	const facts: string[] = []

	const lines = log.split("\n")
	for (const line of lines) {
		if (line.includes("[FACT]")) {
			const fact = line
				.replace(/\[FACT\]/, "")
				.replace(/^- /, "")
				.trim()
			if (fact) facts.push(fact)
		}
	}

	return facts
}

export async function extractDecisionsFromLog(
	workspaceDir: string,
	date: string
): Promise<string[]> {
	const log = await readLog(workspaceDir, date)
	const decisions: string[] = []

	const lines = log.split("\n")
	for (const line of lines) {
		if (line.includes("[DECISION]")) {
			const decision = line
				.replace(/\[DECISION\]/, "")
				.replace(/^- /, "")
				.trim()
			if (decision) decisions.push(decision)
		}
	}

	return decisions
}
