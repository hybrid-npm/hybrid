import { Hono } from "hono"
import { AGENT_ENDPOINT, HEALTH_CHECK_PATH } from "../../server/types"
import { proxyToContainer } from "../proxy"

const app = new Hono()

const containerUrl = process.env.CONTAINER_URL ?? "http://localhost:4100"

app.get(HEALTH_CHECK_PATH, (c) => {
	return c.json({ ok: true, service: "agent-gateway" })
})

app.post(AGENT_ENDPOINT, async (c) => {
	return proxyToContainer(containerUrl, c.req.raw.body)
})

export default app
