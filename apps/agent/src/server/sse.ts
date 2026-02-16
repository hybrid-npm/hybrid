import type {
	BetaRawContentBlockDeltaEvent,
	BetaRawContentBlockStartEvent,
	BetaRawContentBlockStopEvent,
} from "@anthropic-ai/sdk/resources/beta/messages/messages"
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"

const encoder = new TextEncoder()

/**
 * Extracts text content from an SDK message.
 * Handles both streaming `content_block_delta` events (incremental text) and
 * full `assistant` messages (concatenates all text blocks).
 * Returns `null` for non-text messages (tool use, debug, etc.).
 */
export function extractTextDelta(msg: SDKMessage): string | null {
	if (msg.type === "stream_event") {
		const event = msg.event
		if (event.type === "content_block_delta") {
			const { delta } = event as BetaRawContentBlockDeltaEvent
			if (delta.type === "text_delta") {
				return delta.text
			}
		}
		return null
	}

	if (msg.type === "assistant") {
		const textParts: string[] = []
		for (const block of msg.message.content) {
			if (block.type === "text") {
				textParts.push(block.text)
			}
		}
		return textParts.length > 0 ? textParts.join("") : null
	}

	return null
}

export interface ToolCallStart {
	toolCallId: string
	toolName: string
	index: number
}

export interface ToolCallDelta {
	toolCallId: string
	argsTextDelta: string
	index: number
}

export interface ToolCallStop {
	toolCallId: string
	toolName: string
	index: number
}

export interface ToolResult {
	toolCallId: string
	result: string | Array<{ type: string; text: string }>
	isError: boolean
	index: number
}

export class ToolBlockTracker {
	private blocks = new Map<number, { toolCallId: string; toolName: string; argChunks: string[] }>()

	extractToolCallStart(msg: SDKMessage): ToolCallStart | null {
		if (msg.type !== "stream_event") return null
		const event = msg.event
		if (event.type !== "content_block_start") return null
		const { content_block, index } = event as BetaRawContentBlockStartEvent
		if (content_block.type === "tool_use") {
			const toolCallId = content_block.id
			const toolName = content_block.name
			this.blocks.set(index, { toolCallId, toolName, argChunks: [] })
			return { toolCallId, toolName, index }
		}
		return null
	}

	extractToolCallDelta(msg: SDKMessage): ToolCallDelta | null {
		if (msg.type !== "stream_event") return null
		const event = msg.event
		if (event.type !== "content_block_delta") return null
		const { delta, index } = event as BetaRawContentBlockDeltaEvent
		if (delta.type !== "input_json_delta") return null
		const tracked = this.blocks.get(index)
		if (!tracked) return null
		tracked.argChunks.push(delta.partial_json)
		return { toolCallId: tracked.toolCallId, argsTextDelta: delta.partial_json, index }
	}

	extractToolCallStop(msg: SDKMessage): (ToolCallStop & { args: string }) | null {
		if (msg.type !== "stream_event") return null
		const event = msg.event
		if (event.type !== "content_block_stop") return null
		const { index } = event as BetaRawContentBlockStopEvent
		const tracked = this.blocks.get(index)
		if (!tracked) return null
		const args = tracked.argChunks.join("")
		this.blocks.delete(index)
		return { toolCallId: tracked.toolCallId, toolName: tracked.toolName, args, index }
	}

	reset(): void {
		this.blocks.clear()
	}
}

/**
 * Encodes a string payload as an SSE `data:` frame (`data: <payload>\n\n`).
 */
export function encodeSSE(payload: string): Uint8Array {
	return encoder.encode(`data: ${payload}\n\n`)
}

/**
 * JSON-serializes an object and wraps it in an SSE `data:` frame.
 */
export function encodeSSEJson(data: Record<string, unknown>): Uint8Array {
	return encodeSSE(JSON.stringify(data))
}

/**
 * Emits the sentinel `data: [DONE]` SSE frame that signals end-of-stream.
 */
export function encodeDone(): Uint8Array {
	return encodeSSE("[DONE]")
}

export interface UsagePayload {
	type: "usage"
	total_cost_usd: number
	num_turns: number
	duration_ms: number
	duration_api_ms: number
	[key: string]: unknown
}

/**
 * Converts the raw fields from a Claude Agent SDK `result` message into a
 * typed `UsagePayload` suitable for SSE transmission to the gateway.
 */
export function buildUsagePayload(msg: {
	total_cost_usd: number
	usage: Record<string, unknown>
	modelUsage: Record<string, Record<string, unknown>>
	num_turns: number
	duration_ms: number
	duration_api_ms: number
}): UsagePayload {
	return {
		type: "usage",
		total_cost_usd: msg.total_cost_usd,
		usage: msg.usage,
		modelUsage: msg.modelUsage,
		num_turns: msg.num_turns,
		duration_ms: msg.duration_ms,
		duration_api_ms: msg.duration_api_ms,
	}
}
