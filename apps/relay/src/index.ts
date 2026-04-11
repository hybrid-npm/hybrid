import { Hono } from "hono"
import { serve } from "@hono/node-server"
import pc from "picocolors"

const PORT = Number.parseInt(process.env.RELAY_PORT || "8460")
const AGENT_URL = process.env.AGENT_URL || "http://localhost:8454"
const RELAY_SECRET = process.env.RELAY_SECRET

const app = new Hono()

app.get("/health", (c) => c.json({ status: "healthy", uptime: process.uptime() }))

app.post("/api/channels/:channel", async (c) => {
	const channel = c.req.param("channel")
	const body = await c.req.json()

	console.log(`${pc.green("[relay]")} channel paired: ${pc.bold(channel)}`)

	return c.json({
		status: "ok",
		channel,
		webhookUrl: `${AGENT_URL}/api/webhooks/${channel}`,
		config: body
	})
})

app.delete("/api/channels/:channel", async (c) => {
	const channel = c.req.param("channel")

	console.log(`${pc.yellow("[relay]")} channel unpaired: ${pc.bold(channel)}`)

	return c.json({ status: "ok", channel })
})

app.post("/api/notify/:channel", async (c) => {
	const channel = c.req.param("channel")
	const body = await c.req.json()

	console.log(`${pc.cyan("[relay]")} notifying agent: ${pc.bold(channel)}`)

	const res = await fetch(`${AGENT_URL}/api/webhooks/${channel}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(RELAY_SECRET ? { Authorization: `Bearer ${RELAY_SECRET}` } : {})
		},
		body: JSON.stringify(body)
	})

	if (!res.ok) {
		return c.json({ error: `agent returned ${res.status}` }, 502)
	}

	const data = await res.json()
	return c.json(data)
})

console.log(`
  ${pc.bold("Hybrid Relay Service")}
  ${pc.gray("─────────────────────────────────")}
  Server    http://localhost:${PORT}
  Health    http://localhost:${PORT}/health
  Agent     ${AGENT_URL}
  ${pc.gray("─────────────────────────────────")}
`)

serve({ hostname: "0.0.0.0", port: PORT, fetch: app.fetch })
