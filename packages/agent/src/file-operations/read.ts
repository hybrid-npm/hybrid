import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import type { ReadResult } from "./types"
import { DEFAULT_PAGE_SIZE, MAX_LINES } from "./types"

/**
 * Detect if a file is likely binary based on extension
 */
function isBinaryFileExtension(path: string): boolean {
	const binaryExtensions = [
		".png",
		".jpg",
		".jpeg",
		".gif",
		".webp",
		".pdf",
		".zip",
		".tar",
		".gz",
		".exe",
		".dll",
		".so",
		".dylib",
		".mp3",
		".mp4",
		".wav",
		".avi",
		".mov"
	]
	const ext = path.toLowerCase()
	return binaryExtensions.some((e) => ext.endsWith(e))
}

/**
 * Detect MIME type from file extension
 */
export function detectMimeTypeFromPath(path: string): string {
	const ext = path.toLowerCase().split(".").pop() || ""

	const mimeMap: Record<string, string> = {
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		webp: "image/webp",
		pdf: "application/pdf",
		json: "application/json",
		js: "application/javascript",
		ts: "application/typescript",
		mjs: "application/javascript",
		cjs: "application/javascript",
		html: "text/html",
		css: "text/css",
		md: "text/markdown",
		txt: "text/plain",
		xml: "application/xml",
		svg: "image/svg+xml"
	}

	return mimeMap[ext] || "application/octet-stream"
}

/**
 * Check if a file is an image based on MIME type
 */
export function isImageMimeType(mimeType: string): boolean {
	return mimeType.startsWith("image/")
}

/**
 * Read file with line numbers and optional paging
 */
async function readFileWithPaging(
	filePath: string,
	offset?: number,
	limit?: number
): Promise<ReadResult> {
	const content = await readFile(filePath, "utf-8")
	const lines = content.split("\n")

	const startLine = (offset ?? 1) - 1 // Convert 1-indexed to 0-indexed
	const maxLines = limit ?? MAX_LINES

	const endLine = Math.min(startLine + maxLines, lines.length)
	const selectedLines = lines.slice(startLine, endLine)
	const truncated = lines.length > endLine

	// Format with line numbers
	const output = selectedLines
		.map((line, i) => `${startLine + i + 1}: ${line}`)
		.join("\n")

	let finalContent = output
	let continuationOffset: number | undefined

	if (truncated) {
		const remainingLines = lines.length - endLine
		continuationOffset = endLine + 1
		finalContent += `\n\n[${remainingLines} more lines in file. Use offset=${continuationOffset} to continue.]`
	}

	return {
		content: finalContent,
		path: filePath,
		lines: selectedLines.length,
		truncated,
		continuationOffset
	}
}

/**
 * Read a file from the workspace
 */
export async function readFileFromWorkspace(params: {
	workspacePath: string
	path: string
	offset?: number
	limit?: number
}): Promise<ReadResult> {
	const filePath = join(params.workspacePath, params.path)

	// Check if file exists and get stats
	const stats = await stat(filePath)

	// Check if binary file
	if (isBinaryFileExtension(params.path)) {
		throw new Error(
			`Cannot read binary file: ${params.path}. Use appropriate tool for binary files.`
		)
	}

	// For large files, use paging unless explicit limit is provided
	const usePaging = stats.size > DEFAULT_PAGE_SIZE && !params.limit

	if (usePaging || params.offset || params.limit) {
		return readFileWithPaging(filePath, params.offset, params.limit)
	}

	// Read entire file for small files
	const content = await readFile(filePath, "utf-8")
	const lines = content.split("\n")

	return {
		content,
		path: params.path,
		lines: lines.length
	}
}
