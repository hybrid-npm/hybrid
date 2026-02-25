import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { privateKeyToAccount } from "viem/accounts"

const _dirname = typeof __dirname !== "undefined" ? __dirname : process.cwd()

const AGENT_PORT = Number.parseInt(process.env.AGENT_PORT || "4100")

function getProviderConfig() {
	const baseUrl =
		process.env.ANTHROPIC_BASE_URL ||
		(process.env.OPENROUTER_API_KEY
			? "https://openrouter.ai/api"
			: "https://api.anthropic.com")
	const authToken =
		process.env.ANTHROPIC_AUTH_TOKEN || process.env.OPENROUTER_API_KEY
	const apiKey = process.env.ANTHROPIC_API_KEY
	return { baseUrl, authToken, apiKey }
}

function getWalletAddress(): string | null {
	const key = process.env.AGENT_WALLET_KEY
	if (!key) return null
	try {
		const account = privateKeyToAccount(key as `0x${string}`)
		return account.address
	} catch {
		return null
	}
}

const app = new Hono()

app.get("/health", (c) => {
	return c.json({
		status: "healthy",
		service: "hybrid-agent-server",
		timestamp: new Date().toISOString()
	})
})

interface Message {
	id: string
	role: "user" | "assistant"
	content: string
}

app.post("/api/chat", async (c) => {
	const body = await c.req.json<{
		messages: Message[]
		chatId: string
		systemPrompt?: string
	}>()

	console.log(`[agent] received request`)
	console.log(
		`[agent] messages: ${body.messages.length}, chatId: ${body.chatId}`
	)

	const { baseUrl, authToken, apiKey } = getProviderConfig()

	if (!authToken && !apiKey) {
		return streamError("No API key configured")
	}

	const systemPrompt =
		body.systemPrompt ||
		"You are a helpful AI assistant. Be concise and friendly."

	const messages = body.messages.map((m) => ({
		role: m.role,
		content: m.content
	}))

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder()

			const encodeSSE = (data: object) =>
				encoder.encode(`data: ${JSON.stringify(data)}\n\n`)

			try {
				console.log(`[agent] calling ${baseUrl}/v1/chat/completions`)

				const response = await fetch(`${baseUrl}/v1/chat/completions`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${authToken || apiKey}`,
						"HTTP-Referer": "https://hybrid.agent",
						"X-Title": "Hybrid Agent",
						...(apiKey && { "anthropic-api-key": apiKey })
					},
					body: JSON.stringify({
						model: "anthropic/claude-3.5-sonnet",
						messages: [{ role: "system", content: systemPrompt }, ...messages],
						stream: true,
						max_tokens: 4096
					})
				})

				if (!response.ok) {
					const errorText = await response.text()
					console.error(`[agent] API error: ${response.status} ${errorText}`)
					controller.enqueue(
						encodeSSE({
							type: "error",
							content: `API error: ${response.status}`
						})
					)
					controller.enqueue(encoder.encode("data: [DONE]\n\n"))
					controller.close()
					return
				}

				const reader = response.body?.getReader()
				if (!reader) {
					controller.enqueue(
						encodeSSE({ type: "error", content: "No response body" })
					)
					controller.enqueue(encoder.encode("data: [DONE]\n\n"))
					controller.close()
					return
				}

				const decoder = new TextDecoder()
				let totalInput = 0
				let totalOutput = 0

				while (true) {
					const { done, value } = await reader.read()
					if (done) break

					const chunk = decoder.decode(value)
					const lines = chunk.split("\n")

					for (const line of lines) {
						if (line.startsWith("data: ") && !line.includes("[DONE]")) {
							try {
								const data = JSON.parse(line.slice(6))

								if (data.choices?.[0]?.delta?.content) {
									const content = data.choices[0].delta.content
									totalOutput++
									controller.enqueue(encodeSSE({ type: "text", content }))
								}

								if (data.usage) {
									totalInput = data.usage.prompt_tokens || totalInput
									totalOutput = data.usage.completion_tokens || totalOutput
								}
							} catch {
								// Skip invalid JSON
							}
						}
					}
				}

				controller.enqueue(
					encodeSSE({
						type: "usage",
						inputTokens: totalInput,
						outputTokens: totalOutput,
						totalCostUsd: 0.001,
						numTurns: 1
					})
				)
				controller.enqueue(encoder.encode("data: [DONE]\n\n"))
				controller.close()
			} catch (err) {
				console.error(`[agent] error:`, err)
				controller.enqueue(
					encodeSSE({
						type: "error",
						content: err instanceof Error ? err.message : "Unknown error"
					})
				)
				controller.enqueue(encoder.encode("data: [DONE]\n\n"))
				controller.close()
			}
		}
	})

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive"
		}
	})
})

function streamError(message: string) {
	const encoder = new TextEncoder()
	return new Response(
		new ReadableStream({
			start(controller) {
				controller.enqueue(
					encoder.encode(
						`data: ${JSON.stringify({ type: "error", content: message })}\n\n`
					)
				)
				controller.enqueue(encoder.encode("data: [DONE]\n\n"))
				controller.close()
			}
		}),
		{
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache"
			}
		}
	)
}

// Startup banner
console.log("")
console.log("  ╭──────────────────────────────────────────────────╮")
console.log("  │              Hybrid Agent Server                 │")
console.log("  ╰──────────────────────────────────────────────────╯")
console.log("")
console.log(`  Server      http://localhost:${AGENT_PORT}`)
console.log(`  Health      http://localhost:${AGENT_PORT}/health`)
console.log(`  Chat        http://localhost:${AGENT_PORT}/api/chat`)
console.log("")
console.log("  ─────────────────────────────────────────────────")
console.log("")

const { baseUrl, authToken, apiKey } = getProviderConfig()
const walletAddress = getWalletAddress()

console.log(
	`  Provider    ${baseUrl.includes("openrouter") ? "OpenRouter" : "Anthropic"}`
)
console.log(`  API Key     ${authToken || apiKey ? "✓ set" : "✗ not set"}`)
console.log(`  Wallet      ${walletAddress || "(not configured)"}`)
console.log("")
console.log("  ─────────────────────────────────────────────────")
console.log("")
console.log("  Ready. Waiting for requests...")
console.log("")

serve({
	fetch: app.fetch,
	port: AGENT_PORT
})
