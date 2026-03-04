/**
 * Workspace Isolation Module
 *
 * Creates per-user isolated workspaces with symlinks to:
 * - Read-only code/resources (dist/, AGENTS.md, SOUL.md)
 * - User's own memory directory (read-write)
 *
 * This prevents Claude from accessing other users' data.
 */

import { access, mkdir, symlink } from "node:fs/promises"
import { join } from "node:path"

const DATA_ROOT = process.env.DATA_ROOT || "/app/data"
const PROJECT_ROOT = process.env.AGENT_PROJECT_ROOT || process.cwd()

export interface WorkspacePaths {
	workspaceDir: string
	userMemoryDir: string
}

/**
 * Check if a path exists
 */
async function exists(path: string): Promise<boolean> {
	try {
		await access(path)
		return true
	} catch {
		return false
	}
}

/**
 * Create symlink if it doesn't exist
 */
async function createSymlinkIfNotExists(
	target: string,
	link: string,
	type: "file" | "dir" = "file"
): Promise<void> {
	if (await exists(link)) {
		return
	}

	// Ensure parent directory exists
	const linkDir = join(link, "..")
	if (!(await exists(linkDir))) {
		await mkdir(linkDir, { recursive: true })
	}

	await symlink(target, link, type)
}

/**
 * Create directory if it doesn't exist
 */
async function createDirIfNotExists(path: string): Promise<void> {
	if (!(await exists(path))) {
		await mkdir(path, { recursive: true })
	}
}

/**
 * Sanitize userId to prevent path traversal
 */
function sanitizeUserId(userId: string): string {
	return userId.replace(/[^a-zA-Z0-9_-]/g, "_")
}

/**
 * Get or create an isolated workspace for a user.
 *
 * The workspace contains:
 * - Symlinks to read-only code/resources
 * - Symlink to user's memory directory
 *
 * Claude's cwd is set to this workspace, preventing access to other users.
 */
export async function getOrCreateUserWorkspace(
	userId: string
): Promise<WorkspacePaths> {
	const sanitizedUserId = sanitizeUserId(userId)

	const workspaceDir = join(DATA_ROOT, "workspaces", sanitizedUserId)
	const userMemoryDir = join(DATA_ROOT, "memory", "users", sanitizedUserId)

	// Create workspace directory
	await createDirIfNotExists(workspaceDir)

	// Create user memory directory
	await createDirIfNotExists(userMemoryDir)

	// Symlink read-only resources (code)
	const readOnlyLinks: Array<{
		target: string
		link: string
		type: "file" | "dir"
	}> = [
		{
			target: join(PROJECT_ROOT, "dist"),
			link: join(workspaceDir, "dist"),
			type: "dir"
		},
		{
			target: join(PROJECT_ROOT, "AGENTS.md"),
			link: join(workspaceDir, "AGENTS.md"),
			type: "file"
		},
		{
			target: join(PROJECT_ROOT, "SOUL.md"),
			link: join(workspaceDir, "SOUL.md"),
			type: "file"
		}
	]

	for (const { target, link, type } of readOnlyLinks) {
		await createSymlinkIfNotExists(target, link, type)
	}

	// Symlink user's memory (read-write)
	const memoryLink = join(workspaceDir, "memory")
	if (!(await exists(memoryLink))) {
		await symlink(userMemoryDir, memoryLink, "dir")
	}

	return { workspaceDir, userMemoryDir }
}

/**
 * Validate that a path is within the user's workspace.
 * Prevents path traversal attacks.
 */
export function isPathInUserWorkspace(
	workspaceDir: string,
	userId: string,
	path: string
): boolean {
	const sanitizedUserId = sanitizeUserId(userId)
	const expectedWorkspace = join(DATA_ROOT, "workspaces", sanitizedUserId)
	const expectedMemory = join(DATA_ROOT, "memory", "users", sanitizedUserId)

	// Normalize paths to prevent traversal
	const normalizedPath = join(workspaceDir, path)

	// Check if path is within user's workspace or memory
	return (
		normalizedPath.startsWith(expectedWorkspace) ||
		normalizedPath.startsWith(expectedMemory)
	)
}

/**
 * Get the path to a user's memory directory.
 */
export function getUserMemoryPath(userId: string): string {
	const sanitizedUserId = sanitizeUserId(userId)
	return join(DATA_ROOT, "memory", "users", sanitizedUserId)
}

/**
 * Get the path to the workspaces directory.
 */
export function getWorkspacesPath(): string {
	return join(DATA_ROOT, "workspaces")
}

/**
 * Get the DATA_ROOT path.
 */
export function getDataRoot(): string {
	return DATA_ROOT
}
