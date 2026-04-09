import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
	type Options,
	createSdkMcpServer,
	query
} from "@anthropic-ai/claude-agent-sdk"
import { serve } from "@hono/node-server"
import {
	type SchedulerExecutor,
	SchedulerService,
	createSchedulerTools,
	createSqliteStore
} from "@hybrd/scheduler"
import { MemoryIndexManager, resolveMemoryConfig } from "@hybrd/memory"
import { Hono } from "hono"
import pc from "picocolors"
import { privateKeyToAccount } from "viem/accounts"
import { getWalletKey, hasSecret, loadSecrets } from "../lib/secret-store"
import { getOrCreateUserWorkspace } from "../lib/workspace"
import {
	isOnboardingComplete,
	recordBootstrapSeeded,
	recordOnboardingCompleted
} from "../lib/workspace-state"
import { createMemoryMcpServer, resolveUserRole } from "../memory-tools"
import { createSkillMcpServer } from "../skills/tools"

const _dirname =
	typeof __dirname !== "undefined"
		? __dirname
		: dirname(fileURLToPath(import.meta.url))

// ============================================================================
// SECURITY: Load secrets from persistent volume into memory
// Secrets are file-based only — never in process.env
// ============================================================================
loadSecrets()

const PROJECT_ROOT = process.env.AGENT_PROJECT_ROOT || process.cwd()

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

function getWalletAddress(): string | null {
	if (!hasSecret("AGENT_WALLET_KEY")) return null
	try {
		const key = getWalletKey()
		const keyWithPrefix = key.startsWith("0x")
			? (key as `0x${string}`)
			: (`0x${key}` as `0x${string}`)
		const account = privateKeyToAccount(keyWithPrefix)
		return account.address
	} catch {
		return null
	}
}

function getProviderInfo(): { provider: string; model: string } {
	const baseUrl = process.env.ANTHROPIC_BASE_URL
	if (baseUrl?.includes("openrouter.ai")) {
		return { provider: "OpenRouter", model: "claude-sonnet-4-20250514" }
	}
	return { provider: "Anthropic", model: "claude-sonnet-4-20250514" }
}

const CLAUDE_WRAPPER_PATH = "/usr/local/bin/claude-wrapper.sh"

function resolveClaudeCodeCliPath(): string {
	// Env var override
	if (process.env.CLAUDE_CODE_EXECUTABLE_PATH) {
		return process.env.CLAUDE_CODE_EXECUTABLE_PATH
	}

	// _dirname is either:
	// - /project/packages/agent/src/server (dev, tsx watch)
	// - /project/packages/agent/dist/server (prod, bundled)
	// - /app/server (Docker container)
	// We need to go up to find node_modules at project root
	const possiblePaths = [
		// Docker container: /app/server -> /app/node_modules
		join(
			_dirname,
			"..",
			"node_modules",
			"@anthropic-ai",
			"claude-agent-sdk",
			"cli.js"
		),
		// Dev/prod mode: from packages/agent/src/server or packages/agent/dist/server
		// both need 4 levels up to reach monorepo root node_modules
		join(
			_dirname,
			"..",
			"..",
			"..",
			"..",
			"node_modules",
			"@anthropic-ai",
			"claude-agent-sdk",
			"cli.js"
		),
		// pnpm hoisted location (dev)
		join(
			_dirname,
			"..",
			"..",
			"..",
			"..",
			"node_modules",
			".pnpm",
			"@anthropic-ai+claude-agent-sdk@0.2.50",
			"node_modules",
			"@anthropic-ai",
			"claude-agent-sdk",
			"cli.js"
		),
		// Global installs
		"/usr/local/lib/node_modules/@anthropic-ai/claude-agent-sdk/cli.js",
		"/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js"
	]
	for (const p of possiblePaths) {
		if (existsSync(p)) {
			return p
		}
	}
	throw new Error(
		"Claude Code executable not found. Install @anthropic-ai/claude-agent-sdk or set CLAUDE_CODE_EXECUTABLE_PATH"
	)
}

/**
 * Resolve the executable path for the Claude Agent SDK.
 *
 * In Docker (when the wrapper script exists), this returns the wrapper
 * which drops privileges to the 'claude' user before running the real CLI.
 * The real CLI path is passed via the CLAUDE_REAL_CLI env var.
 *
 * In local dev, this returns the CLI path directly (no privilege drop).
 */
function resolveClaudeCodeExecutable(): {
	executablePath: string
	realCliPath: string
	useWrapper: boolean
} {
	const realCliPath = resolveClaudeCodeCliPath()

	// Use the privilege-drop wrapper if it exists (Docker deployment)
	try {
		readFileSync(CLAUDE_WRAPPER_PATH, "utf-8")
		return {
			executablePath: CLAUDE_WRAPPER_PATH,
			realCliPath,
			useWrapper: true
		}
	} catch {
		// No wrapper available (local dev) — run CLI directly
		return {
			executablePath: realCliPath,
			realCliPath,
			useWrapper: false
		}
	}
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
const HEARTBEAT_MD = loadMarkdownFile("HEARTBEAT.md")

const BOOTSTRAP_EXISTS = BOOTSTRAP_MD.length > 0

const AGENT_NAME = process.env.AGENT_NAME || "hybrid-agent"

function shouldRunOnboarding(userId?: string): boolean {
	if (!BOOTSTRAP_EXISTS) return false

	// Check if onboarding has already been completed — prevents bootstrap
	// context from being injected forever after recordOnboardingCompleted() is called
	if (isOnboardingComplete(PROJECT_ROOT, BOOTSTRAP_EXISTS)) return false

	const { role } = resolveUserRole(PROJECT_ROOT, userId || "anonymous")
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
				return {
					delivered: false,
					error: `Unknown channel: ${params.channel}`
				}
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

function extractTextDelta(msg: any): string | null {
	if (msg.type === "stream_event") {
		const event = msg.event
		if (
			event?.type === "content_block_delta" &&
			event.delta?.type === "text_delta"
		) {
			return event.delta.text ?? ""
		}
	} else if (msg.type === "assistant") {
		const content = msg.message?.content
		if (Array.isArray(content)) {
			const textBlock = content.find((b: any) => b.type === "text")
			return textBlock?.text ?? null
		}
	}
	return null
}

async function runAgent(
	req: ContainerRequest
): Promise<ReadableStream<Uint8Array>> {
	if (isAgentOnboardingMode() && !shouldRunOnboarding(req.userId)) {
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

	if (BOOTSTRAP_EXISTS && shouldRunOnboarding(req.userId)) {
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

	// Sanitize conversationId to prevent prompt injection — only allow
	// alphanumeric, hyphens, underscores, and colons (typical XMTP conversation IDs)
	const sanitizedConversationId = req.conversationId
		? req.conversationId.replace(/[^a-zA-Z0-9_:=-]/g, "")
		: undefined

	const channel = req.channel || (sanitizedConversationId ? "xmtp" : "web")

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

	const PLAINTEXT_CHANNELS = new Set(["xmtp", "whatsapp", "sms"])
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
		BOOTSTRAP_EXISTS && shouldRunOnboarding(req.userId)
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
	// OpenRouter uses different model names than Anthropic directly
	// See: https://openrouter.ai/models
	const model = isUsingOpenRouter
		? "anthropic/claude-sonnet-4-20250514"
		: "claude-sonnet-4-20250514"

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

	// Resolve Claude executable (wrapper in Docker, direct in local dev)
	const { executablePath, realCliPath, useWrapper } =
		resolveClaudeCodeExecutable()

	// Sensitive key prefixes stripped from the Claude child process environment.
	// ANTHROPIC_API_KEY/AUTH_TOKEN are NOT listed here — the Claude SDK subprocess
	// needs them to authenticate with the LLM API. They pass through via safeEnv
	// and are also explicitly set below for OpenRouter/Anthropic mode.
	const SENSITIVE_PREFIXES = [
		"AGENT_WALLET",
		"OPENROUTER_API_KEY",
		"PRIVATE_KEY",
		"SECRET",
		"SECRETS_PATH",
		"DATA_ROOT",
		"WALLET_KEY",
		"XMTP_DB_ENCRYPTION"
	]

	// Build filtered environment for Claude processes
	const safeEnv = Object.fromEntries(
		Object.entries(process.env).filter(([key]) => {
			return !SENSITIVE_PREFIXES.some((prefix) => key.startsWith(prefix))
		})
	)

	// Build env object per OpenRouter docs
	// See: https://openrouter.ai/docs/guides/guides/claude-code-integration
	const envVars: Record<string, string | undefined> = {
		...safeEnv,
		ANTHROPIC_BASE_URL: baseUrl || undefined,
		ANTHROPIC_AUTH_TOKEN: authToken || undefined,
		// Use OpenRouter's model selection env var
		...(isUsingOpenRouter
			? { ANTHROPIC_SMALL_FAST_MODEL: "anthropic/claude-sonnet-4-20250514" }
			: {}),
		// Pass real CLI path so the wrapper knows what to execute
		...(useWrapper ? { CLAUDE_REAL_CLI: realCliPath } : {})
	}

	// For OpenRouter: API_KEY must be explicitly empty to prevent conflicts
	// For Anthropic: API_KEY is required
	if (isUsingOpenRouter) {
		envVars.ANTHROPIC_API_KEY = ""
	} else if (apiKey) {
		envVars.ANTHROPIC_API_KEY = apiKey
	}

	const { role, acl } = resolveUserRole(PROJECT_ROOT, req.userId)
	const memoryMcpServer = createMemoryMcpServer(
		PROJECT_ROOT,
		req.userId || "anonymous",
		role,
		acl,
		PROJECT_ROOT
	)

	const mcpServers: Options["mcpServers"] = {
		memory: memoryMcpServer
	}

	if (scheduler) {
		const schedulerTools = createSchedulerTools(scheduler)
		const schedulerMcpServer = createSdkMcpServer({
			name: "scheduler",
			tools: schedulerTools
		})
		mcpServers.scheduler = schedulerMcpServer
	}

	const skillMcpServer = createSkillMcpServer(req.userId || "anonymous")
	mcpServers.skills = skillMcpServer

	const options: Options = {
		abortController,
		systemPrompt,
		cwd: workspaceDir, // Isolated workspace for user
		pathToClaudeCodeExecutable: executablePath,
		settingSources: [],
		permissionMode: "bypassPermissions",
		allowDangerouslySkipPermissions: true,
		mcpServers,
		maxTurns: 25,
		includePartialMessages: true,
		stderr: (data: string) => {
			console.error(`[claude-stderr] ${data}`)
		},
		env: envVars
	}

	debug(
		"Options:",
		JSON.stringify(
			{ ...options, mcpServers: Object.keys(options.mcpServers || {}) },
			null,
			2
		).slice(0, 500)
	)
	debug("System prompt:", systemPrompt.slice(0, 200))
	debug("User prompt:", prompt.slice(0, 200))

	let conversation: AsyncGenerator<any, void, unknown>
	try {
		conversation = query({ prompt, options })
	} catch (err) {
		const errorMsg =
			err instanceof Error ? err.message : "Failed to initialize agent"
		console.error(`[agent] query() initialization failed:`, err)
		return new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encodeSSEJson({ type: "error", content: errorMsg }))
				controller.enqueue(encodeDone())
				controller.close()
			}
		})
	}

	let messageCount = 0
	let hasStreamedText = false

	// Use push-based streaming instead of pull-based
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			// Process the async generator in the background
			;(async () => {
				try {
					for await (const msg of conversation) {
						messageCount++

						if (msg.type === "stream_event") {
							const event = msg.event as { type: string }
							const text = extractTextDelta(msg)
							if (text) {
								hasStreamedText = true
								controller.enqueue(
									encodeSSEJson({ type: "text", content: text })
								)
							}

							if (event.type === "content_block_start") {
								const block = (event as any).content_block
								if (block?.type === "tool_use") {
									console.log(
										`${pc.cyan("[agent]")} 🔧 tool: ${pc.yellow(block.name)}`
									)
									controller.enqueue(
										encodeSSEJson({
											type: "tool-call-start",
											toolCallId: block.id,
											toolName: block.name
										})
									)
								}
							}

							if (event.type === "content_block_delta") {
								const delta = (event as any).delta
								if (delta?.type === "input_json_delta") {
									controller.enqueue(
										encodeSSEJson({
											type: "tool-call-delta",
											toolCallId: (event as any).index?.toString(),
											argsTextDelta: delta.partial_json ?? ""
										})
									)
								}
							}

							if (event.type === "content_block_stop") {
								controller.enqueue(
									encodeSSEJson({
										type: "tool-call-end",
										toolCallId: (event as any).index?.toString()
									})
								)
							}
						} else if (msg.type === "assistant" && !hasStreamedText) {
							// Only use assistant message if we haven't streamed text
							const text = extractTextDelta(msg)
							if (text) {
								controller.enqueue(
									encodeSSEJson({ type: "text", content: text })
								)
							}
						} else if (msg.type === "result") {
							const usage = msg.usage
							console.log()
							console.log(
								`${pc.green("[agent]")} ${pc.bold("✓")} done ${pc.gray(`${messageCount} msgs`)} ${pc.gray(`| ${usage?.input_tokens ?? 0} in / ${usage?.output_tokens ?? 0} out`)}`
							)
							controller.enqueue(
								encodeSSEJson({
									type: "usage",
									inputTokens: usage?.input_tokens ?? 0,
									outputTokens: usage?.output_tokens ?? 0,
									totalCostUsd: msg.total_cost_usd ?? 0,
									numTurns: msg.num_turns ?? 1
								})
							)
						}
					}

					controller.enqueue(encodeDone())
					controller.close()

					if (BOOTSTRAP_EXISTS && shouldRunOnboarding(req.userId)) {
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

					if (err instanceof Error) {
						if (
							errorMessage.includes("401") ||
							errorMessage.includes("Unauthorized") ||
							errorMessage.includes("invalid")
						) {
							console.error(
								`[agent] API key error - check ANTHROPIC_API_KEY or OPENROUTER_API_KEY`
							)
						}
						if (
							errorMessage.includes("terminated") ||
							errorMessage.includes("ECONNREFUSED")
						) {
							console.error(
								`[agent] Connection error - check ANTHROPIC_BASE_URL`
							)
						}
					}

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
			console.log("[agent] stream cancelled, aborting agent")
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
	const req = await c.req.json<ContainerRequest>()

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
	const stream = await runAgent(req)

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive"
		}
	})
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
	const walletAddress = getWalletAddress()
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
	console.log()
	console.log("  ─────────────────────────────────────────────────")
	console.log()
	console.log(`  Provider    ${provider}`)
	console.log(`  Model       ${model}`)

	console.log()
	console.log("  Environment Variables:")
	console.log(
		`    OPENROUTER_API_KEY    ${process.env.OPENROUTER_API_KEY ? "✓ set" : "✗ not set"}`
	)
	console.log(`    ANTHROPIC_API_KEY     ${apiKey ? "✓ set" : "✗ not set"}`)
	console.log(`    ANTHROPIC_AUTH_TOKEN  ${authToken ? "✓ set" : "✗ not set"}`)
	console.log(`    ANTHROPIC_BASE_URL    ${baseUrl || "(default Anthropic)"}`)
	console.log(`    DEBUG                 ${DEBUG ? "✓ enabled" : "✗ disabled"}`)

	console.log()
	console.log("  ─────────────────────────────────────────────────")
	console.log()
	console.log("  Configuration Files:")
	console.log(`    Project root          ${PROJECT_ROOT}`)
	console.log(
		`    IDENTITY.md           ${IDENTITY_MD ? "✓ loaded" : "✗ not found"}`
	)
	console.log(
		`    SOUL.md               ${SOUL_MD ? "✓ loaded" : "✗ not found"}`
	)
	console.log(
		`    AGENTS.md             ${AGENTS_MD ? "✓ loaded" : "✗ not found"}`
	)
	console.log(
		`    TOOLS.md              ${TOOLS_MD ? "✓ loaded" : "✗ not found"}`
	)
	console.log(
		`    USER.md               ${loadMarkdownFile("USER.md") ? "✓ loaded" : "✗ not found"}`
	)
	console.log(
		`    BOOT.md               ${BOOT_MD ? "✓ loaded" : "✗ not found"}`
	)
	console.log(
		`    BOOTSTRAP.md          ${BOOTSTRAP_MD ? "✓ ONBOARDING MODE" : "✗ not found"}`
	)
	if (BOOTSTRAP_EXISTS) {
		console.log("    ⚠️  Agent waiting for owner to complete onboarding")
		console.log("    ⚠️  Non-owner requests will be rejected")
	}
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
	console.log(`  XMTP Net    ${XMTP_ENV}`)
	if (walletAddress) {
		console.log(`  Wallet      ${walletAddress}`)
	} else {
		console.log(`  Wallet      (not configured)`)
	}
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
Promise.all([initMemory(), initScheduler()]).then(() => {
	serve({ hostname: "0.0.0.0", port: AGENT_PORT, fetch: app.fetch })
})

export default app
