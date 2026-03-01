import { createHash } from "node:crypto"
import { join } from "node:path"

export function getProjectHash(workspaceDir: string): string {
	return createHash("sha256").update(workspaceDir).digest("hex").slice(0, 16)
}

export function getSharedMemoryPath(workspaceDir: string): string {
	return join(workspaceDir, ".hybrid", "memory")
}

export function getUserMemoryPath(
	workspaceDir: string,
	userId: string
): string {
	return join(workspaceDir, ".hybrid", "memory", userId)
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
	const sharedPath = getSharedMemoryPath(workspaceDir)
	const userPath = getUserMemoryPath(workspaceDir, userId)
	const projectMemoryPath = getProjectMemoryPath(workspaceDir)
	const projectMemoryFile = join(workspaceDir, "MEMORY.md")

	if (role === "owner") {
		return {
			read: [sharedPath, projectMemoryFile, projectMemoryPath, userPath],
			write: sharedPath
		}
	}

	return {
		read: [userPath],
		write: userPath
	}
}
