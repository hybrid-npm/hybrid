import { readFileSync } from "node:fs"
import { join } from "node:path"
import { type Options, query } from "@anthropic-ai/claude-agent-sdk"
import { serve } from "@hono/node-server"
import { MemoryIndexManager, resolveMemoryConfig } from "@hybrid/memory"
import { Hono } from "hono"
import pc from "picocolors"
import { privateKeyToAccount } from "viem/accounts"
import { createMemoryMcpServer, resolveUserRole } from "../memory-tools"

const _dirname = typeof __dirname !== "undefined" ? __dirname : process.cwd()

// Auto-configure OpenRouter if OPENROUTER_API_KEY is present
// See: https://openrouter.ai/docs/guides/guides/claude-code-integration
if (process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY) {
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

const XMTP_ENV = process.env.XMTP_ENV || "dev"
const AGENT_WALLET_KEY = process.env.AGENT_WALLET_KEY

function getWalletAddress(): string | null {
	if (!AGENT_WALLET_KEY) return null
	try {
		const key = AGENT_WALLET_KEY.startsWith("0x")
			? (AGENT_WALLET_KEY as `0x${string}`)
			: (`0x${AGENT_WALLET_KEY}` as `0x${string}`)
		const account = privateKeyToAccount(key)
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

function resolveClaudeCodeExecutable(): string {
	if (process.env.CLAUDE_CODE_EXECUTABLE_PATH) {
		return process.env.CLAUDE_CODE_EXECUTABLE_PATH
	}
	// Try to find the SDK's cli.js relative to this package
	// When bundled, _dirname is packages/agent/dist/server
	const possiblePaths = [
		// From packages/agent/dist/server -> node_modules/.pnpm/...
		join(
			_dirname,
			"..",
			"..",
			"..",
			"..",
			"node_modules",
			".pnpm",
			"@anthropic-ai+claude-agent-sdk@0.2.50_zod@4.3.6",
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
		try {
			readFileSync(p, "utf-8")
			return p
		} catch {
			continue
		}
	}
	throw new Error(
		"Claude Code executable not found. Install @anthropic-ai/claude-agent-sdk or set CLAUDE_CODE_EXECUTABLE_PATH"
	)
}

const PROJECT_ROOT = process.env.AGENT_PROJECT_ROOT || process.cwd()

function loadMarkdownFile(relativePath: string): string {
	try {
		return readFileSync(join(PROJECT_ROOT, relativePath), "utf-8").trim()
	} catch {
		return ""
	}
}

const AGENTS_MD = loadMarkdownFile("AGENTS.md")
const SOUL_MD = loadMarkdownFile("SOUL.md")

const AGENT_NAME = process.env.AGENT_NAME || "hybrid-agent"

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
			| undefined = undefined

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
	const lastMessage = req.messages.at(-1)?.content || ""

	const memoryContext = lastMessage
		? await searchMemory(lastMessage, req.userId, req.chatId)
		: null

	const systemPromptParts = [SOUL_MD, req.systemPrompt, AGENTS_MD]
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
		? "anthropic/claude-3.5-sonnet" // More stable model for testing
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

	// Build env object per OpenRouter docs
	// See: https://openrouter.ai/docs/guides/guides/claude-code-integration
	const envVars: Record<string, string | undefined> = {
		...process.env, // Pass through PATH, HOME, etc.
		ANTHROPIC_BASE_URL: baseUrl || undefined,
		ANTHROPIC_AUTH_TOKEN: authToken || undefined,
		// Use OpenRouter's model selection env var
		...(isUsingOpenRouter
			? { ANTHROPIC_SMALL_FAST_MODEL: "anthropic/claude-3.5-sonnet" }
			: {})
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
		acl
	)

	const options: Options = {
		abortController,
		systemPrompt,
		cwd: PROJECT_ROOT,
		pathToClaudeCodeExecutable: resolveClaudeCodeExecutable(),
		settingSources: [],
		permissionMode: "bypassPermissions",
		allowDangerouslySkipPermissions: true,
		mcpServers: {
			memory: memoryMcpServer
		},
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
	return c.json({ ok: true, service: "hybrid-agent" })
})

app.post(AGENT_ENDPOINT, async (c) => {
	const requestId = c.req.header("X-Request-ID") || "unknown"
	const source = c.req.header("X-Source") || "unknown"
	const req = await c.req.json<ContainerRequest>()
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
		`    AGENTS.md             ${AGENTS_MD ? "✓ loaded" : "✗ not found"}`
	)
	console.log(
		`    SOUL.md               ${SOUL_MD ? "✓ loaded" : "✗ not found"}`
	)

	console.log()
	console.log("  ─────────────────────────────────────────────────")
	console.log()
	console.log("  SDK Configuration (passed to Claude):")
	if (isUsingOpenRouter) {
		console.log("    Mode: OpenRouter")
		console.log(`    ANTHROPIC_BASE_URL:   ${baseUrl}`)
		console.log(
			`    ANTHROPIC_AUTH_TOKEN: ${authToken ? "***" + authToken.slice(-4) : "✗ missing"}`
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
			`    ANTHROPIC_API_KEY:    ${apiKey ? "***" + apiKey.slice(-4) : "✗ missing"}`
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
	console.log("  Ready. Waiting for requests...")
	console.log()
}

printStartup()
initMemory().then(() => {
	serve({ port: AGENT_PORT, fetch: app.fetch })
})

export default app
