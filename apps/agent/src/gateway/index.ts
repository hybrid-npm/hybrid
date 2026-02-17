import { Hono } from "hono"
import { AGENT_ENDPOINT, HEALTH_CHECK_PATH } from "../server/types"

type Bindings = {
	CONTAINER_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

function containerUrl(c: { env: Bindings }): string {
	return c.env.CONTAINER_URL ?? "http://localhost:4100"
}

app.get(HEALTH_CHECK_PATH, (c) => {
	return c.json({ ok: true, service: "agent-gateway" })
})

app.post(AGENT_ENDPOINT, async (c) => {
	const target = `${containerUrl(c)}${AGENT_ENDPOINT}`

	const containerRes = await fetch(target, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: c.req.raw.body,
		duplex: "half",
	})

	if (!containerRes.ok) {
		const text = await containerRes.text()
		return c.text(text, containerRes.status as 500)
	}

	return new Response(containerRes.body, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	})
})

export default app
