import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { PatchResult } from "./types"

/**
 * Parse a unified diff patch and apply it to content
 * This is a simplified implementation that handles common patch formats
 */
function applyUnifiedDiff(
	content: string,
	patch: string
): {
	success: boolean
	result?: string
	hunksApplied: number
	hunksFailed: number
} {
	const lines = content.split("\n")
	const patchLines = patch.split("\n")

	let hunksApplied = 0
	let hunksFailed = 0
	let currentLine = 0

	// Find hunk headers (@@ -a,b +c,d @@)
	let i = 0
	while (i < patchLines.length) {
		const line = patchLines[i]

		// Skip header lines
		if (
			line.startsWith("---") ||
			line.startsWith("+++") ||
			line.startsWith("diff")
		) {
			i++
			continue
		}

		// Parse hunk header
		const hunkMatch = line.match(/^@@ -(\d+),?\d* \+(\d+),?\d* @@/)
		if (hunkMatch) {
			const startLine = Number.parseInt(hunkMatch[2], 10) - 1 // Convert to 0-indexed
			currentLine = startLine
			i++

			// Apply hunk
			let hunkSuccess = true
			const appliedChanges: Array<{
				type: "add" | "remove" | "context"
				content: string
			}> = []

			while (i < patchLines.length && !patchLines[i].startsWith("@@")) {
				const hunkLine = patchLines[i]

				if (hunkLine.startsWith("+")) {
					// Addition
					appliedChanges.push({ type: "add", content: hunkLine.slice(1) })
				} else if (hunkLine.startsWith("-")) {
					// Removal
					appliedChanges.push({ type: "remove", content: hunkLine.slice(1) })
				} else if (hunkLine.startsWith(" ")) {
					// Context
					appliedChanges.push({ type: "context", content: hunkLine.slice(1) })
				} else if (hunkLine === "") {
					// Empty line (might be context with no space prefix in some patches)
					appliedChanges.push({ type: "context", content: "" })
				}

				i++
			}

			// Apply the changes to the lines array
			try {
				let lineIndex = currentLine
				for (const change of appliedChanges) {
					if (change.type === "remove") {
						if (lines[lineIndex] !== change.content) {
							hunkSuccess = false
							break
						}
						lines.splice(lineIndex, 1)
					} else if (change.type === "add") {
						lines.splice(lineIndex, 0, change.content)
						lineIndex++
					} else {
						// Context - verify and advance
						if (lines[lineIndex] !== change.content) {
							// Context mismatch - might still be OK if we're at the end
							if (lineIndex < lines.length) {
								hunkSuccess = false
								break
							}
						}
						lineIndex++
					}
				}

				if (hunkSuccess) {
					hunksApplied++
				} else {
					hunksFailed++
				}
			} catch {
				hunksFailed++
			}
		} else {
			i++
		}
	}

	return {
		success: hunksFailed === 0 && hunksApplied > 0,
		result: lines.join("\n"),
		hunksApplied,
		hunksFailed
	}
}

/**
 * Apply a unified diff patch to a file in the workspace
 */
export async function applyPatchToWorkspace(params: {
	workspacePath: string
	path: string
	patch: string
}): Promise<PatchResult> {
	const filePath = join(params.workspacePath, params.path)

	// Read current content
	let content: string
	try {
		content = await readFile(filePath, "utf-8")
	} catch {
		return {
			success: false,
			path: params.path,
			hunksApplied: 0,
			hunksFailed: 1
		}
	}

	// Apply the patch
	const result = applyUnifiedDiff(content, params.patch)

	if (result.success && result.result) {
		await writeFile(filePath, result.result, "utf-8")
	}

	return {
		success: result.success,
		path: params.path,
		hunksApplied: result.hunksApplied,
		hunksFailed: result.hunksFailed
	}
}
