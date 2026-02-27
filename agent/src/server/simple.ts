import fs from "node:fs"
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { privateKeyToAccount } from "viem/accounts"

const _dirname = typeof __dirname !== "undefined" ? __dirname : process.cwd()

const AGENT_PORT = Number.parseInt(process.env.AGENT_PORT || "4100")
const DEBUG = process.env.DEBUG === "true" || process.env.DEBUG === "1"

function debug(...args: unknown[]) {
	if (DEBUG) console.log("[server:debug]", ...args)
}

debug("DEBUG mode enabled")

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
		service: "hybrid-agent",
		timestamp: new Date().toISOString()
	})
})

app.get("/container/health", async (c) => {
	return c.json({ status: "running" })
})

app.get("/sidecar-logs", (c) => {
	try {
		const logs = fs.readFileSync("/tmp/sidecar.log", "utf-8")
		return c.text(logs)
	} catch {
		return c.text("No logs available")
	}
})

// R2 database sync - download from R2
app.get("/db/download", async (c) => {
	const key = c.req.query("key")
	if (!key) return c.text("Missing key", 400)

	const GATEWAY_URL = process.env.GATEWAY_URL
	if (!GATEWAY_URL) return c.text("GATEWAY_URL not set", 500)

	try {
		const response = await fetch(
			`${GATEWAY_URL}/internal/r2/get?key=${encodeURIComponent(key)}`
		)
		if (!response.ok) {
			if (response.status === 404) return c.text("Not found", 404)
			return c.text("R2 fetch failed", 500)
		}
		const data = await response.arrayBuffer()
		// Use the filename portion of the key only
		const filename = key.split("/").pop() || key
		const localPath = `/app/data/xmtp/${filename}`
		fs.mkdirSync("/app/data/xmtp", { recursive: true })
		fs.writeFileSync(localPath, new Uint8Array(data))
		return c.json({ ok: true, bytes: data.byteLength, path: localPath })
	} catch (err) {
		return c.text(`Error: ${err}`, 500)
	}
})

// R2 database sync - upload to R2
app.put("/db/upload", async (c) => {
	const key = c.req.query("key")
	const localPath = c.req.query("path")
	if (!key || !localPath) return c.text("Missing key or path", 400)

	const GATEWAY_URL = process.env.GATEWAY_URL
	if (!GATEWAY_URL) return c.text("GATEWAY_URL not set", 500)

	try {
		if (!fs.existsSync(localPath)) return c.text("File not found", 404)
		const data = fs.readFileSync(localPath)
		const response = await fetch(
			`${GATEWAY_URL}/internal/r2/put?key=${encodeURIComponent(key)}`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/octet-stream" },
				body: data
			}
		)
		if (!response.ok) {
			return c.text("R2 put failed", 500)
		}
		return c.json({ ok: true, bytes: data.byteLength })
	} catch (err) {
		return c.text(`Error: ${err}`, 500)
	}
})

// R2 database sync - upload to R2
app.put("/db/upload", async (c) => {
	const key = c.req.query("key")
	const localPath = c.req.query("path")
	if (!key || !localPath) return c.text("Missing key or path", 400)

	const GATEWAY_URL = process.env.GATEWAY_URL
	if (!GATEWAY_URL) return c.text("GATEWAY_URL not set", 500)

	try {
		if (!fs.existsSync(localPath)) return c.text("File not found", 404)
		const data = fs.readFileSync(localPath)
		const response = await fetch(
			`${GATEWAY_URL}/internal/r2/put?key=${encodeURIComponent(key)}`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/octet-stream" },
				body: data
			}
		)
		if (!response.ok) {
			return c.text("R2 put failed", 500)
		}
		return c.json({ ok: true, bytes: data.byteLength })
	} catch (err) {
		return c.text(`Error: ${err}`, 500)
	}
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

	debug("Received request", {
		chatId: body.chatId,
		msgCount: body.messages.length
	})
	console.log(`[agent] received request`)
	console.log(
		`[agent] messages: ${body.messages.length}, chatId: ${body.chatId}`
	)

	const { baseUrl, authToken, apiKey } = getProviderConfig()
	debug("Provider config", { baseUrl, hasAuth: !!(authToken || apiKey) })

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
				debug("Fetching from API", { url: `${baseUrl}/v1/chat/completions` })
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

				debug("API response status", response.status)

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
