import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { EditOperation, EditResult } from "./types"

/**
 * Apply edits to a file in the workspace
 */
export async function editFileInWorkspace(params: {
	workspacePath: string
	path: string
	edits: EditOperation[]
}): Promise<EditResult> {
	const filePath = join(params.workspacePath, params.path)

	// Read current content
	let content: string
	try {
		content = await readFile(filePath, "utf-8")
	} catch {
		return {
			success: false,
			path: params.path,
			editsApplied: 0,
			editsFailed: params.edits.map((e) => ({
				oldText: e.oldText,
				reason: "File not found"
			}))
		}
	}

	const editsApplied: EditOperation[] = []
	const editsFailed: Array<{ oldText: string; reason: string }> = []

	// Apply each edit
	for (const edit of params.edits) {
		if (content.includes(edit.oldText)) {
			// Replace only the first occurrence (like OpenClaw behavior)
			const index = content.indexOf(edit.oldText)
			content =
				content.slice(0, index) +
				edit.newText +
				content.slice(index + edit.oldText.length)
			editsApplied.push(edit)
		} else {
			editsFailed.push({
				oldText: edit.oldText,
				reason: "Text not found in file"
			})
		}
	}

	// Write updated content if any edits were applied
	if (editsApplied.length > 0) {
		await writeFile(filePath, content, "utf-8")
	}

	return {
		success: editsFailed.length === 0,
		path: params.path,
		editsApplied: editsApplied.length,
		editsFailed
	}
}
