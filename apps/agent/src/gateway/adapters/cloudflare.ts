import { Hono } from "hono"
import { getSandbox } from "@cloudflare/sandbox"
import type { SandboxEnv } from "@cloudflare/sandbox"
import { AGENT_ENDPOINT, HEALTH_CHECK_PATH } from "../../server/types"
import { proxyToContainer } from "../proxy"
import { mountR2Storage, type CloudflareStorageEnv } from "../storage/cloudflare"

type Bindings = {
	CONTAINER_URL: string
} & SandboxEnv &
	CloudflareStorageEnv

const app = new Hono<{ Bindings: Bindings }>()

app.get(HEALTH_CHECK_PATH, (c) => {
	return c.json({ ok: true, service: "agent-gateway" })
})

app.post(AGENT_ENDPOINT, async (c) => {
	const hasSandbox = c.env.Sandbox && c.env.CLOUDFLARE_R2_BUCKET_NAME

	if (hasSandbox) {
		const sandbox = getSandbox(c.env.Sandbox, "agent")
		await mountR2Storage(sandbox, c.env)
		return proxyToContainer(c.env.CONTAINER_URL ?? "http://localhost:4100", c.req.raw.body)
	}

	const containerUrl = c.env.CONTAINER_URL ?? "http://localhost:4100"
	return proxyToContainer(containerUrl, c.req.raw.body)
})

export default app
