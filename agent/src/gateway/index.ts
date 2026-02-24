import { Sandbox, getSandbox } from "@cloudflare/sandbox"
import type { UIMessage } from "ai"
import { Hono } from "hono"
import { cors } from "hono/cors"

export { Sandbox }

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

function extractTextFromParts(parts: UIMessage["parts"] | undefined): string {
	if (!parts) return ""
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

	const sandbox = getSandboxInstance(env, body.teamId || "default")
	await ensureAgentServer(sandbox, env)

	const messages = body.messages.map((m) => ({
		id: m.id,
		role: m.role,
		content: extractTextFromParts(m.parts) || (m as any).content || ""
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

function getSandboxInstance(env: GatewayEnv, teamId: string): SandboxStub {
	return getSandbox(env.Sandbox, teamId)
}

async function ensureAgentServer(sandbox: SandboxStub, env: GatewayEnv) {
	const AGENT_PORT = 4100

	// First, wait for the container to be ready
	console.log("[gateway] Waiting for container to be ready...")
	for (let i = 0; i < 30; i++) {
		try {
			await sandbox.listProcesses()
			console.log("[gateway] Container is ready")
			break
		} catch (err) {
			console.log(`[gateway] Container not ready yet (attempt ${i + 1})`)
			await new Promise((r) => setTimeout(r, 1000))
		}
	}

	// Check if server is already running
	try {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 5000)
		const health = await sandbox.containerFetch(
			"http://container/health",
			{ signal: controller.signal },
			AGENT_PORT
		)
		clearTimeout(timeoutId)
		if (health.ok) {
			console.log("[gateway] Server already running")
			return
		}
	} catch (err) {
		console.log(`[gateway] Server not running, will start it: ${err}`)
	}

	// Kill any existing node processes
	const processes = await sandbox.listProcesses()
	for (const p of processes) {
		if (p.command?.includes("node")) {
			console.log(`[gateway] Killing process ${p.id}`)
			await sandbox.killProcess(p.id)
		}
	}

	// Start the server
	console.log("[gateway] Starting server process...")
	const proc = await sandbox.startProcess("node /app/dist/server/index.js", {
		env: {
			ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY ?? "",
			ANTHROPIC_BASE_URL:
				env.ANTHROPIC_BASE_URL ??
				(env.OPENROUTER_API_KEY ? "https://openrouter.ai/api" : ""),
			ANTHROPIC_AUTH_TOKEN:
				env.ANTHROPIC_AUTH_TOKEN ?? env.OPENROUTER_API_KEY ?? "",
			OPENROUTER_API_KEY: env.OPENROUTER_API_KEY ?? "",
			AGENT_PORT: String(AGENT_PORT)
		},
		onOutput: (data) => {
			console.log(`[gateway] process stdout: ${data}`)
		},
		onExit: (code) => {
			console.log(`[gateway] process exited with code ${code}`)
		}
	})
	console.log(`[gateway] Process started with ID: ${proc.id}`)

	// Wait for the port to be ready
	console.log(`[gateway] Waiting for port ${AGENT_PORT}...`)
	await proc.waitForPort(AGENT_PORT, { mode: "tcp" })
	console.log(`[gateway] Port ${AGENT_PORT} is ready`)

	// Verify with health check
	for (let i = 0; i < 10; i++) {
		try {
			const health = await sandbox.containerFetch(
				"http://container/health",
				{},
				AGENT_PORT
			)
			if (health.ok) {
				console.log("[gateway] Health check passed")
				return
			}
		} catch (err) {
			console.log(`[gateway] Health check failed (attempt ${i + 1}): ${err}`)
			await new Promise((r) => setTimeout(r, 500))
		}
	}

	throw new Error("Agent server failed to start")
}

export default app
