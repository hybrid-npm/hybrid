import { existsSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tool } from "@anthropic-ai/claude-agent-sdk"
import type { Role } from "@hybrid/memory"
import { z } from "zod"
import { editFileInWorkspace } from "../file-operations/edit"
import { applyPatchToWorkspace } from "../file-operations/patch"
import { readFileFromWorkspace } from "../file-operations/read"
import { writeFileToWorkspace } from "../file-operations/write"
import { validatePathInWorkspace } from "../lib/workspace"
import { getUserWorkspacePath } from "../lib/workspace"

const PROJECT_CONFIG_FILES = [
	"IDENTITY.md",
	"AGENTS.md",
	"SOUL.md",
	"TOOLS.md",
	"BOOT.md",
	"BOOTSTRAP.md",
	"HEARTBEAT.md"
]

/**
 * Create file operation tools for the MCP server.
 *
 * Security:
 * - Only owners can access file operations
 * - Project config files (IDENTITY.md, etc.) are written to project root
 * - All other paths are validated to be within user's workspace
 * - Path traversal and symlink escapes are prevented
 */
export function createFileTools(params: {
	workspaceDir: string
	userId: string
	role: Role
	projectRoot: string
}) {
	const { workspaceDir, userId, role, projectRoot } = params

	// Read tool
	const readTool = tool(
		"read",
		"Read file contents from workspace. Use for reading code, configs, and documentation. " +
			"Supports adaptive paging for large files with line numbers. " +
			"Use offset and limit to read specific sections of large files.",
		{
			path: z.string().describe("Relative path within workspace"),
			offset: z
				.number()
				.optional()
				.describe("Start line number (1-indexed, default: 1)"),
			limit: z.number().optional().describe("Max lines to read (default: 2000)")
		},
		async (args) => {
			// ACL check
			if (role !== "owner") {
				return {
					content: [
						{
							type: "text",
							text: "Permission denied: Only owners can read files"
						}
					],
					isError: true
				}
			}

			// Validate path
			const validation = validatePathInWorkspace({
				workspaceRoot: projectRoot,
				userId,
				requestedPath: args.path
			})

			if (!validation.valid) {
				return {
					content: [{ type: "text", text: `Error: ${validation.error}` }],
					isError: true
				}
			}

			// Get user's workspace path
			const userWorkspacePath = getUserWorkspacePath(userId)

			try {
				const result = await readFileFromWorkspace({
					workspacePath: userWorkspacePath,
					path: args.path,
					offset: args.offset,
					limit: args.limit
				})

				return {
					content: [{ type: "text", text: result.content }]
				}
			} catch (err) {
				return {
					content: [
						{
							type: "text",
							text: `Error reading file: ${(err as Error).message}`
						}
					],
					isError: true
				}
			}
		}
	)

	// Write tool
	const writeTool = tool(
		"write",
		"Create or overwrite files in workspace. Use for creating new files or replacing entire file contents. " +
			"Will create parent directories if they don't exist. " +
			"Use edit for making small changes to existing files.",
		{
			path: z.string().describe("Relative path within workspace"),
			content: z.string().describe("File content to write")
		},
		async (args) => {
			// ACL check
			if (role !== "owner") {
				return {
					content: [
						{
							type: "text",
							text: "Permission denied: Only owners can write files"
						}
					],
					isError: true
				}
			}

			// Handle project-level config files - write to project root
			const baseName = args.path.split("/").pop()
			if (baseName && args.path === baseName && PROJECT_CONFIG_FILES.includes(baseName)) {
				try {
					const configPath = join(projectRoot, baseName)
					writeFileSync(configPath, args.content, "utf-8")
					return {
						content: [
							{
								type: "text",
								text: `Wrote ${args.content.length} bytes to ${baseName} (project root)`
							}
						]
					}
				} catch (err) {
					return {
						content: [
							{
								type: "text",
								text: `Error writing config file: ${(err as Error).message}`
							}
						],
						isError: true
					}
				}
			}

			// Validate path
			const validation = validatePathInWorkspace({
				workspaceRoot: projectRoot,
				userId,
				requestedPath: args.path
			})

			if (!validation.valid) {
				return {
					content: [{ type: "text", text: `Error: ${validation.error}` }],
					isError: true
				}
			}

			// Get user's workspace path
			const userWorkspacePath = getUserWorkspacePath(userId)

			try {
				const result = await writeFileToWorkspace({
					workspacePath: userWorkspacePath,
					path: args.path,
					content: args.content
				})

				return {
					content: [
						{
							type: "text",
							text: `Wrote ${result.bytesWritten} bytes to ${args.path}`
						}
					]
				}
			} catch (err) {
				return {
					content: [
						{
							type: "text",
							text: `Error writing file: ${(err as Error).message}`
						}
					],
					isError: true
				}
			}
		}
	)

	// Edit tool
	const editTool = tool(
		"edit",
		"Make precise edits to existing files. Use for small changes without rewriting entire file. " +
			"Each edit finds oldText and replaces it with newText. " +
			"All edits are applied in sequence. If any edit fails, previous edits are still applied.",
		{
			path: z.string().describe("Relative path within workspace"),
			edits: z
				.array(
					z.object({
						oldText: z.string().describe("Text to find and replace"),
						newText: z.string().describe("Replacement text")
					})
				)
				.describe("List of edits to apply")
		},
		async (args) => {
			// ACL check
			if (role !== "owner") {
				return {
					content: [
						{
							type: "text",
							text: "Permission denied: Only owners can edit files"
						}
					],
					isError: true
				}
			}

			// Handle project-level config files - edit at project root
			const baseName = args.path.split("/").pop()
			if (baseName && args.path === baseName && PROJECT_CONFIG_FILES.includes(baseName)) {
				try {
					const configPath = join(projectRoot, baseName)
					if (!existsSync(configPath)) {
						return {
							content: [
								{
									type: "text",
									text: `${baseName} does not exist at project root`
								}
							],
							isError: true
						}
					}

					let content = await import("node:fs/promises").then((fs) =>
						fs.readFile(configPath, "utf-8")
					)
					let applied = 0
					const failed: Array<{ oldText: string; reason: string }> = []

					for (const edit of args.edits) {
						if (content.includes(edit.oldText)) {
							content = content.replace(edit.oldText, edit.newText)
							applied++
						} else {
							failed.push({ oldText: edit.oldText, reason: "Text not found" })
						}
					}

					writeFileSync(configPath, content, "utf-8")

					if (failed.length > 0) {
						return {
							content: [
								{
									type: "text",
									text: `Applied ${applied} edits to ${baseName}, failed ${failed.length}`
								}
							],
							isError: true
						}
					}

					return {
						content: [
							{
								type: "text",
								text: `Applied ${applied} edits to ${baseName} (project root)`
							}
						]
					}
				} catch (err) {
					return {
						content: [
							{
								type: "text",
								text: `Error editing config file: ${(err as Error).message}`
							}
						],
						isError: true
					}
				}
			}

			// Validate path
			const validation = validatePathInWorkspace({
				workspaceRoot: projectRoot,
				userId,
				requestedPath: args.path
			})

			if (!validation.valid) {
				return {
					content: [{ type: "text", text: `Error: ${validation.error}` }],
					isError: true
				}
			}

			// Get user's workspace path
			const userWorkspacePath = getUserWorkspacePath(userId)

			try {
				const result = await editFileInWorkspace({
					workspacePath: userWorkspacePath,
					path: args.path,
					edits: args.edits
				})

				if (result.editsFailed.length > 0) {
					const failedText = result.editsFailed
						.map((e) => `- "${e.oldText}": ${e.reason}`)
						.join("\n")

					return {
						content: [
							{
								type: "text",
								text: `Applied ${result.editsApplied} edits, failed ${result.editsFailed.length}:\n${failedText}`
							}
						],
						isError: true
					}
				}

				return {
					content: [
						{
							type: "text",
							text: `Applied ${result.editsApplied} edits to ${args.path}`
						}
					]
				}
			} catch (err) {
				return {
					content: [
						{
							type: "text",
							text: `Error editing file: ${(err as Error).message}`
						}
					],
					isError: true
				}
			}
		}
	)

	// Apply patch tool
	const applyPatchTool = tool(
		"apply_patch",
		"Apply a unified diff patch to a file. Use for applying changes from git diffs. " +
			"Supports standard unified diff format with hunk headers (@@ -a,b +c,d @@).",
		{
			path: z.string().describe("Relative path within workspace"),
			patch: z.string().describe("Unified diff format patch")
		},
		async (args) => {
			// ACL check
			if (role !== "owner") {
				return {
					content: [
						{
							type: "text",
							text: "Permission denied: Only owners can patch files"
						}
					],
					isError: true
				}
			}

			// Validate path
			const validation = validatePathInWorkspace({
				workspaceRoot: projectRoot,
				userId,
				requestedPath: args.path
			})

			if (!validation.valid) {
				return {
					content: [{ type: "text", text: `Error: ${validation.error}` }],
					isError: true
				}
			}

			// Get user's workspace path
			const userWorkspacePath = getUserWorkspacePath(userId)

			try {
				const result = await applyPatchToWorkspace({
					workspacePath: userWorkspacePath,
					path: args.path,
					patch: args.patch
				})

				if (!result.success) {
					return {
						content: [
							{
								type: "text",
								text: `Failed to apply patch to ${args.path}: ${result.hunksFailed} hunks failed`
							}
						],
						isError: true
					}
				}

				return {
					content: [
						{
							type: "text",
							text: `Applied patch to ${args.path}: ${result.hunksApplied} hunks applied`
						}
					]
				}
			} catch (err) {
				return {
					content: [
						{
							type: "text",
							text: `Error applying patch: ${(err as Error).message}`
						}
					],
					isError: true
				}
			}
		}
	)

	// Delete tool
	const deleteTool = tool(
		"delete",
		"Delete a file from the workspace. Use to remove files that are no longer needed. " +
			"Cannot be undone - use with caution.",
		{
			path: z.string().describe("Relative path within workspace to delete")
		},
		async (args) => {
			// ACL check
			if (role !== "owner") {
				return {
					content: [
						{
							type: "text",
							text: "Permission denied: Only owners can delete files"
						}
					],
					isError: true
				}
			}

			// Handle project-level config files - delete from project root
			const baseName = args.path.split("/").pop()
			if (baseName && PROJECT_CONFIG_FILES.includes(baseName)) {
				try {
					const configPath = join(projectRoot, baseName)
					if (!existsSync(configPath)) {
						return {
							content: [
								{
									type: "text",
									text: `${baseName} does not exist at project root`
								}
							],
							isError: true
						}
					}

					rmSync(configPath)
					return {
						content: [
							{
								type: "text",
								text: `Deleted ${baseName} from project root`
							}
						]
					}
				} catch (err) {
					return {
						content: [
							{
								type: "text",
								text: `Error deleting config file: ${(err as Error).message}`
							}
						],
						isError: true
					}
				}
			}

			// Validate path
			const validation = validatePathInWorkspace({
				workspaceRoot: projectRoot,
				userId,
				requestedPath: args.path
			})

			if (!validation.valid) {
				return {
					content: [{ type: "text", text: `Error: ${validation.error}` }],
					isError: true
				}
			}

			// Get user's workspace path
			const userWorkspacePath = getUserWorkspacePath(userId)
			const fullPath = join(userWorkspacePath, args.path)

			try {
				if (!existsSync(fullPath)) {
					return {
						content: [
							{
								type: "text",
								text: `File ${args.path} does not exist`
							}
						],
						isError: true
					}
				}

				rmSync(fullPath)
				return {
					content: [
						{
							type: "text",
							text: `Deleted ${args.path}`
						}
					]
				}
			} catch (err) {
				return {
					content: [
						{
							type: "text",
							text: `Error deleting file: ${(err as Error).message}`
						}
					],
					isError: true
				}
			}
		}
	)

	return [readTool, writeTool, editTool, applyPatchTool, deleteTool]
}
