import { Hono } from "hono"
import { AGENT_ENDPOINT, AGENT_PORT, HEALTH_CHECK_PATH, type ContainerRequest } from "./types"
import { runAgent } from "./agent"

const app = new Hono()

app.get(HEALTH_CHECK_PATH, (c) => {
	return c.json({ ok: true, service: "agent-server" })
})

app.post(AGENT_ENDPOINT, async (c) => {
	const startTime = performance.now()

	try {
		const req = await c.req.json<ContainerRequest>()

		const stream = runAgent(req, c.req.raw.signal)

		const setupMs = Math.round(performance.now() - startTime)
		console.log(`[agent] start setupMs=${setupMs}`)

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			},
		})
	} catch (err) {
		const durationMs = Math.round(performance.now() - startTime)
		const message = err instanceof Error ? err.message : "Internal server error"
		console.error(`[agent] error durationMs=${durationMs} error=${message}`)

		return c.json({ error: message }, 500)
	}
})

export default app
