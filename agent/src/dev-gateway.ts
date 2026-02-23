import { serve } from "@hono/node-server"
import type { UIMessage } from "ai"
import { Hono } from "hono"
import { cors } from "hono/cors"

const GATEWAY_PORT = 8787
const CONTAINER_PORT = 4100

const app = new Hono()

app.use("*", cors())

app.get("/health", (c) => {
	return c.json({ status: "healthy", mode: "dev-gateway" })
})

function extractTextFromParts(parts: UIMessage["parts"]): string {
	return parts
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("")
}

app.post("/api/chat", async (c) => {
	const body = await c.req.json<{
		messages: UIMessage[]
		chatId: string
		teamId?: string
		systemPrompt?: string
	}>()

	const messages = body.messages.map((m) => ({
		id: m.id,
		role: m.role,
		content: extractTextFromParts(m.parts)
	}))

	const containerRes = await fetch(
		`http://localhost:${CONTAINER_PORT}/api/chat`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				messages,
				chatId: body.chatId,
				teamId: body.teamId,
				systemPrompt: body.systemPrompt
			})
		}
	)

	return new Response(containerRes.body, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive"
		}
	})
})

function printStartup() {
	console.log("\n  ╭──────────────────────────────────────────────────╮")
	console.log("  │              Dev Gateway (Local)                 │")
	console.log("  ╰──────────────────────────────────────────────────╯")
	console.log()
	console.log(`  Gateway     http://localhost:${GATEWAY_PORT}`)
	console.log(`  Container   http://localhost:${CONTAINER_PORT}`)
	console.log()
	console.log("  ─────────────────────────────────────────────────")
	console.log()
	console.log("  Routes:")
	console.log(`    GET  /health`)
	console.log(`    POST /api/chat`)
	console.log()
}

printStartup()
serve({ port: GATEWAY_PORT, fetch: app.fetch })
