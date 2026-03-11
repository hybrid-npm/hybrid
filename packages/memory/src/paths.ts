import { createHash } from "node:crypto"
import { join } from "node:path"

/**
 * Get the credentials directory path.
 * Credentials are stored at projectDir/credentials/
 */
export function getCredentialsPath(workspaceDir: string): string {
	return join(workspaceDir, "credentials")
}

export function getProjectHash(workspaceDir: string): string {
	return createHash("sha256").update(workspaceDir).digest("hex").slice(0, 16)
}

/**
 * Get the memory root directory.
 * Memory files are stored in: workspaceDir/memory/
 */
export function getMemoryRoot(workspaceDir: string): string {
	return join(workspaceDir, "memory")
}

export function getSharedMemoryPath(workspaceDir: string): string {
	return getMemoryRoot(workspaceDir)
}

export function getUserMemoryPath(
	workspaceDir: string,
	userId: string
): string {
	return join(getMemoryRoot(workspaceDir), "users", userId)
}

export function getProjectMemoryPath(workspaceDir: string): string {
	return join(workspaceDir, "memory")
}

// PARA paths (Layer 1)
export function getParaRoot(workspaceDir: string): string {
	return join(getMemoryRoot(workspaceDir), "life")
}

export function getProjectsPath(workspaceDir: string): string {
	return join(getParaRoot(workspaceDir), "projects")
}

export function getAreasPath(workspaceDir: string): string {
	return join(getParaRoot(workspaceDir), "areas")
}

export function getResourcesPath(workspaceDir: string): string {
	return join(getParaRoot(workspaceDir), "resources")
}

export function getArchivesPath(workspaceDir: string): string {
	return join(getParaRoot(workspaceDir), "archives")
}

// Daily log paths (Layer 2)
export function getLogsPath(workspaceDir: string): string {
	return join(getMemoryRoot(workspaceDir), "logs")
}

export function getDailyLogPath(workspaceDir: string, date?: string): string {
	const logDate = date || new Date().toISOString().split("T")[0]
	return join(getLogsPath(workspaceDir), `${logDate}.md`)
}

export interface MemoryPaths {
	read: string[]
	write: string
}

export function getMemoryPaths(
	workspaceDir: string,
	userId: string,
	role: "owner" | "guest"
): MemoryPaths {
	const userPath = getUserMemoryPath(workspaceDir, userId)

	if (role === "owner") {
		// Owners can read from:
		// 1. workspaceDir — root-level MEMORY.md (join(workspaceDir, "MEMORY.md"))
		// 2. userPath — per-user memory (join(userPath, "MEMORY.md"))
		// Each entry must be a *directory* since readMemorySection does join(dir, "MEMORY.md")
		return {
			read: [workspaceDir, userPath],
			write: userPath
		}
	}

	return {
		read: [userPath],
		write: userPath
	}
}
