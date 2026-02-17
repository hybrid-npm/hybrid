import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
	type AgentDefinition,
	type HookCallback,
	type Options,
	type PreToolUseHookInput,
	query
} from "@anthropic-ai/claude-agent-sdk"
import type { ContainerRequest, UIMessageLite } from "./types"
import {
	ToolBlockTracker,
	buildUsagePayload,
	encodeDone,
	encodeSSEJson,
	extractTextDelta
} from "./sse"

const MODEL = "claude-sonnet-4-20250514"

const __dirname = dirname(fileURLToPath(import.meta.url))

function resolveProjectRoot(): string {
	if (process.env.AGENT_PROJECT_ROOT) return process.env.AGENT_PROJECT_ROOT
	let dir = __dirname
	for (let i = 0; i < 5; i++) {
		try {
			readFileSync(join(dir, "AGENT.md"), "utf-8")
			return dir
		} catch {
			dir = dirname(dir)
		}
	}
	return join(__dirname, "..", "..")
}

const PROJECT_ROOT = resolveProjectRoot()

function loadMarkdownFile(relativePath: string): string {
	try {
		return readFileSync(join(PROJECT_ROOT, relativePath), "utf-8").trim()
	} catch {
		console.warn(`[agent] could not load ${relativePath}`)
		return ""
	}
}

const AGENT_MD = loadMarkdownFile("AGENT.md")
const GENERAL_SKILL = loadMarkdownFile("src/skills/general.md")
const SUPPORT_SKILL = loadMarkdownFile("src/skills/support.md")

const SECRET_ENV_VARS = ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"]

function createSanitizeBashHook(): HookCallback {
	return async (input, _toolUseId, _context) => {
		const preInput = input as PreToolUseHookInput
		const command = (preInput.tool_input as { command?: string })?.command
		if (!command) return {}

		const unsetPrefix = `unset ${SECRET_ENV_VARS.join(" ")} 2>/dev/null; `
		return {
			hookSpecificOutput: {
				hookEventName: "PreToolUse" as const,
				updatedInput: {
					...(preInput.tool_input as Record<string, unknown>),
					command: unsetPrefix + command,
				},
			},
		}
	}
}

function formatConversationHistory(messages: UIMessageLite[]): string {
	const prior = messages.slice(0, -1)
	if (prior.length === 0) return ""

	const formatted = prior
		.filter((m) => m.role === "user" || m.role === "assistant")
		.map((m) => {
			const role = m.role === "user" ? "User" : "Assistant"
			return `${role}: ${m.content}`
		})
		.join("\n\n")

	if (!formatted) return ""
	return `## Conversation History\n\n${formatted}`
}

export function buildSubagents(): Record<string, AgentDefinition> {
	return {
		general: {
			description:
				"Handles general questions, conversational help, and any query that does not match a more specific agent.",
			prompt: GENERAL_SKILL,
			model: "inherit",
			maxTurns: 100
		},
		support: {
			description:
				"Handles troubleshooting, technical problems, feedback capture, and support requests. Use when the user says something is broken, needs help, or provides corrections.",
			prompt: SUPPORT_SKILL,
			model: "inherit",
			maxTurns: 100
		},
	}
}

export function buildFullSystemPrompt(req: ContainerRequest): string {
	const history = formatConversationHistory(req.messages)

	const sections = [
		req.systemPrompt,
		AGENT_MD,
		history,
	].filter(Boolean)

	return sections.join("\n\n")
}

export function runAgent(
	req: ContainerRequest,
	signal?: AbortSignal
): ReadableStream<Uint8Array> {
	const systemPrompt = buildFullSystemPrompt(req)
	const lastMessage = req.messages.at(-1)?.content ?? ""

	const abortController = new AbortController()
	if (signal) {
		if (signal.aborted) {
			abortController.abort()
		} else {
			signal.addEventListener("abort", () => abortController.abort(), {
				once: true
			})
		}
	}

	const agents = buildSubagents()
	console.log(
		`[agent] subagents: ${Object.keys(agents).join(", ")}`
	)

	const options: Options = {
		abortController,
		systemPrompt,
		model: MODEL,
		cwd: PROJECT_ROOT,
		settingSources: ["project"],
		permissionMode: "bypassPermissions",
		allowDangerouslySkipPermissions: true,
		tools: [],
		allowedTools: ["Task", "Bash"],
		agents,
		maxTurns: 25,
		includePartialMessages: true,
		hooks: {
			PreToolUse: [{ matcher: "Bash", hooks: [createSanitizeBashHook()] }],
		},
		env: {
			...process.env,
			ENABLE_TOOL_SEARCH: "auto",
			CLAUDE_CODE_EXTRA_BODY: JSON.stringify({
				temperature: req.temperature
			})
		}
	}

	console.log(
		`[agent] calling query() with model=${MODEL} prompt="${lastMessage.slice(0, 100)}"`
	)

	const conversation = query({ prompt: lastMessage, options })

	console.log("[agent] query() returned async iterator, starting stream...")

	let hasStreamedPartial = false
	let lastAssistantTextLength = 0
	let messageCount = 0
	const toolTracker = new ToolBlockTracker()

	return new ReadableStream<Uint8Array>({
		cancel() {
			console.log("[agent] stream cancelled by client")
			abortController.abort()
		},
		async pull(controller) {
			try {
				const { value: msg, done } = await conversation.next()
				if (done) {
					console.log(
						`[agent] conversation done after ${messageCount} messages`
					)
					controller.enqueue(encodeDone())
					controller.close()
					return
				}

				messageCount++
				let debugLabel: string
				if (msg.type === "stream_event") {
					const evt = msg.event as { type: string }
					debugLabel = `stream_event:${evt.type}`
				} else {
					debugLabel = msg.type
				}
				controller.enqueue(
					encodeSSEJson({ type: "debug", msg: messageCount, event: debugLabel })
				)

				if (msg.type === "stream_event") {
					const toolStart = toolTracker.extractToolCallStart(msg)
					if (toolStart) {
						controller.enqueue(encodeSSEJson({
							type: "tool-call-start",
							toolCallId: toolStart.toolCallId,
							toolName: toolStart.toolName,
						}))
						return
					}

					const toolDelta = toolTracker.extractToolCallDelta(msg)
					if (toolDelta) {
						controller.enqueue(encodeSSEJson({
							type: "tool-call-delta",
							toolCallId: toolDelta.toolCallId,
							argsTextDelta: toolDelta.argsTextDelta,
						}))
						return
					}

					const toolStop = toolTracker.extractToolCallStop(msg)
					if (toolStop) {
						controller.enqueue(encodeSSEJson({
							type: "tool-call-end",
							toolCallId: toolStop.toolCallId,
							toolName: toolStop.toolName,
							args: toolStop.args,
						}))
						return
					}

					const text = extractTextDelta(msg)
					if (text) {
						hasStreamedPartial = true
						controller.enqueue(encodeSSEJson({ type: "text", content: text }))
					}
				} else if (msg.type === "assistant" && !hasStreamedPartial) {
					const fullText = extractTextDelta(msg)
					if (fullText && fullText.length > lastAssistantTextLength) {
						const delta = fullText.slice(lastAssistantTextLength)
						lastAssistantTextLength = fullText.length
						controller.enqueue(encodeSSEJson({ type: "text", content: delta }))
					}
				} else if (msg.type === "result") {
					controller.enqueue(encodeSSEJson(buildUsagePayload(msg)))
					hasStreamedPartial = false
					lastAssistantTextLength = 0
					toolTracker.reset()
				}
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : "Agent error"
				console.error("[agent] error in pull():", err)
				try {
					controller.enqueue(
						encodeSSEJson({ type: "error", content: errorMessage })
					)
					controller.enqueue(encodeDone())
					controller.close()
				} catch {
					// Stream already cancelled — safe to ignore
				}
			}
		}
	})
}
