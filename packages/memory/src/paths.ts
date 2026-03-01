import { createHash } from "node:crypto"
import { homedir } from "node:os"
import { join } from "node:path"

export function getProjectHash(workspaceDir: string): string {
	return createHash("sha256").update(workspaceDir).digest("hex").slice(0, 16)
}

export function getOpenClawMemoryPath(workspaceDir: string): string {
	const projectHash = getProjectHash(workspaceDir)
	return join(homedir(), ".claude", "projects", projectHash, "memory")
}

export function getUserMemoryPath(userId: string): string {
	return join(homedir(), ".hybrid", "users", userId, "memory")
}

export function getProjectMemoryPath(workspaceDir: string): string {
	return join(workspaceDir, "memory")
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
	const openClawPath = getOpenClawMemoryPath(workspaceDir)
	const userPath = getUserMemoryPath(userId)
	const projectMemoryPath = getProjectMemoryPath(workspaceDir)
	const projectMemoryFile = join(workspaceDir, "MEMORY.md")

	if (role === "owner") {
		return {
			read: [openClawPath, projectMemoryFile, projectMemoryPath, userPath],
			write: openClawPath
		}
	}

	return {
		read: [userPath],
		write: userPath
	}
}
