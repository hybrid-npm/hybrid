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

function getDataRoot(): string {
	return process.env.DATA_ROOT || "/app/data"
}

function getProjectRoot(): string {
	return process.env.AGENT_PROJECT_ROOT || process.cwd()
}

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
 * Create symlink if it doesn't exist.
 * Uses try/catch instead of check-then-act to avoid TOCTOU races
 * when concurrent requests create the same workspace.
 */
async function createSymlinkIfNotExists(
	target: string,
	link: string,
	type: "file" | "dir" = "file"
): Promise<void> {
	// Ensure parent directory exists
	const linkDir = join(link, "..")
	await mkdir(linkDir, { recursive: true })

	try {
		await symlink(target, link, type)
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
			throw err
		}
	}
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

	const dataRoot = getDataRoot()
	const workspaceDir = join(dataRoot, "workspaces", sanitizedUserId)
	const userMemoryDir = join(dataRoot, "memory", "users", sanitizedUserId)

	// Create workspace directory
	await createDirIfNotExists(workspaceDir)

	// Create user memory directory
	await createDirIfNotExists(userMemoryDir)

	// Symlink read-only resources (code)
	const projectRoot = getProjectRoot()
	const readOnlyLinks: Array<{
		target: string
		link: string
		type: "file" | "dir"
	}> = [
		{
			target: join(projectRoot, "dist"),
			link: join(workspaceDir, "dist"),
			type: "dir"
		},
		{
			target: join(projectRoot, "AGENTS.md"),
			link: join(workspaceDir, "AGENTS.md"),
			type: "file"
		},
		{
			target: join(projectRoot, "SOUL.md"),
			link: join(workspaceDir, "SOUL.md"),
			type: "file"
		}
	]

	for (const { target, link, type } of readOnlyLinks) {
		await createSymlinkIfNotExists(target, link, type)
	}

	// Symlink user's memory (read-write)
	await createSymlinkIfNotExists(userMemoryDir, join(workspaceDir, "memory"), "dir")

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
	const dataRoot = getDataRoot()
	const expectedWorkspace = join(dataRoot, "workspaces", sanitizedUserId)
	const expectedMemory = join(dataRoot, "memory", "users", sanitizedUserId)

	// Normalize paths to prevent traversal
	const normalizedPath = join(workspaceDir, path)

	// Check if path is within user's workspace or memory
	// Use trailing separator to prevent prefix collisions (e.g. alice vs alicebob)
	return (
		normalizedPath === expectedWorkspace ||
		normalizedPath.startsWith(expectedWorkspace + "/") ||
		normalizedPath === expectedMemory ||
		normalizedPath.startsWith(expectedMemory + "/")
	)
}

/**
 * Get the path to a user's memory directory.
 */
export function getUserMemoryPath(userId: string): string {
	const sanitizedUserId = sanitizeUserId(userId)
	return join(getDataRoot(), "memory", "users", sanitizedUserId)
}

/**
 * Get the path to the workspaces directory.
 */
export function getWorkspacesPath(): string {
	return join(getDataRoot(), "workspaces")
}

/**
 * Get the DATA_ROOT path.
 */
export function getDataRootPath(): string {
	return getDataRoot()
}
