import { mkdir, rename, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { WriteResult } from "./types"

/**
 * Write a file to the workspace atomically
 */
export async function writeFileToWorkspace(params: {
	workspacePath: string
	path: string
	content: string
}): Promise<WriteResult> {
	const filePath = join(params.workspacePath, params.path)
	const tempPath = `${filePath}.tmp`

	// Ensure parent directory exists
	await mkdir(dirname(filePath), { recursive: true })

	// Write atomically: write to temp file, then rename
	await writeFile(tempPath, params.content, "utf-8")

	try {
		await rename(tempPath, filePath)
	} catch {
		// On some systems, rename fails if target exists
		// Try unlink + rename as fallback
		try {
			await unlink(filePath)
		} catch {
			// File may not exist, that's fine
		}
		await rename(tempPath, filePath)
	}

	const bytesWritten = Buffer.byteLength(params.content, "utf-8")

	return {
		success: true,
		path: params.path,
		bytesWritten
	}
}
