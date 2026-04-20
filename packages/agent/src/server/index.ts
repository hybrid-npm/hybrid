import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import dotenv from "dotenv"

// PROJECT_ROOT was defined at the top
const PROJECT_ROOT = process.env.AGENT_PROJECT_ROOT || process.cwd()
for (const f of [".env", ".env.local"]) {
	const p = join(PROJECT_ROOT, f)
	if (existsSync(p)) dotenv.config({ path: p })
}

import {
	AuthStorage,
	createAgentSession,
	ModelRegistry,
	SessionManager
} from "@mariozechner/pi-coding-agent"
import { serve } from "@hono/node-server"
import {
	type SchedulerExecutor,
	SchedulerService,
	createSqliteStore
} from "@hybrd/scheduler"
import { MemoryIndexManager, resolveMemoryConfig } from "@hybrd/memory"
import { Hono } from "hono"
import pc from "picocolors"
import { loadHybridConfig } from "../config/index.js"
import { resolveUserRole } from "../memory-tools.js"
import { loadSecrets } from "../lib/secret-store"
import { getOrCreateUserWorkspace } from "../lib/workspace"
import {
	isOnboardingComplete,
	recordBootstrapSeeded,
	recordOnboardingCompleted
} from "../lib/workspace-state"
import { recoverRequestSigner } from "../lib/sign.js"
import {
	initChatSdk,
	getChatInstance,
	shutdownChatSdk
} from "./chat-sdk.js"

// ============================================================================
// SECURITY: Load secrets from persistent volume into memory
// Secrets are file-based only — never in process.env
// ============================================================================
loadSecrets()

// PROJECT_ROOT was defined at the top


// Auto-configure OpenRouter if OPENROUTER_API_KEY is present
// See: https://openrouter.ai/docs/guides/guides/claude-code-integration
if (
	process.env.OPENROUTER_API_KEY &&
	(!process.env.ANTHROPIC_API_KEY ||
		process.env.ANTHROPIC_API_KEY === "" ||
		process.env.ANTHROPIC_API_KEY.includes("your_"))
) {
	process.env.ANTHROPIC_BASE_URL = "https://openrouter.ai/api"
	process.env.ANTHROPIC_AUTH_TOKEN = process.env.OPENROUTER_API_KEY
	process.env.ANTHROPIC_API_KEY = "" // Must be explicitly empty to prevent conflicts
}

const AGENT_PORT = Number.parseInt(process.env.AGENT_PORT || "8454")
const AGENT_ENDPOINT = "/api/chat"
const HEALTH_CHECK_PATH = "/health"
const DEBUG = process.env.DEBUG === "true" || process.env.DEBUG === "1"

function debug(...args: unknown[]) {
	if (DEBUG) console.log("[debug]", ...args)
}

const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED !== "false"
const SCHEDULER_POLL_MS = Number.parseInt(
	process.env.SCHEDULER_POLL_MS || "60000",
	10
)

let scheduler: SchedulerService | null = null

function getProviderInfo(): { provider: string; model: string } {
	const model = process.env.AGENT_MODEL
	const baseUrl = process.env.ANTHROPIC_BASE_URL
	if (baseUrl?.includes("openrouter.ai")) {
		return { provider: "openrouter", model: model || "anthropic/claude-sonnet-4" }
	}
	return { provider: "anthropic", model: model || "claude-sonnet-4-20250514" }
}

const SCHEDULER_DB_PATH =
	process.env.SCHEDULER_DB_PATH || join(PROJECT_ROOT, "data", "scheduler.db")

function loadMarkdownFile(relativePath: string): string {
	try {
		return readFileSync(join(PROJECT_ROOT, relativePath), "utf-8").trim()
	} catch {
		return ""
	}
}

function loadUserMarkdown(userId?: string): string {
	if (!userId) return loadMarkdownFile("USER.md")

	// Sanitize userId to prevent path traversal
	const sanitizedId = userId.replace(/[^a-zA-Z0-9_-]/g, "_")
	const userPath = join("users", sanitizedId, "USER.md")
	const userFile = loadMarkdownFile(userPath)

	return userFile || loadMarkdownFile("USER.md")
}

const IDENTITY_MD = loadMarkdownFile("IDENTITY.md")
const SOUL_MD = loadMarkdownFile("SOUL.md")
const AGENTS_MD = loadMarkdownFile("AGENTS.md")
const TOOLS_MD = loadMarkdownFile("TOOLS.md")
const BOOT_MD = loadMarkdownFile("BOOT.md")
const BOOTSTRAP_MD = loadMarkdownFile("BOOTSTRAP.md")

let cachedConfig: Awaited<ReturnType<typeof loadHybridConfig>>["config"] | null = null

async function getCachedConfig() {
	if (!cachedConfig) {
		const result = await loadHybridConfig(PROJECT_ROOT)
		cachedConfig = result.config
	}
	return cachedConfig
}
const HEARTBEAT_MD = loadMarkdownFile("HEARTBEAT.md")

const BOOTSTRAP_EXISTS = BOOTSTRAP_MD.length > 0

const AGENT_NAME = process.env.AGENT_NAME || "hybrid-agent"

async function shouldRunOnboarding(userId?: string): Promise<boolean> {
	if (!BOOTSTRAP_EXISTS) return false

	// Check if onboarding has already been completed — prevents bootstrap
	// context from being injected forever after recordOnboardingCompleted() is called
	if (isOnboardingComplete(PROJECT_ROOT, BOOTSTRAP_EXISTS)) return false

	const { role } = await resolveUserRole(PROJECT_ROOT, userId || "anonymous")
	return role === "owner"
}

function isAgentOnboardingMode(): boolean {
	return (
		BOOTSTRAP_EXISTS && !isOnboardingComplete(PROJECT_ROOT, BOOTSTRAP_EXISTS)
	)
}

let memoryManager: Awaited<ReturnType<typeof MemoryIndexManager.get>> | null =
	null

async function initMemory() {
	try {
		const config = resolveMemoryConfig(
			{
				sources: ["memory", "sessions"],
				provider: "openai",
				fallback: "none"
			},
			AGENT_NAME
		)
		const manager = await MemoryIndexManager.get({
			agentId: AGENT_NAME,
			workspaceDir: PROJECT_ROOT,
			config
		})
		if (!manager) {
			console.log(`[memory] disabled (config.enabled=false)`)
			return
		}
		memoryManager = manager
		await manager.sync({ reason: "startup" })
		console.log(`[memory] initialized (${manager.status().files} files)`)
	} catch (err) {
		console.log(`[memory] disabled: ${(err as Error).message}`)
	}
}

async function initScheduler() {
	if (!SCHEDULER_ENABLED) {
		console.log(`[scheduler] disabled`)
		return
	}

	try {
		const { mkdirSync, existsSync } = await import("node:fs")
		const { dirname } = await import("node:path")

		// Ensure data directory exists
		const dbDir = dirname(SCHEDULER_DB_PATH)
		if (!existsSync(dbDir)) {
			mkdirSync(dbDir, { recursive: true })
		}

		console.log(`[scheduler] initializing store at ${SCHEDULER_DB_PATH}...`)
		const store = await createSqliteStore({ dbPath: SCHEDULER_DB_PATH })
		console.log(`[scheduler] store initialized`)

		const executor: SchedulerExecutor = {
			runAgentTurn: async (job) => {
				console.log(`[scheduler] Running agent turn: ${job.name}`)

				const message =
					job.payload.kind === "agentTurn" ? job.payload.message : ""
				const response = await fetch(
					`http://localhost:${AGENT_PORT}/api/chat`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							messages: [
								{
									id: crypto.randomUUID(),
									role: "user" as const,
									content: message
								}
							],
							chatId: job.sessionKey || `scheduled-${job.id}`
						})
					}
				)

				if (!response.ok) {
					return {
						status: "error" as const,
						error: `Agent returned ${response.status}`
					}
				}

				const reader = response.body?.getReader()
				const decoder = new TextDecoder()
				let result = ""

				while (reader) {
					const { done, value } = await reader.read()
					if (done) break

					for (const line of decoder.decode(value).split("\n")) {
						if (line.startsWith("data: ") && line !== "data: [DONE]") {
							try {
								const p = JSON.parse(line.slice(6))
								if (p.type === "text" && p.content) result += p.content
							} catch {}
						}
					}
				}

				return { status: "ok" as const, summary: result.slice(0, 500) }
			},

			runSystemEvent: async (job) => {
				console.log(`[scheduler] Running system event: ${job.name}`)
				return { status: "ok" as const }
			}
		}

		const dispatcher = {
			dispatch: async (params: {
				channel: string
				to: string
				message: string
			}) => {
				const bot = getChatInstance()
				if (!bot) {
					return {
						delivered: false,
						error: "Chat SDK not initialized"
					}
				}
				// Chat SDK handles outbound delivery via thread.post()
				// For scheduled announcements, we'd need to look up the thread
				// and post to it. For now, log and return success.
				console.log(
					`[scheduler] dispatch to ${params.channel}:${params.to} — ${params.message.slice(0, 50)}`
				)
				return { delivered: true }
			}
		}

		scheduler = new SchedulerService({
			store,
			dispatcher,
			executor,
			enabled: true
		})
		await scheduler.start()
		console.log(`[scheduler] initialized`)
	} catch (err) {
		console.log(`[scheduler] disabled: ${(err as Error).message}`)
		console.error(`[scheduler] error stack:`, (err as Error).stack)
	}
}

async function searchMemory(
	query: string,
	userId?: string,
	conversationId?: string
) {
	if (!memoryManager) return null
	try {
		let scope:
			| { type: "global" }
			| { type: "user"; userId: string }
			| { type: "conversation"; userId: string; conversationId: string }
			| undefined

		if (userId && conversationId) {
			scope = { type: "conversation", userId, conversationId }
		} else if (userId) {
			scope = { type: "user", userId }
		}

		const results = await memoryManager.search(query, {
			maxResults: 5,
			scope
		})
		if (results.length === 0) return null
		return results
			.map((r) => `${r.path}:${r.startLine}\n${r.snippet}`)
			.join("\n\n---\n\n")
	} catch (err) {
		console.error(`[memory] search error: ${(err as Error).message}`)
		return null
	}
}

interface ContainerRequest {
	messages: Array<{
		id: string
		role: "system" | "user" | "assistant"
		content: string
	}>
	chatId: string
	userId?: string
	teamId?: string
	systemPrompt?: string
	conversationId?: string
	channel?: string
}

function encodeSSE(data: string): Uint8Array {
	return new TextEncoder().encode(`data: ${data}\n\n`)
}

function encodeSSEJson(data: unknown): Uint8Array {
	return encodeSSE(JSON.stringify(data))
}

function encodeDone(): Uint8Array {
	return new TextEncoder().encode("data: [DONE]\n\n")
}

const HISTORY_TAIL_SIZE = 20

function buildPromptWithHistory(
	messages: ContainerRequest["messages"]
): string {
	// Guard against invalid input
	if (!Array.isArray(messages) || messages.length === 0) {
		return ""
	}

	if (messages.length <= 1) {
		return messages.at(-1)?.content ?? ""
	}

	const currentMessage = messages.at(-1)
	if (!currentMessage) return ""

	const priorMessages = messages.slice(0, -1)

	let historyMessages: ContainerRequest["messages"]
	if (priorMessages.length <= HISTORY_TAIL_SIZE) {
		historyMessages = priorMessages
	} else {
		const tail = priorMessages.slice(-HISTORY_TAIL_SIZE + 1)
		const first = priorMessages.slice(0, 1)
		const omitted: ContainerRequest["messages"] = [
			{
				id: "",
				role: "system",
				content: `... ${priorMessages.length - HISTORY_TAIL_SIZE} earlier messages omitted ...`
			}
		]
		historyMessages = [...first, ...omitted, ...tail]
	}

	const historyBlock = historyMessages
		.map((m) => `[${m.role}]: ${m.content}`)
		.join("\n\n")

	return `<conversation_history>
${historyBlock}
</conversation_history>

${currentMessage.content}`
}

async function runAgent(
	req: ContainerRequest
): Promise<ReadableStream<Uint8Array>> {
	if (isAgentOnboardingMode() && !(await shouldRunOnboarding(req.userId))) {
		const message =
			"This agent is currently being set up. Please try again later."
		console.log(
			`[agent] Rejected non-owner request during onboarding (userId: ${req.userId})`
		)
		return new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encodeSSEJson({ type: "text", content: message }))
				controller.enqueue(encodeDone())
				controller.close()
			}
		})
	}

	if (BOOTSTRAP_EXISTS && (await shouldRunOnboarding(req.userId))) {
		recordBootstrapSeeded(PROJECT_ROOT)
	}

	const lastMessage = req.messages.at(-1)?.content || ""

	const memoryContext = lastMessage
		? await searchMemory(lastMessage, req.userId, req.chatId)
		: null

	const now = new Date()
	const currentTime = `## Current Time

The current date and time is: ${now.toISOString()}
- ISO format: ${now.toISOString()}
- Local: ${now.toLocaleString()}
- Unix timestamp (ms): ${now.getTime()}

When scheduling tasks, calculate the target time relative to the current time above.`

	// Sanitize conversationId to prevent prompt injection
	const sanitizedConversationId = req.conversationId
		? req.conversationId.replace(/[^a-zA-Z0-9_:=-]/g, "")
		: undefined

	const rawChannel = req.channel || "web"
	const channel = rawChannel.replace(/[^a-zA-Z0-9_-]/g, "")

	const conversationContext = sanitizedConversationId
		? `## Conversation Context

- Conversation ID: ${sanitizedConversationId}
- Channel: ${channel}

When scheduling reminders, include delivery info to send the message back to this conversation:
\`\`\`json
{
  "name": "Reminder name",
  "schedule": { "kind": "at", "at": "<ISO timestamp>" },
  "payload": { "kind": "agentTurn", "message": "Your reminder message" },
  "delivery": { "mode": "announce", "channel": "${channel}", "to": "${sanitizedConversationId}" }
}
\`\`\`

**CRITICAL**: When responding about a scheduled reminder:
- NEVER show ISO timestamps, Unix time, or technical formats
- NEVER say "Current time is 2026-03-02T..."
- ONLY say things like "in 1 minute" or "at 4:30 PM"
- Keep it SHORT: "Got it! I'll remind you in 1 minute"`
		: ""

	const PLAINTEXT_CHANNELS = new Set(["whatsapp", "sms"])
	const channelFormatting = PLAINTEXT_CHANNELS.has(channel)
		? `## Channel Formatting (${channel})

You are responding on ${channel}, which renders plain text only. Follow these rules strictly:
- Do NOT use markdown formatting (no #, ##, **, *, -, backticks, code blocks, etc.)
- Write in plain, natural language
- Use line breaks for separation instead of headers
- Use simple dashes or numbers for lists (not markdown bullets)
- Spell out emphasis naturally instead of using bold/italic
- Never mention tool calls, tool names, or internal processes in your response
- Keep responses concise and conversational`
		: ""

	const USER_MD = loadUserMarkdown(req.userId)

	const bootstrapContext =
		BOOTSTRAP_EXISTS && (await shouldRunOnboarding(req.userId))
			? `\n\n## BOOTSTRAP.md\n\n${BOOTSTRAP_MD}`
			: ""

	const systemPromptParts = [
		IDENTITY_MD,
		SOUL_MD,
		req.systemPrompt,
		AGENTS_MD,
		TOOLS_MD,
		USER_MD,
		channelFormatting,
		currentTime,
		conversationContext,
		bootstrapContext
	]
	if (memoryContext) {
		systemPromptParts.push(`\n\n## Relevant Memory\n\n${memoryContext}`)
	}
	const systemPrompt = systemPromptParts.filter(Boolean).join("\n\n")
	const prompt = buildPromptWithHistory(req.messages)

	const abortController = new AbortController()

	const baseUrl = process.env.ANTHROPIC_BASE_URL
	const isUsingOpenRouter = baseUrl?.includes("openrouter.ai")
	const authToken =
		process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.OPENROUTER_API_KEY
	const apiKey = process.env.ANTHROPIC_API_KEY
	const model = process.env.AGENT_MODEL || (isUsingOpenRouter ? "anthropic/claude-sonnet-4" : "claude-sonnet-4-20250514")

	// Validate API configuration
	if (!apiKey && !authToken) {
		const error =
			"No API key configured. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY"
		console.error(`[agent] ${error}`)
		return new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encodeSSEJson({ type: "error", content: error }))
				controller.enqueue(encodeDone())
				controller.close()
			}
		})
	}

	// For OpenRouter, authToken is required but apiKey should be empty
	if (isUsingOpenRouter && !authToken) {
		const error =
			"OpenRouter requires ANTHROPIC_AUTH_TOKEN (set OPENROUTER_API_KEY)"
		console.error(`[agent] ${error}`)
		return new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encodeSSEJson({ type: "error", content: error }))
				controller.enqueue(encodeDone())
				controller.close()
			}
		})
	}

	// For direct Anthropic, apiKey is required
	if (!isUsingOpenRouter && !apiKey) {
		const error = "Anthropic requires ANTHROPIC_API_KEY"
		console.error(`[agent] ${error}`)
		return new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encodeSSEJson({ type: "error", content: error }))
				controller.enqueue(encodeDone())
				controller.close()
			}
		})
	}

	debug("API config:", {
		baseUrl: baseUrl || "(default Anthropic)",
		model,
		hasAuthToken: !!authToken,
		hasApiKey: !!apiKey
	})

	// Get or create isolated workspace for user
	const { workspaceDir } = await getOrCreateUserWorkspace(
		req.userId || "anonymous"
	)

	// Set up Pi SDK dependencies
	const authStorage = AuthStorage.create()
	if (isUsingOpenRouter) {
		if (authToken) authStorage.setRuntimeApiKey("openrouter", authToken)
	} else {
		if (apiKey) authStorage.setRuntimeApiKey("anthropic", apiKey)
	}

	const modelRegistry = ModelRegistry.create(authStorage)
	const providerKey = isUsingOpenRouter ? "openrouter" : "anthropic"
	const activeModel = modelRegistry.find(providerKey, model)
	if (!activeModel) {
		const errorMsg = `Model ${model} not found for provider ${providerKey}`
		console.error(`[agent] initialization failed: ${errorMsg}`)
		return new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encodeSSEJson({ type: "error", content: errorMsg }))
				controller.enqueue(encodeDone())
				controller.close()
			}
		})
	}

	const config = await getCachedConfig()

	// Currently ignoring MCP servers for now but they can be passed as config
	// MCP support in Pi may require mapping custom tools, or Settings.

	let messageCount = 0
	let hasStreamedText = false
	
	// Timing metrics
	const startTime = Date.now()
	let ttfb = 0
	let endOfLlmTime = 0

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			;(async () => {
				try {
					const { session } = await createAgentSession({
						cwd: workspaceDir,
						model: activeModel,
						authStorage,
						modelRegistry,
						sessionManager: SessionManager.inMemory(),
						// Bypass settings if needed or load default
					})
					
					// Inject the system prompt override
					// Typically done via a ResourceLoader, but we can do it via prompt context if needed.
					// Or just inject it directly to the session memory.
					await session.steer(`[System Instruction Override]\n${systemPrompt}`)

					session.subscribe((event) => {
						messageCount++
						
						// Capture TTFB on first meaningful generation event
						if (!ttfb && event.type === "message_update" && event.assistantMessageEvent) {
							ttfb = Date.now() - startTime
						}

						if (event.type === "message_update" && event.assistantMessageEvent) {
							const ev = event.assistantMessageEvent
							if (ev.type === "text_delta") {
								hasStreamedText = true
								controller.enqueue(encodeSSEJson({ type: "text", content: ev.delta }))
							} else if (ev.type === "toolcall_start") {
								const block = (ev as any).partial?.content?.[(ev as any).contentIndex]
								const toolName = block?.name || "unknown"
								const toolCallId = block?.id || ""
								console.log(`${pc.cyan("[agent]")} 🔧 tool: ${pc.yellow(toolName)}`)
								controller.enqueue(
									encodeSSEJson({
										type: "tool-call-start",
										toolCallId: toolCallId,
										toolName: toolName
									})
								)
							} else if (ev.type === "toolcall_delta") {
								const block = (ev as any).partial?.content?.[(ev as any).contentIndex]
								const toolCallId = block?.id || ""
								controller.enqueue(
									encodeSSEJson({
										type: "tool-call-delta",
										toolCallId: toolCallId,
										argsTextDelta: (ev as any).delta || ""
									})
								)
							} else if (ev.type === "toolcall_end") {
								const toolCallId = (ev as any).toolCall?.id || ""
								controller.enqueue(
									encodeSSEJson({
										type: "tool-call-end",
										toolCallId: toolCallId
									})
								)
							}
						}
					})

					// Dispatch the actual completion logic
					await session.prompt(prompt)
					endOfLlmTime = Date.now()

					const { getLastAssistantUsage } = await import("@mariozechner/pi-coding-agent")
					const usage = getLastAssistantUsage(session)
					const totalTime = endOfLlmTime - startTime
					const latency = ttfb ? endOfLlmTime - startTime - ttfb : 0

					// After completion, send the usage telemetry
					console.log(
						`\n${pc.green("[agent]")} ${pc.bold("✓")} done ${pc.gray(`${messageCount} events`)} ${usage ? pc.gray(`| ${usage.input} in / ${usage.output} out`) : ""}`
					)
					
					controller.enqueue(
						encodeSSEJson({
							type: "usage",
							inputTokens: usage?.input ?? 0,
							outputTokens: usage?.output ?? 0,
							totalCostUsd: usage?.cost?.total ?? 0,
							numTurns: 1,
							telemetry: {
								ttfbMs: ttfb,
								totalMs: totalTime,
								llmLatencyMs: latency,
							}
						})
					)

					controller.enqueue(encodeDone())
					controller.close()

					if (BOOTSTRAP_EXISTS && (await shouldRunOnboarding(req.userId))) {
						const bootstrapStillExists =
							loadMarkdownFile("BOOTSTRAP.md").length > 0
						if (!bootstrapStillExists) {
							console.log(
								`${pc.green("[agent]")} ${pc.bold("✓")} onboarding complete`
							)
							recordOnboardingCompleted(PROJECT_ROOT)
						}
					}
				} catch (err) {
					const errorMessage =
						err instanceof Error ? err.message : "Agent error"
					console.error(`[agent] error in stream:`, err)

					try {
						controller.enqueue(
							encodeSSEJson({ type: "error", content: errorMessage })
						)
						controller.enqueue(encodeDone())
						controller.close()
					} catch {
						// Stream already cancelled
					}
				}
			})()
		},
		cancel() {
			console.log("[agent] stream cancelled")
			abortController.abort()
		}
	})

	return stream
}

const app = new Hono()

app.get(HEALTH_CHECK_PATH, (c) => {
	return c.json({ status: "healthy" })
})

app.post(AGENT_ENDPOINT, async (c) => {
	const requestId = c.req.header("X-Request-ID") || "unknown"
	const source = c.req.header("X-Source") || "unknown"

	// ── Key-based authentication ──────────────────────────────────────────
	// If the request is signed, recover the signer address and use it as userId.
	// This overrides any userId in the body, so users can't impersonate others.
	const signedBody = await c.req.text()
	const signature = c.req.header("X-Signature")
	let authenticatedUserId: string | null = null

	if (signature) {
		const recovered = await recoverRequestSigner(signedBody, signature)
		if (recovered) {
			authenticatedUserId = recovered
			debug("[auth] recovered address:", recovered)
		} else {
			debug("[auth] signature verification failed")
		}
	}

	// Parse the request body (now we need to parse from the text we already read)
	let req: ContainerRequest
	try {
		req = JSON.parse(signedBody)
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400)
	}

	// Validate request structure
	if (!Array.isArray(req.messages)) {
		return c.json({ error: "messages must be an array" }, 400)
	}

	if (!req.chatId || typeof req.chatId !== "string") {
		return c.json({ error: "chatId is required" }, 400)
	}

	const preview = req.messages.at(-1)?.content?.slice(0, 50) || ""
	console.log()
	console.log(
		`${pc.cyan("[agent]")} ${pc.bold("←")} ${source} ${pc.gray(`(${req.messages.length} msgs)`)}`
	)
	if (preview)
		console.log(
			`${pc.gray("  └")} "${preview}${preview.length >= 50 ? "..." : ""}"`
		)

	// Override userId with authenticated address if signature was valid
	// This prevents clients from impersonating other users
	if (authenticatedUserId) {
		req.userId = authenticatedUserId
	}

	const stream = await runAgent(req)

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive"
		}
	})
})

app.all("/api/webhooks/slack", async (c) => {
	const bot = getChatInstance()
	if (!bot) return c.json({ error: "chat-sdk not initialized" }, 503)
	return bot.webhooks.slack(c.req.raw)
})

app.all("/api/webhooks/discord", async (c) => {
	const bot = getChatInstance()
	if (!bot) return c.json({ error: "chat-sdk not initialized" }, 503)
	return bot.webhooks.discord(c.req.raw)
})

app.all("/api/webhooks/linear", async (c) => {
	const bot = getChatInstance()
	if (!bot) return c.json({ error: "chat-sdk not initialized" }, 503)
	return bot.webhooks.linear(c.req.raw)
})

process.on("uncaughtException", (err) => {
	console.error("[agent] uncaughtException:", err)
	process.exit(1)
})

process.on("unhandledRejection", (reason) => {
	console.error("[agent] unhandledRejection:", reason)
	process.exit(1)
})

function printStartup() {

	const { provider, model } = getProviderInfo()

	const baseUrl = process.env.ANTHROPIC_BASE_URL
	const isUsingOpenRouter = baseUrl?.includes("openrouter.ai")
	const authToken =
		process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.OPENROUTER_API_KEY
	const apiKey = process.env.ANTHROPIC_API_KEY

	console.log("\n  ╭──────────────────────────────────────────────────╮")
	console.log("  │              Hybrid Agent Server                 │")
	console.log("  ╰──────────────────────────────────────────────────╯")
	console.log()
	console.log(`  Server      http://localhost:${AGENT_PORT}`)
	console.log(`  Health      http://localhost:${AGENT_PORT}/health`)
	console.log(`  Chat        http://localhost:${AGENT_PORT}${AGENT_ENDPOINT}`)
	console.log(
		`    HEARTBEAT.md          ${HEARTBEAT_MD ? "✓ loaded" : "✗ not found"}`
	)

	console.log()
	console.log("  ─────────────────────────────────────────────────")
	console.log()
	console.log("  SDK Configuration (passed to Claude):")
	if (isUsingOpenRouter) {
		console.log("    Mode: OpenRouter")
		console.log(`    ANTHROPIC_BASE_URL:   ${baseUrl}`)
		console.log(
			`    ANTHROPIC_AUTH_TOKEN: ${authToken ? `***${authToken.slice(-4)}` : "✗ missing"}`
		)
		console.log(`    ANTHROPIC_API_KEY:    "" (empty for OpenRouter)`)
		if (!authToken) {
			console.log()
			console.log("    ⚠️  ERROR: OPENROUTER_API_KEY must be set")
		}
	} else {
		console.log("    Mode: Anthropic Direct")
		console.log(`    ANTHROPIC_BASE_URL:   (default)`)
		console.log(
			`    ANTHROPIC_API_KEY:    ${apiKey ? `***${apiKey.slice(-4)}` : "✗ missing"}`
		)
		if (!apiKey) {
			console.log()
			console.log("    ⚠️  ERROR: ANTHROPIC_API_KEY must be set")
		}
	}

	console.log()
	console.log("  ─────────────────────────────────────────────────")
	console.log()
	console.log()
	console.log("  ─────────────────────────────────────────────────")
	console.log()
	console.log(`  Scheduler   ${SCHEDULER_ENABLED ? "✓ enabled" : "✗ disabled"}`)
	if (SCHEDULER_ENABLED) {
		console.log(`  Sched DB    ${SCHEDULER_DB_PATH}`)
	}
	console.log()
	console.log("  ─────────────────────────────────────────────────")
	console.log()
	console.log("  Ready. Waiting for requests...")
	console.log()
}

printStartup()
Promise.all([initMemory(), initScheduler()]).then(async () => {
	const config = await getCachedConfig()

	await initChatSdk(
		{
			projectRoot: PROJECT_ROOT,
			agentName: AGENT_NAME,
			runAgentTurn: async (params) => {
				const agentReq: ContainerRequest = {
					messages: params.messages as ContainerRequest["messages"],
					chatId: params.chatId,
					userId: params.userId,
					conversationId: params.conversationId,
					channel: params.channel
				}
				const stream = await runAgent(agentReq)
				const reader = stream.getReader()
				const decoder = new TextDecoder()
				let buffer = ""
				return (async function* () {
					while (true) {
						const { done, value } = await reader.read()
						if (done) {
							// Flush remaining buffer
							if (buffer.trim()) {
								const line = buffer.trim()
								if (line.startsWith("data: ") && line !== "data: [DONE]") {
									try {
										const parsed = JSON.parse(line.slice(6))
										if (parsed.type === "text" && parsed.content) {
											yield parsed.content
										}
									} catch {}
								}
							}
							break
						}
						const text = decoder.decode(value, { stream: true })
						buffer += text
						const lines = buffer.split("\n")
						// Keep the last (possibly incomplete) line in the buffer
						buffer = lines.pop() || ""
						for (const line of lines) {
							const trimmed = line.trim()
							if (trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
								try {
									const parsed = JSON.parse(trimmed.slice(6))
									if (parsed.type === "text" && parsed.content) {
										yield parsed.content
									}
								} catch {}
							}
						}
					}
				})()
			}
		},
		config.chatSdk
	)

	if (config.chatSdk?.enabled) {
		console.log()
		console.log(`  ${pc.bold("Chat SDK Webhooks (local)")}`)
		console.log(`  ${pc.gray("─────────────────────────────────")}`)
		if (config.chatSdk.providers?.slack?.enabled) {
			console.log(`  Slack    http://localhost:${AGENT_PORT}/api/webhooks/slack`)
		}
		if (config.chatSdk.providers?.discord?.enabled) {
			console.log(`  Discord  http://localhost:${AGENT_PORT}/api/webhooks/discord`)
		}
		if (config.chatSdk.providers?.linear?.enabled) {
			console.log(`  Linear   http://localhost:${AGENT_PORT}/api/webhooks/linear`)
		}
		console.log()
		console.log(`  ${pc.bold("ngrok tunnel (for external webhooks)")}`)
		console.log(`  ${pc.gray("─────────────────────────────────")}`)
		console.log(`  ngrok http ${AGENT_PORT}`)
		console.log(`  Then set webhook URLs on platforms to: https://<ngrok-id>.ngrok-free.app/api/webhooks/<channel>`)
		console.log()
	}

	serve({ hostname: "0.0.0.0", port: AGENT_PORT, fetch: app.fetch })
})

export default app
