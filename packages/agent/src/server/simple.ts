import fs from "node:fs"
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import pc from "picocolors"
import { privateKeyToAccount } from "viem/accounts"

const AGENT_PORT = Number.parseInt(process.env.AGENT_PORT || "8454")
const DEBUG = process.env.DEBUG === "true" || process.env.DEBUG === "1"

function debug(...args: unknown[]) {
	if (DEBUG) console.log(pc.gray("[server:debug]"), ...args)
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
		const filename = key.split("/").pop() || key
		const localPath = `/app/data/xmtp/${filename}`
		fs.mkdirSync("/app/data/xmtp", { recursive: true })
		fs.writeFileSync(localPath, new Uint8Array(data))
		return c.json({ ok: true, bytes: data.byteLength, path: localPath })
	} catch (err) {
		return c.text(`Error: ${err}`, 500)
	}
})

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

app.post("/api/chat", async (c) => {
	const body = await c.req.json<{
		messages: { id: string; role: "user" | "assistant"; content: string }[]
		chatId: string
		systemPrompt?: string
	}>()

	debug("Received request", {
		chatId: body.chatId,
		msgCount: body.messages.length
	})
	console.log(
		`${pc.cyan("[server]")} request chatId=${body.chatId.slice(0, 8)} msgs=${body.messages.length}`
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
				console.log(
					`${pc.cyan("[server]")} → ${baseUrl.includes("openrouter") ? "OpenRouter" : "Anthropic"}`
				)

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
					console.error(`${pc.red("[server]")} API error: ${response.status}`)
					debug("API error details", errorText)
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
				console.error(
					`${pc.red("[server]")} error:`,
					err instanceof Error ? err.message : err
				)
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

function printBanner() {
	const { baseUrl, authToken, apiKey } = getProviderConfig()
	const walletAddress = getWalletAddress()
	const isHotReload = process.env.TSX_WATCH === "true"

	console.log("")
	console.log(
		pc.cyan("  ╭───────────────────────────────────────────────────╮")
	)
	console.log(
		pc.cyan("  │") +
			pc.bold(pc.white("      Hybrid Agent Server")) +
			pc.cyan("                        │")
	)
	console.log(
		pc.cyan("  ╰───────────────────────────────────────────────────╯")
	)
	console.log("")
	console.log(
		`  ${pc.green("➜")}  ${pc.bold("Server")}   http://localhost:${AGENT_PORT}`
	)
	console.log(
		`  ${pc.blue("➜")}  ${pc.bold("Health")}   http://localhost:${AGENT_PORT}/health`
	)
	console.log(
		`  ${pc.yellow("➜")}  ${pc.bold("Chat")}     http://localhost:${AGENT_PORT}/api/chat`
	)
	console.log("")
	console.log(
		pc.gray("  ─────────────────────────────────────────────────────")
	)
	console.log("")
	console.log(
		`  ${pc.bold("Provider")}   ${baseUrl.includes("openrouter") ? pc.magenta("OpenRouter") : pc.blue("Anthropic")}`
	)
	console.log(
		`  ${pc.bold("API Key")}    ${authToken || apiKey ? pc.green("✓ set") : pc.red("✗ not set")}`
	)
	console.log(
		`  ${pc.bold("Wallet")}     ${walletAddress ? pc.cyan(walletAddress) : pc.gray("(not configured)")}`
	)
	console.log("")
	console.log(
		pc.gray("  ─────────────────────────────────────────────────────")
	)
	console.log("")

	if (isHotReload) {
		console.log(
			`  ${pc.yellow("⚡")} Hot reload enabled - watching for changes...`
		)
	} else {
		console.log(`  ${pc.green("✓")} Ready. Waiting for requests...`)
	}
	console.log("")
}

printBanner()

serve({
	fetch: app.fetch,
	port: AGENT_PORT
})
