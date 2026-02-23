import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { type Options, query } from "@anthropic-ai/claude-agent-sdk"
import { serve } from "@hono/node-server"
import { config } from "dotenv"
import { Hono } from "hono"
import { privateKeyToAccount } from "viem/accounts"

config({
	path: join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env")
})
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") })

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const AGENT_PORT = Number.parseInt(process.env.AGENT_PORT || "4100")
const AGENT_ENDPOINT = "/api/chat"
const HEALTH_CHECK_PATH = "/health"

const XMTP_ENV = process.env.XMTP_ENV || "dev"
const XMTP_WALLET_KEY = process.env.XMTP_WALLET_KEY

function getWalletAddress(): string | null {
	if (!XMTP_WALLET_KEY) return null
	try {
		const key = XMTP_WALLET_KEY.startsWith("0x")
			? (XMTP_WALLET_KEY as `0x${string}`)
			: (`0x${XMTP_WALLET_KEY}` as `0x${string}`)
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
	if (process.env.CLAUDE_CODE_EXECUTABLE_PATH)
		return process.env.CLAUDE_CODE_EXECUTABLE_PATH
	const sdkDir = dirname(
		require.resolve("@anthropic-ai/claude-agent-sdk/cli.js")
	)
	return join(sdkDir, "cli.js")
}

function resolveProjectRoot(): string {
	if (process.env.AGENT_PROJECT_ROOT) return process.env.AGENT_PROJECT_ROOT
	let dir = __dirname
	for (let i = 0; i < 5; i++) {
		try {
			readFileSync(join(dir, "AGENTS.md"), "utf-8")
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
		return ""
	}
}

const AGENTS_MD = loadMarkdownFile("AGENTS.md")
const SOUL_MD = loadMarkdownFile("SOUL.md")

interface ContainerRequest {
	messages: Array<{
		id: string
		role: "system" | "user" | "assistant"
		content: string
	}>
	chatId: string
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

function runAgent(req: ContainerRequest): ReadableStream<Uint8Array> {
	const systemPrompt = [SOUL_MD, req.systemPrompt, AGENTS_MD]
		.filter(Boolean)
		.join("\n\n")
	const prompt = buildPromptWithHistory(req.messages)

	const abortController = new AbortController()

	const options: Options = {
		abortController,
		systemPrompt,
		model: "claude-sonnet-4-20250514",
		cwd: PROJECT_ROOT,
		pathToClaudeCodeExecutable: resolveClaudeCodeExecutable(),
		settingSources: [],
		permissionMode: "bypassPermissions",
		allowDangerouslySkipPermissions: true,
		tools: [],
		maxTurns: 25,
		includePartialMessages: true,
		env: {
			...process.env,
			ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
			ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN
		}
	}

	console.log(`[agent] calling query() with prompt="${prompt.slice(0, 200)}"`)

	const conversation = query({ prompt, options })

	let messageCount = 0

	return new ReadableStream<Uint8Array>({
		cancel() {
			console.log("[agent] stream cancelled, aborting agent")
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

				if (msg.type === "stream_event") {
					const event = msg.event as { type: string }
					if (event.type !== "content_block_delta") {
						console.log(
							`[agent] msg #${messageCount} event.type="${event.type}"`
						)
					}

					const text = extractTextDelta(msg)
					if (text) {
						controller.enqueue(encodeSSEJson({ type: "text", content: text }))
						return
					}

					if (event.type === "content_block_start") {
						const block = (event as any).content_block
						if (block?.type === "tool_use") {
							controller.enqueue(
								encodeSSEJson({
									type: "tool-call-start",
									toolCallId: block.id,
									toolName: block.name
								})
							)
						}
						return
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
						return
					}

					if (event.type === "content_block_stop") {
						controller.enqueue(
							encodeSSEJson({
								type: "tool-call-end",
								toolCallId: (event as any).index?.toString()
							})
						)
						return
					}
				} else if (msg.type === "result") {
					const usage = msg.usage
					controller.enqueue(
						encodeSSEJson({
							type: "usage",
							inputTokens: usage?.input_tokens ?? 0,
							outputTokens: usage?.output_tokens ?? 0,
							totalCostUsd: msg.total_cost_usd ?? 0,
							numTurns: msg.num_turns ?? 1
						})
					)
				} else if (msg.type === "assistant") {
					const text = extractTextDelta(msg)
					if (text) {
						controller.enqueue(encodeSSEJson({ type: "text", content: text }))
					}
				}
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : "Agent error"
				console.error(`[agent] error:`, err)
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
		}
	})
}

const app = new Hono()

app.get(HEALTH_CHECK_PATH, (c) => {
	return c.json({ ok: true, service: "hybrid-agent" })
})

app.post(AGENT_ENDPOINT, async (c) => {
	const req = await c.req.json<ContainerRequest>()
	const stream = runAgent(req)

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
serve({ port: AGENT_PORT, fetch: app.fetch })

export default app
