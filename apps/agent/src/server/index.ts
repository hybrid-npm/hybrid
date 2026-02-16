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

process.on("uncaughtException", (err) => {
	console.error("[agent] uncaughtException:", err)
	process.exit(1)
})

process.on("unhandledRejection", (reason) => {
	console.error("[agent] unhandledRejection:", reason)
	process.exit(1)
})

if (typeof process !== "undefined" && process.argv[1]?.includes("server")) {
	const { serve } = await import("@hono/node-server")
	serve({ fetch: app.fetch, port: AGENT_PORT }, (info) => {
		console.log(`agent-server listening on http://localhost:${info.port}`)
	})
}

export default app
