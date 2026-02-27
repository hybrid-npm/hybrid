export interface Message {
	id: string
	role: "system" | "user" | "assistant"
	content: string
}

export interface ChatRequest {
	messages: Message[]
	chatId: string
	teamId?: string
	systemPrompt?: string
}

export interface ChatResponse {
	type: "text" | "usage" | "error" | "tool-call-start" | "tool-call-delta" | "tool-call-end"
	content?: string
	inputTokens?: number
	outputTokens?: number
	totalCostUsd?: number
	numTurns?: number
	toolCallId?: string
	toolName?: string
	argsTextDelta?: string
}

export interface HealthResponse {
	status: "healthy" | "unhealthy"
	service: string
	timestamp?: string
	container?: boolean
	sidecar?: boolean
	server?: boolean
	gateway?: boolean
	message?: string
}

export function encodeSSE(data: unknown): Uint8Array {
	return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

export function encodeDone(): Uint8Array {
	return new TextEncoder().encode("data: [DONE]\n\n")
}
