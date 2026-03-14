export interface ReadResult {
	content: string
	path: string
	lines: number
	truncated?: boolean
	continuationOffset?: number
}

export interface WriteResult {
	success: boolean
	path: string
	bytesWritten: number
}

export interface EditOperation {
	oldText: string
	newText: string
}

export interface EditResult {
	success: boolean
	path: string
	editsApplied: number
	editsFailed: Array<{ oldText: string; reason: string }>
}

export interface PatchResult {
	success: boolean
	path: string
	hunksApplied: number
	hunksFailed: number
}

export interface ImageInfo {
	data: Buffer
	mimeType: string
	dimensions: {
		width: number
		height: number
	}
}

export const DEFAULT_PAGE_SIZE = 50 * 1024 // 50KB
export const MAX_PAGE_SIZE = 512 * 1024 // 512KB
export const MAX_LINES = 2000
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB
export const MAX_DIMENSION = 4096
