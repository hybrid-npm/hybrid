import { Hono } from "hono"
import { AGENT_ENDPOINT, HEALTH_CHECK_PATH } from "../../server/types"
import { proxyToContainer } from "../proxy"

type Bindings = {
	CONTAINER_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get(HEALTH_CHECK_PATH, (c) => {
	return c.json({ ok: true, service: "agent-gateway" })
})

app.post(AGENT_ENDPOINT, async (c) => {
	const containerUrl = c.env.CONTAINER_URL ?? "http://localhost:4100"
	return proxyToContainer(containerUrl, c.req.raw.body)
})

export default app
