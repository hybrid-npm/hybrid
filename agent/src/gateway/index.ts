import { Sandbox } from "@cloudflare/sandbox"
import type { UIMessage } from "ai"
import { Hono } from "hono"
import { cors } from "hono/cors"

export interface GatewayEnv {
	Sandbox: DurableObjectNamespace
	XMTP_STORAGE: R2Bucket
	XMTP_WALLET_KEY: string
	XMTP_DB_ENCRYPTION_KEY: string
	XMTP_ENV: string
	ANTHROPIC_API_KEY?: string
	ANTHROPIC_BASE_URL?: string
	ANTHROPIC_AUTH_TOKEN?: string
	OPENROUTER_API_KEY?: string
}

type SandboxStub = InstanceType<typeof Sandbox>

const app = new Hono<{ Bindings: GatewayEnv }>()

app.use("*", cors())

app.get("/health", (c) => {
	return c.json({
		status: "healthy",
		service: "hybrid-agent",
		timestamp: new Date().toISOString()
	})
})

function extractTextFromParts(parts: UIMessage["parts"]): string {
	return parts
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("")
}

app.post("/api/chat", async (c) => {
	const env = c.env
	const body = await c.req.json<{
		messages: UIMessage[]
		chatId: string
		teamId?: string
		systemPrompt?: string
	}>()

	const sandbox = getSandbox(env, body.teamId || "default")
	await ensureAgentServer(sandbox, env)

	const messages = body.messages.map((m) => ({
		id: m.id,
		role: m.role,
		content: extractTextFromParts(m.parts)
	}))

	const response = await sandbox.containerFetch(
		"http://container/api/chat",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				messages,
				chatId: body.chatId,
				teamId: body.teamId,
				systemPrompt: body.systemPrompt
			})
		},
		4100
	)

	return new Response(response.body, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive"
		}
	})
})

function getSandbox(env: GatewayEnv, teamId: string): SandboxStub {
	const id = env.Sandbox.idFromName(teamId)
	return env.Sandbox.get(id) as unknown as SandboxStub
}

async function ensureAgentServer(sandbox: SandboxStub, env: GatewayEnv) {
	const AGENT_PORT = 4100

	try {
		const health = await sandbox.containerFetch(
			"http://container/health",
			{},
			AGENT_PORT
		)
		if (health.ok) return
	} catch {
		// Server not running, start it
	}

	const processes = await sandbox.listProcesses()
	for (const p of processes) {
		if (p.command?.includes("node")) {
			await sandbox.killProcess(p.id)
		}
	}

	await sandbox.startProcess("bash /app/start.sh", {
		env: {
			ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY ?? "",
			ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL ?? "",
			ANTHROPIC_AUTH_TOKEN:
				env.ANTHROPIC_AUTH_TOKEN ?? env.OPENROUTER_API_KEY ?? "",
			AGENT_PORT: String(AGENT_PORT)
		},
		cwd: "/app"
	})

	for (let i = 0; i < 30; i++) {
		try {
			const health = await sandbox.containerFetch(
				"http://container/health",
				{},
				AGENT_PORT
			)
			if (health.ok) return
		} catch {
			await new Promise((r) => setTimeout(r, 1000))
		}
	}

	throw new Error("Agent server failed to start")
}

export default app
