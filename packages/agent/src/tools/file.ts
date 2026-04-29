import { existsSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Type } from "@sinclair/typebox"
import { defineTool, type ToolDefinition } from "@mariozechner/pi-coding-agent"
import type { Role } from "@hybrd/memory"
import { editFileInWorkspace } from "../file-operations/edit"
import { applyPatchToWorkspace } from "../file-operations/patch"
import { readFileFromWorkspace } from "../file-operations/read"
import { writeFileToWorkspace } from "../file-operations/write"
import { validatePathInWorkspace } from "../lib/workspace"

const PROJECT_CONFIG_FILES = [
	"IDENTITY.md",
	"AGENTS.md",
	"SOUL.md",
	"TOOLS.md",
	"BOOT.md",
	"HEARTBEAT.md",
	"USER.md"
]

// ── TypeBox schemas ──────────────────────────────────────────────────────

const readSchema = Type.Object({
	path: Type.String(),
	offset: Type.Optional(Type.Number()),
	limit: Type.Optional(Type.Number())
})

const writeSchema = Type.Object({
	path: Type.String(),
	content: Type.String()
})

const editSchema = Type.Object({
	path: Type.String(),
	edits: Type.Array(
		Type.Object({
			oldText: Type.String(),
			newText: Type.String()
		})
	)
})

const applyPatchSchema = Type.Object({
	path: Type.String(),
	patch: Type.String()
})

const deleteSchema = Type.Object({
	path: Type.String()
})

// ── Helpers ──────────────────────────────────────────────────────────────

function errorText(text: string) {
	return { content: [{ type: "text" as const, text }], details: {} as unknown, isError: true }
}

function okText(text: string) {
	return { content: [{ type: "text" as const, text }], details: {} }
}

interface ToolContext {
	workspaceDir: string
	userId: string
	role: Role
	projectRoot: string
}

// ── Tool creators ────────────────────────────────────────────────────────

/**
 * Create file operation tools for the Pi agent runtime.
 *
 * Security:
 * - Only owners can access file operations
 * - Project config files (IDENTITY.md, etc.) are written to project root
 * - All other paths are validated to be within user's workspace
 * - Path traversal and symlink escapes are prevented
 */
export function createFileTools(
	ctx: ToolContext
): ToolDefinition<any, unknown, unknown>[] {
	const { userId, role, projectRoot } = ctx
	const userWorkspacePath = join(
		projectRoot,
		"workspace",
		userId.replace(/[^a-zA-Z0-9_-]/g, "_")
	)

	const readTool = defineTool({
		name: "read",
		label: "Read",
		description:
			"Read file contents from workspace. Use for reading code, configs, and documentation. " +
			"Supports adaptive paging for large files with line numbers. " +
			"Use offset and limit to read specific sections of large files.",
		parameters: readSchema,
		execute: async (_toolCallId, args) => {
			if (role !== "owner") {
				return errorText(
					"Permission denied: Only owners can read files"
				)
			}

			const validation = validatePathInWorkspace({
				workspaceRoot: projectRoot,
				userId,
				requestedPath: args.path
			})

			if (!validation.valid) {
				return errorText(`Error: ${validation.error}`)
			}

			try {
				const result = await readFileFromWorkspace({
					workspacePath: userWorkspacePath,
					path: args.path,
					offset: args.offset,
					limit: args.limit
				})
				return okText(result.content)
			} catch (err) {
				return errorText(
					`Error reading file: ${(err as Error).message}`
				)
			}
		}
	})

	const writeTool = defineTool({
		name: "write",
		label: "Write",
		description:
			"Create or overwrite files in workspace. Use for creating new files or replacing entire file contents. " +
			"Will create parent directories if they don't exist. " +
			"Use edit for making small changes to existing files.",
		parameters: writeSchema,
		execute: async (_toolCallId, args) => {
			if (role !== "owner") {
				return errorText(
					"Permission denied: Only owners can write files"
				)
			}

			// Handle project-level config files - write to project root
			const baseName = args.path.split("/").pop()
			if (
				baseName &&
				args.path === baseName &&
				PROJECT_CONFIG_FILES.includes(baseName)
			) {
				try {
					const configPath = join(projectRoot, baseName)
					writeFileSync(configPath, args.content, "utf-8")
					return okText(
						`Wrote ${Buffer.byteLength(args.content, "utf-8")} bytes to ${baseName} (project root)`
					)
				} catch (err) {
					return errorText(
						`Error writing config file: ${(err as Error).message}`
					)
				}
			}

			const validation = validatePathInWorkspace({
				workspaceRoot: projectRoot,
				userId,
				requestedPath: args.path
			})

			if (!validation.valid) {
				return errorText(`Error: ${validation.error}`)
			}

			try {
				const result = await writeFileToWorkspace({
					workspacePath: userWorkspacePath,
					path: args.path,
					content: args.content
				})
				return okText(
					`Wrote ${result.bytesWritten} bytes to ${args.path}`
				)
			} catch (err) {
				return errorText(
					`Error writing file: ${(err as Error).message}`
				)
			}
		}
	})

	const editTool = defineTool({
		name: "edit",
		label: "Edit",
		description:
			"Make precise edits to existing files. Use for small changes without rewriting entire file. " +
			"Each edit finds oldText and replaces it with newText. " +
			"All edits are applied in sequence. If any edit fails, previous edits are still applied.",
		parameters: editSchema,
		execute: async (_toolCallId, args) => {
			if (role !== "owner") {
				return errorText(
					"Permission denied: Only owners can edit files"
				)
			}

			// Handle project-level config files - edit at project root
			const baseName = args.path.split("/").pop()
			if (
				baseName &&
				args.path === baseName &&
				PROJECT_CONFIG_FILES.includes(baseName)
			) {
				try {
					const configPath = join(projectRoot, baseName)
					if (!existsSync(configPath)) {
						return errorText(
							`${baseName} does not exist at project root`
						)
					}

					let content = await import("node:fs/promises").then((fs) =>
						fs.readFile(configPath, "utf-8")
					)
					let applied = 0
					const failed: Array<{ oldText: string; reason: string }> = []

					for (const edit of args.edits) {
						const idx = content.indexOf(edit.oldText)
						if (idx !== -1) {
							content =
								content.slice(0, idx) +
								edit.newText +
								content.slice(idx + edit.oldText.length)
							applied++
						} else {
							failed.push({
								oldText: edit.oldText,
								reason: "Text not found"
							})
						}
					}

					writeFileSync(configPath, content, "utf-8")

					if (failed.length > 0) {
						return errorText(
							`Applied ${applied} edits to ${baseName}, failed ${failed.length}`
						)
					}

					return okText(
						`Applied ${applied} edits to ${baseName} (project root)`
					)
				} catch (err) {
					return errorText(
						`Error editing config file: ${(err as Error).message}`
					)
				}
			}

			const validation = validatePathInWorkspace({
				workspaceRoot: projectRoot,
				userId,
				requestedPath: args.path
			})

			if (!validation.valid) {
				return errorText(`Error: ${validation.error}`)
			}

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
					return errorText(
						`Applied ${result.editsApplied} edits, failed ${result.editsFailed.length}:\n${failedText}`
					)
				}

				return okText(
					`Applied ${result.editsApplied} edits to ${args.path}`
				)
			} catch (err) {
				return errorText(
					`Error editing file: ${(err as Error).message}`
				)
			}
		}
	})

	const applyPatchTool = defineTool({
		name: "apply_patch",
		label: "Apply Patch",
		description:
			"Apply a unified diff patch to a file. Use for applying changes from git diffs. " +
			"Supports standard unified diff format with hunk headers (@@ -a,b +c,d @@).",
		parameters: applyPatchSchema,
		execute: async (_toolCallId, args) => {
			if (role !== "owner") {
				return errorText(
					"Permission denied: Only owners can patch files"
				)
			}

			const validation = validatePathInWorkspace({
				workspaceRoot: projectRoot,
				userId,
				requestedPath: args.path
			})

			if (!validation.valid) {
				return errorText(`Error: ${validation.error}`)
			}

			try {
				const result = await applyPatchToWorkspace({
					workspacePath: userWorkspacePath,
					path: args.path,
					patch: args.patch
				})

				if (!result.success) {
					return errorText(
						`Failed to apply patch to ${args.path}: ${result.hunksFailed} hunks failed`
					)
				}

				return okText(
					`Applied patch to ${args.path}: ${result.hunksApplied} hunks applied`
				)
			} catch (err) {
				return errorText(
					`Error applying patch: ${(err as Error).message}`
				)
			}
		}
	})

	const deleteTool = defineTool({
		name: "delete",
		label: "Delete",
		description:
			"Delete a file from the workspace. Use to remove files that are no longer needed. " +
			"Cannot be undone - use with caution.",
		parameters: deleteSchema,
		execute: async (_toolCallId, args) => {
			if (role !== "owner") {
				return errorText(
					"Permission denied: Only owners can delete files"
				)
			}

			// Handle project-level config files - delete from project root
			const baseName = args.path.split("/").pop()
			if (
				baseName &&
				args.path === baseName &&
				PROJECT_CONFIG_FILES.includes(baseName)
			) {
				try {
					const configPath = join(projectRoot, baseName)
					if (!existsSync(configPath)) {
						return errorText(
							`${baseName} does not exist at project root`
						)
					}
					rmSync(configPath, { force: true })
					return okText(
						`Deleted ${baseName} from project root`
					)
				} catch (err) {
					return errorText(
						`Error deleting config file: ${(err as Error).message}`
					)
				}
			}

			const validation = validatePathInWorkspace({
				workspaceRoot: projectRoot,
				userId,
				requestedPath: args.path
			})

			if (!validation.valid) {
				return errorText(`Error: ${validation.error}`)
			}

			const fullPath = join(userWorkspacePath, args.path)

			try {
				if (!existsSync(fullPath)) {
					return errorText(`File ${args.path} does not exist`)
				}

				const { statSync } = await import("node:fs")
				const stat = statSync(fullPath)
				if (stat.isDirectory()) {
					return errorText(
						`Cannot delete directory: ${args.path}. Only files can be deleted.`
					)
				}

				rmSync(fullPath)
				return okText(`Deleted ${args.path}`)
			} catch (err) {
				return errorText(
					`Error deleting file: ${(err as Error).message}`
				)
			}
		}
	})

	return [readTool, writeTool, editTool, applyPatchTool, deleteTool]
}
