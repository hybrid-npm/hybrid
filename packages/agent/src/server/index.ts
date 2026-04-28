import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import dotenv from "dotenv"

const PROJECT_ROOT = process.env.AGENT_PROJECT_ROOT || process.cwd()
for (const f of [".env", ".env.local"]) {
	const p = join(PROJECT_ROOT, f)
	if (existsSync(p)) dotenv.config({ path: p })
}

import {
	AuthStorage,
	createAgentSession,
	SessionManager,
	ModelRegistry
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

loadSecrets()

// Auto-configure OpenRouter if OPENROUTER_API_KEY is present
if (
	process.env.OPENROUTER_API_KEY &&
	(!process.env.ANTHROPIC_API_KEY ||
		process.env.ANTHROPIC_API_KEY === "" ||
		process.env.ANTHROPIC_API_KEY.includes("your_"))
) {
	process.env.ANTHROPIC_BASE_URL = "https://openrouter.ai/api"
	process.env.ANTHROPIC_AUTH_TOKEN = process.env.OPENROUTER_API_KEY
	process.env.ANTHROPIC_API_KEY = ""
}

const AGENT_PORT = Number.parseInt(process.env.AGENT_PORT || "8454")
const AGENT_ENDPOINT = "/api/chat"
const HEALTH_CHECK_PATH = "/health"
const DEBUG = process.env.DEBUG === "true" || process.env.DEBUG === "1"

function debug(...args: unknown[]) {
	if (DEBUG) console.log("[debug]", ...args)
}

const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED !== "false"

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
const HEARTBEAT_MD = loadMarkdownFile("HEARTBEAT.md")

let cachedConfig: Awaited<ReturnType<typeof loadHybridConfig>>["config"] | null = null

async function getCachedConfig() {
	if (!cachedConfig) {
		const result = await loadHybridConfig(PROJECT_ROOT)
		cachedConfig = result.config
	}
	return cachedConfig
}

const BOOTSTRAP_EXISTS = BOOTSTRAP_MD.length > 0
const AGENT_NAME = process.env.AGENT_NAME || "hybrid-agent"

async function shouldRunOnboarding(userId?: string): Promise<boolean> {
	if (!BOOTSTRAP_EXISTS) return false
	if (isOnboardingComplete(PROJECT_ROOT, BOOTSTRAP_EXISTS)) return false
	const { role } = await resolveUserRole(PROJECT_ROOT, userId || "anonymous")
	return role === "owner"
}

function isAgentOnboardingMode(): boolean {
	return BOOTSTRAP_EXISTS && !isOnboardingComplete(PROJECT_ROOT, BOOTSTRAP_EXISTS)
}

let memoryManager: Awaited<ReturnType<typeof MemoryIndexManager.get>> | null = null

async function initMemory() {
	try {
		const config = resolveMemoryConfig(
			{ sources: ["memory", "sessions"], provider: "openai", fallback: "none" },
			AGENT_NAME
		)
		const manager = await MemoryIndexManager.get({ agentId: AGENT_NAME, workspaceDir: PROJECT_ROOT, config })
		if (!manager) { console.log(`[memory] disabled`); return }
		memoryManager = manager
		await manager.sync({ reason: "startup" })
		console.log(`[memory] initialized (${manager.status().files} files)`)
	} catch (err) { console.log(`[memory] disabled: ${(err as Error).message}`) }
}

async function initScheduler() {
	if (!SCHEDULER_ENABLED) { console.log(`[scheduler] disabled`); return }
	try {
		const { mkdirSync, existsSync } = await import("node:fs")
		const { dirname } = await import("node:path")
		const dbDir = dirname(SCHEDULER_DB_PATH)
		if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })

		const store = await createSqliteStore({ dbPath: SCHEDULER_DB_PATH })

		const executor: SchedulerExecutor = {
			runAgentTurn: async (job) => {
				const message = job.payload.kind === "agentTurn" ? job.payload.message : ""
				const response = await fetch(`http://localhost:${AGENT_PORT}/api/chat`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ messages: [{ id: crypto.randomUUID(), role: "user" as const, content: message }], chatId: job.sessionKey || `scheduled-${job.id}` })
				})
				if (!response.ok) return { status: "error" as const, error: `Agent returned ${response.status}` }
				const reader = response.body?.getReader()
				const decoder = new TextDecoder()
				let result = ""
				if (reader) {
					while (true) {
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
				}
				return { status: "ok" as const, summary: result.slice(0, 500) }
			},
			runSystemEvent: async () => ({ status: "ok" as const })
		}

		const dispatcher = {
			dispatch: async (params: { channel: string; to: string; message: string }) => {
				const bot = getChatInstance()
				if (!bot) return { delivered: false, error: "Chat SDK not initialized" }
				console.log(`[scheduler] dispatch to ${params.channel}:${params.to} — ${params.message.slice(0, 50)}`)
				return { delivered: true }
			}
		}

		const scheduler = new SchedulerService({ store, dispatcher, executor, enabled: true })
		await scheduler.start()
		console.log(`[scheduler] initialized`)
	} catch (err) { console.log(`[scheduler] disabled: ${(err as Error).message}`) }
}

async function searchMemory(query: string, userId?: string, conversationId?: string) {
	if (!memoryManager) return null
	try {
		let scope: { type: "global" } | { type: "user"; userId: string } | { type: "conversation"; userId: string; conversationId: string } | undefined
		if (userId && conversationId) scope = { type: "conversation", userId, conversationId }
		else if (userId) scope = { type: "user", userId }
		const results = await memoryManager.search(query, { maxResults: 5, scope })
		if (results.length === 0) return null
		return results.map((r) => `${r.path}:${r.startLine}\n${r.snippet}`).join("\n\n---\n\n")
	} catch (err) { console.error(`[memory] search error: ${(err as Error).message}`); return null }
}

interface ContainerRequest {
	messages: Array<{ id: string; role: "system" | "user" | "assistant"; content: string }>
	chatId: string
	userId?: string
	teamId?: string
	systemPrompt?: string
	conversationId?: string
	channel?: string
}

function encodeSSEJson(data: unknown): Uint8Array {
	return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

function encodeDone(): Uint8Array {
	return new TextEncoder().encode("data: [DONE]\n\n")
}

const HISTORY_TAIL_SIZE = 20

function buildPromptWithHistory(messages: ContainerRequest["messages"]): string {
	if (!Array.isArray(messages) || messages.length === 0) return ""
	if (messages.length <= 1) return messages.at(-1)?.content ?? ""
	const currentMessage = messages.at(-1)!
	const priorMessages = messages.slice(0, -1)
	let historyMessages: ContainerRequest["messages"]
	if (priorMessages.length <= HISTORY_TAIL_SIZE) {
		historyMessages = priorMessages
	} else {
		const tail = priorMessages.slice(-HISTORY_TAIL_SIZE + 1)
		const first = priorMessages.slice(0, 1)
		historyMessages = [
			...first,
			{ id: "", role: "system", content: `... ${priorMessages.length - HISTORY_TAIL_SIZE} earlier messages omitted ...` },
			...tail,
		]
	}
	const historyBlock = historyMessages.map((m) => `[${m.role}]: ${m.content}`).join("\n\n")
	return `<conversation_history>\n${historyBlock}\n</conversation_history>\n\n${currentMessage.content}`
}

async function runAgent(req: ContainerRequest): Promise<ReadableStream<Uint8Array>> {
	if (isAgentOnboardingMode() && !(await shouldRunOnboarding(req.userId))) {
		return new ReadableStream<Uint8Array>({
			start(c) { c.enqueue(encodeSSEJson({ type: "text", content: "This agent is currently being set up. Please try again later." })); c.enqueue(encodeDone()); c.close() }
		})
	}
	if (BOOTSTRAP_EXISTS && (await shouldRunOnboarding(req.userId))) {
		recordBootstrapSeeded(PROJECT_ROOT)
	}

	const lastMessage = req.messages.at(-1)?.content || ""
	const memoryContext = lastMessage ? await searchMemory(lastMessage, req.userId, req.chatId) : null
	const now = new Date()
	const currentTime = `## Current Time\n\nThe current date and time is: ${now.toISOString()}
- ISO format: ${now.toISOString()}
- Local: ${now.toLocaleString()}
- Unix timestamp (ms): ${now.getTime()}`
	const sanitizedConversationId = req.conversationId ? req.conversationId.replace(/[^a-zA-Z0-9_:=-]/g, "") : undefined
	const rawChannel = req.channel || "web"
	const channel = rawChannel.replace(/[^a-zA-Z0-9_-]/g, "")
	const conversationContext = sanitizedConversationId
		? `## Conversation Context\n\n- Conversation ID: ${sanitizedConversationId}\n- Channel: ${channel}`
		: ""
	const USER_MD = loadUserMarkdown(req.userId)
	const bootstrapContext = BOOTSTRAP_EXISTS && (await shouldRunOnboarding(req.userId)) ? `\n\n## BOOTSTRAP.md\n\n${BOOTSTRAP_MD}` : ""

	const systemPrompt = [IDENTITY_MD, SOUL_MD, req.systemPrompt, AGENTS_MD, TOOLS_MD, USER_MD, currentTime, conversationContext, bootstrapContext, memoryContext ? `\n\n## Relevant Memory\n\n${memoryContext}` : ""].filter(Boolean).join("\n\n")
	const prompt = buildPromptWithHistory(req.messages)
	const abortController = new AbortController()

	const baseUrl = process.env.ANTHROPIC_BASE_URL
	const isUsingOpenRouter = baseUrl?.includes("openrouter.ai")
	const authToken = process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.OPENROUTER_API_KEY
	const apiKey = process.env.ANTHROPIC_API_KEY
	const model = process.env.AGENT_MODEL || (isUsingOpenRouter ? "anthropic/claude-sonnet-4" : "claude-sonnet-4-20250514")

	if (!apiKey && !authToken) {
		return new ReadableStream<Uint8Array>({
			start(c) { c.enqueue(encodeSSEJson({ type: "error", content: "No API key configured" })); c.enqueue(encodeDone()); c.close() }
		})
	}
	if (isUsingOpenRouter && !authToken) {
		return new ReadableStream<Uint8Array>({
			start(c) { c.enqueue(encodeSSEJson({ type: "error", content: "OpenRouter requires ANTHROPIC_AUTH_TOKEN" })); c.enqueue(encodeDone()); c.close() }
		})
	}
	if (!isUsingOpenRouter && !apiKey) {
		return new ReadableStream<Uint8Array>({
			start(c) { c.enqueue(encodeSSEJson({ type: "error", content: "Anthropic requires ANTHROPIC_API_KEY" })); c.enqueue(encodeDone()); c.close() }
		})
	}

	const { workspaceDir } = await getOrCreateUserWorkspace(req.userId || "anonymous")
	const authStorage = AuthStorage.create()
	if (isUsingOpenRouter) { if (authToken) authStorage.setRuntimeApiKey("openrouter", authToken) }
	else { if (apiKey) authStorage.setRuntimeApiKey("anthropic", apiKey) }

	const config = await getCachedConfig()
	const modelRegistry = ModelRegistry.create(authStorage)
	const activeModel = modelRegistry.getAll().find((m) => m.id === model)
	if (!activeModel) {
		return new ReadableStream<Uint8Array>({
			start(c) { c.enqueue(encodeSSEJson({ type: "error", content: `Model ${model} not found` })); c.enqueue(encodeDone()); c.close() }
		})
	}

	// Build custom tools
	const { createCustomTools } = await import("./mcp-factory.js")
	const customTools = await createCustomTools({ projectRoot: PROJECT_ROOT, userId: req.userId || "anonymous", scheduler: scheduler ?? undefined }, config?.mcpServers)

	const startTime = Date.now()
	let ttfb = 0
	let endOfLlmTime = 0

	// Set up the stream using a deferred promise that resolves when session.prompt() completes
	let sessionInstance: ReturnType<typeof createAgentSession> extends Promise<infer T> ? T : never | undefined

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				const sessionResult = await createAgentSession({
					cwd: workspaceDir,
					model: activeModel,
					authStorage,
					sessionManager: SessionManager.inMemory(),
					customTools,
				})
				const session = sessionResult.session
				sessionInstance = session as any

				// Buffer text and tool-call events from subscribe
				let textBuffer = ""
				let messageCount = 0

				session.subscribe((event) => {
					messageCount++
					try {
						if (!ttfb && event.type === "message_update" && event.assistantMessageEvent) {
							ttfb = Date.now() - startTime
						}
						if (event.type === "message_update" && event.assistantMessageEvent) {
							const ev = (event as any).assistantMessageEvent
							if (ev.type === "text_delta" && ev.delta) {
								textBuffer += ev.delta
								controller.enqueue(encodeSSEJson({ type: "text", content: ev.delta }))
							} else if (ev.type === "toolcall_start") {
								const block = ev.partial?.content?.[ev.contentIndex]
								controller.enqueue(encodeSSEJson({ type: "tool-call-start", toolCallId: block?.id ?? "", toolName: block?.name ?? "unknown" }))
							} else if (ev.type === "toolcall_delta") {
								const block = ev.partial?.content?.[ev.contentIndex]
								controller.enqueue(encodeSSEJson({ type: "tool-call-delta", toolCallId: block?.id ?? "", argsTextDelta: ev.delta ?? "" }))
							} else if (ev.type === "toolcall_end") {
								controller.enqueue(encodeSSEJson({ type: "tool-call-end", toolCallId: ev.toolCall?.id ?? "" }))
							}
						}
					} catch {
						// Stream already cancelled
					}
				})

				// Inject system prompt
				await session.steer(`[System Instruction Override]\n${systemPrompt}`)

				// Run the actual LLM call
				await session.prompt(prompt)
				endOfLlmTime = Date.now()

				const stats = session.getSessionStats()
				const totalTime = endOfLlmTime - startTime
				const latency = ttfb ? endOfLlmTime - startTime - ttfb : 0

				console.log(`${pc.green("[agent]")} ${pc.bold("✓")} done ${pc.gray(`${messageCount} events`)} ${pc.gray(`| ${stats.tokens.input} in / ${stats.tokens.output} out`)}`)

				controller.enqueue(encodeSSEJson({
					type: "usage",
					inputTokens: stats.tokens.input,
					outputTokens: stats.tokens.output,
					totalCostUsd: stats.cost,
					numTurns: 1,
					telemetry: { ttfbMs: ttfb, totalMs: totalTime, llmLatencyMs: latency }
				}))

				if (BOOTSTRAP_EXISTS && (await shouldRunOnboarding(req.userId))) {
					if (loadMarkdownFile("BOOTSTRAP.md").length === 0) {
						console.log(`${pc.green("[agent]")} ${pc.bold("✓")} onboarding complete`)
						recordOnboardingCompleted(PROJECT_ROOT)
					}
				}
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : "Agent error"
				console.error(`[agent] error in stream:`, err)
				try {
					controller.enqueue(encodeSSEJson({ type: "error", content: errorMessage }))
				} catch { /* closed */ }
			}

			controller.enqueue(encodeDone())
			try { controller.close() } catch { /* already closed */ }
		},
		cancel() {
			console.log("[agent] stream cancelled")
			abortController.abort()
		}
	})
}

const app = new Hono()
app.get(HEALTH_CHECK_PATH, (c) => c.json({ status: "healthy" }))

app.post(AGENT_ENDPOINT, async (c) => {
	const source = c.req.header("X-Source") || "unknown"
	const signedBody = await c.req.text()
	const signature = c.req.header("X-Signature")
	let authenticatedUserId: string | null = null
	if (signature) {
		const recovered = await recoverRequestSigner(signedBody, signature)
		if (recovered) { authenticatedUserId = recovered; debug("[auth] recovered address:", recovered) }
		else { debug("[auth] signature verification failed") }
	}
	let req: ContainerRequest
	try { req = JSON.parse(signedBody) } catch { return c.json({ error: "Invalid JSON body" }, 400) }
	if (!Array.isArray(req.messages)) return c.json({ error: "messages must be an array" }, 400)
	if (!req.chatId || typeof req.chatId !== "string") return c.json({ error: "chatId is required" }, 400)
	const preview = req.messages.at(-1)?.content?.slice(0, 50) || ""
	console.log()
	console.log(`${pc.cyan("[agent]")} ${pc.bold("←")} ${source} ${pc.gray(`(${req.messages.length} msgs)`)}`)
	if (preview) console.log(`${pc.gray("  └")} "${preview}${preview.length >= 50 ? "..." : ""}"`)
	if (authenticatedUserId) req.userId = authenticatedUserId
	const stream = await runAgent(req)
	return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } })
})

app.all("/api/webhooks/slack", async (c) => { const bot = getChatInstance(); if (!bot) return c.json({ error: "chat-sdk not initialized" }, 503); return bot.webhooks.slack(c.req.raw) })
app.all("/api/webhooks/discord", async (c) => { const bot = getChatInstance(); if (!bot) return c.json({ error: "chat-sdk not initialized" }, 503); return bot.webhooks.discord(c.req.raw) })
app.all("/api/webhooks/linear", async (c) => { const bot = getChatInstance(); if (!bot) return c.json({ error: "chat-sdk not initialized" }, 503); return bot.webhooks.linear(c.req.raw) })

process.on("uncaughtException", (err) => { console.error("[agent] uncaughtException:", err); process.exit(1) })
process.on("unhandledRejection", (reason) => { console.error("[agent] unUnhandledRejection:", reason); process.exit(1) })

let scheduler: SchedulerService | null = null

function printStartup() {
	const { provider, model } = getProviderInfo()
	console.log("\n  ╭──────────────────────────────────────────────────╮")
	console.log("  │              Hybrid Agent Server                 │")
	console.log("  ╰──────────────────────────────────────────────────╯")
	console.log()
	console.log(`  Server      http://localhost:${AGENT_PORT}`)
	console.log(`  Health      http://localhost:${AGENT_PORT}/health`)
	console.log(`  Chat        http://localhost:${AGENT_PORT}${AGENT_ENDPOINT}`)
	console.log(`    HEARTBEAT.md          ${HEARTBEAT_MD ? "✓ loaded" : "✗ not found"}`)
	console.log("  SDK Configuration:")
	console.log(`    Provider: ${provider}, Model: ${model}`)
}

printStartup()

Promise.all([initMemory(), initScheduler()]).then(async () => {
	const config = await getCachedConfig()

	await initChatSdk({
		projectRoot: PROJECT_ROOT,
		agentName: AGENT_NAME,
		runAgentTurn: async (params) => {
			const agentReq: ContainerRequest = { messages: params.messages as ContainerRequest["messages"], chatId: params.chatId, userId: params.userId, conversationId: params.conversationId, channel: params.channel }
			const stream = await runAgent(agentReq)
			const reader = stream.getReader()
			const decoder = new TextDecoder()
			let buffer = ""
			return (async function* () {
				while (true) {
					const { done, value } = await reader.read()
					if (done) { if (buffer.trim()) { const line = buffer.trim(); if (line.startsWith("data: ") && line !== "data: [DONE]") { try { const p = JSON.parse(line.slice(6)); if (p.type === "text" && p.content) yield p.content } catch {} } } break }
					const text = decoder.decode(value, { stream: true })
					buffer += text
					const lines = buffer.split("\n")
					buffer = lines.pop() || ""
					for (const line of lines) { if (line.startsWith("data: ") && line !== "data: [DONE]") { try { const p = JSON.parse(line.slice(6)); if (p.type === "text" && p.content) yield p.content } catch {} } }
				}
			})()
		}
	}, config.chatSdk)

	if (config.chatSdk?.enabled) {
		console.log(`  Chat SDK Webhooks:`)
		if (config.chatSdk.providers?.slack?.enabled) console.log(`  Slack    http://localhost:${AGENT_PORT}/api/webhooks/slack`)
		if (config.chatSdk.providers?.discord?.enabled) console.log(`  Discord  http://localhost:${AGENT_PORT}/api/webhooks/discord`)
		if (config.chatSdk.providers?.linear?.enabled) console.log(`  Linear   http://localhost:${AGENT_PORT}/api/webhooks/linear`)
	}

	serve({ hostname: "0.0.0.0", port: AGENT_PORT, fetch: app.fetch })
})

export default app
