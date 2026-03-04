import type { UIMessage } from "ai"
import { Hono } from "hono"
import { cors } from "hono/cors"

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

	const containerRes = await fetch("http://localhost:8454/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			messages,
			chatId: body.chatId,
			teamId: body.teamId,
			systemPrompt: body.systemPrompt
		})
	})

	return new Response(containerRes.body, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive"
		}
	})
})

console.log("Dev gateway running on http://localhost:8787")
Bun.serve({ port: 8787, fetch: app.fetch })
