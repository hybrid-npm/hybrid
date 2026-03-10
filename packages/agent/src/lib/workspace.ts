/**
 * Workspace Isolation Module
 *
 * Creates per-user isolated workspaces with symlinks to:
 * - Read-only code (dist/)
 * - User's own memory directory (read-write)
 * - User's own file workspace (read-write)
 *
 * Config files (AGENTS.md, SOUL.md, IDENTITY.md) are loaded from project root,
 * NOT symlinked into user workspaces.
 *
 * This prevents Claude from accessing other users' data.
 *
 * Architecture:
 * - Memory: {projectRoot}/memory/users/{userId}/
 * - Workspace: {projectRoot}/workspace/{userId}/
 * - Secrets: DATA_ROOT/secrets/ (unchanged)
 */

import { existsSync, realpathSync } from "node:fs"
import { access, mkdir, symlink } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"

/**
 * Get DATA_ROOT for secrets and credentials only.
 * Memory and workspace are now in project root.
 *
 * In production (Fly.io): DATA_ROOT=/app/data is set
 * In development: DATA_ROOT is not set, secrets come from .env files
 */
function getDataRoot(): string {
	return process.env.DATA_ROOT || ""
}

/**
 * Get project root directory.
 */
function getProjectRoot(): string {
	return process.env.AGENT_PROJECT_ROOT || process.cwd()
}

export interface WorkspacePaths {
	workspaceDir: string
	userMemoryDir: string
	userWorkspaceDir: string
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
 * - User's own file workspace (read-write)
 *
 * Claude's cwd is set to this workspace, preventing access to other users.
 */
export async function getOrCreateUserWorkspace(
	userId: string
): Promise<WorkspacePaths> {
	const sanitizedUserId = sanitizeUserId(userId)
	const projectRoot = getProjectRoot()

	// Workspace is now in project root, not DATA_ROOT
	const workspaceDir = join(projectRoot, "workspace", sanitizedUserId)
	const userMemoryDir = join(projectRoot, "memory", "users", sanitizedUserId)
	const userWorkspaceDir = workspaceDir

	// Create workspace directory
	await createDirIfNotExists(workspaceDir)

	// Create user memory directory
	await createDirIfNotExists(userMemoryDir)

	// Symlink read-only code
	const readOnlyLinks: Array<{
		target: string
		link: string
		type: "file" | "dir"
	}> = [
		{
			target: join(projectRoot, "dist"),
			link: join(workspaceDir, "dist"),
			type: "dir"
		}
	]

	for (const { target, link, type } of readOnlyLinks) {
		await createSymlinkIfNotExists(target, link, type)
	}

	// Symlink user's memory (read-write)
	await createSymlinkIfNotExists(
		userMemoryDir,
		join(workspaceDir, "memory"),
		"dir"
	)

	return { workspaceDir, userMemoryDir, userWorkspaceDir }
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
	const expectedWorkspace = join(workspaceDir, "workspace", sanitizedUserId)
	const expectedMemory = join(workspaceDir, "memory", "users", sanitizedUserId)

	// Normalize paths to prevent traversal
	const normalizedPath = resolve(workspaceDir, path)

	// Check if path is within user's workspace or memory
	// Use trailing separator to prevent prefix collisions (e.g. alice vs alicebob)
	return (
		normalizedPath === expectedWorkspace ||
		normalizedPath.startsWith(`${expectedWorkspace}/`) ||
		normalizedPath === expectedMemory ||
		normalizedPath.startsWith(`${expectedMemory}/`)
	)
}

/**
 * Get the path to a user's memory directory (in project root).
 */
export function getUserMemoryPath(userId: string): string {
	const sanitizedUserId = sanitizeUserId(userId)
	return join(getProjectRoot(), "memory", "users", sanitizedUserId)
}

/**
 * Get the path to a user's file workspace (in project root).
 */
export function getUserWorkspacePath(userId: string): string {
	const sanitizedUserId = sanitizeUserId(userId)
	return join(getProjectRoot(), "workspace", sanitizedUserId)
}

/**
 * Get the workspaces directory (in project root).
 */
export function getWorkspacesPath(): string {
	return join(getProjectRoot(), "workspace")
}

/**
 * Get the DATA_ROOT path (for secrets only).
 */
export function getDataRootPath(): string {
	return getDataRoot()
}

// =============================================================================
// File Operations Workspace Validation
// =============================================================================

export interface ValidationResult {
	valid: boolean
	resolvedPath?: string
	error?: string
}

/**
 * Validate that a path is within the user's file workspace.
 * This is used by file operations (read/write/edit).
 *
 * Security checks:
 * 1. Rejects directory traversal attempts (../)
 * 2. Rejects absolute paths
 * 3. Resolves symlinks to prevent escapes
 * 4. Ensures resolved path is within workspace
 */
export function validatePathInWorkspace(params: {
	workspaceRoot: string
	userId: string
	requestedPath: string
}): ValidationResult {
	const { workspaceRoot, userId, requestedPath } = params

	// Get user's workspace directory
	const userWorkspace = join(workspaceRoot, "workspace", sanitizeUserId(userId))

	// Reject directory traversal attempts
	if (requestedPath.includes("..")) {
		return { valid: false, error: "Directory traversal not allowed" }
	}

	// Reject absolute paths (must be relative)
	if (isAbsolute(requestedPath)) {
		return { valid: false, error: "Only relative paths allowed" }
	}

	// Resolve the full path
	const resolvedPath = resolve(userWorkspace, requestedPath)

	// Ensure resolved path is within workspace
	// Use trailing separator to prevent prefix collisions (e.g. alice vs alicebob)
	if (
		resolvedPath !== userWorkspace &&
		!resolvedPath.startsWith(`${userWorkspace}/`)
	) {
		return { valid: false, error: "Path escapes workspace" }
	}

	// Resolve symlinks to prevent escapes
	if (existsSync(resolvedPath)) {
		try {
			const realPath = realpathSync(resolvedPath)
			const realWorkspace = realpathSync(userWorkspace)

			if (!realPath.startsWith(realWorkspace)) {
				return { valid: false, error: "Symlink escapes workspace" }
			}
		} catch {
			// If we can't resolve symlinks, fail safe
			return { valid: false, error: "Cannot resolve path" }
		}
	}

	return { valid: true, resolvedPath }
}
