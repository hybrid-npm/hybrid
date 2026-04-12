import { Sandbox, getSandbox } from "@cloudflare/sandbox"
import type { UIMessage } from "ai"
import { Hono } from "hono"
import { cors } from "hono/cors"

export { Sandbox }

export interface GatewayEnv {
	AgentContainer: DurableObjectNamespace
	ANTHROPIC_API_KEY?: string
	ANTHROPIC_BASE_URL?: string
	ANTHROPIC_AUTH_TOKEN?: string
	OPENROUTER_API_KEY?: string
}

type SandboxStub = InstanceType<typeof Sandbox>

const app = new Hono<{ Bindings: GatewayEnv }>()

app.use("*", cors())

app.get("/health", async (c) => {
	const env = c.env
	const teamId = "default"

	try {
		const sandbox = getSandboxInstance(env, teamId) as any

		const processes = await sandbox.listProcesses()
		const serverRunning = processes.some((p: any) =>
			p.command?.includes("server/index.js")
		)

		let serverHealthy = false
		try {
			const health = await sandbox.containerFetch(
				"http://container/health",
				{},
				8454
			)
			serverHealthy = health.ok
		} catch {}

		const allHealthy = serverHealthy && serverRunning

		return c.json({
			status: allHealthy ? "healthy" : "unhealthy",
			gateway: true,
			container: serverRunning,
			server: serverHealthy,
			timestamp: new Date().toISOString()
		})
	} catch (err) {
		return c.json({
			status: "unknown",
			message: err instanceof Error ? err.message : "Health check failed",
			timestamp: new Date().toISOString()
		})
	}
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
		8454
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
	return getSandbox(env.AgentContainer as any, teamId) as any
}

async function ensureAgentServer(sandbox: SandboxStub, env: GatewayEnv) {
	const AGENT_PORT = 8454

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

	const processes = await sandbox.listProcesses()
	const serverRunning = processes.some((p) =>
		p.command?.includes("server/index.js")
	)

	let serverHealthy = false
	try {
		const health = await sandbox.containerFetch(
			"http://container/health",
			{},
			AGENT_PORT
		)
		serverHealthy = health.ok
	} catch (err) {
		console.log(`[gateway] Server health check failed: ${err}`)
	}

	if (serverHealthy) {
		console.log("[gateway] Server already running")
		return
	}

	for (const p of processes) {
		if (p.command?.includes("node")) {
			console.log(`[gateway] Killing process ${p.id}`)
			await sandbox.killProcess(p.id)
		}
	}

	const processEnv = {
		ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY ?? "",
		ANTHROPIC_BASE_URL:
			env.ANTHROPIC_BASE_URL ??
			(env.OPENROUTER_API_KEY ? "https://openrouter.ai/api" : ""),
		ANTHROPIC_AUTH_TOKEN:
			env.ANTHROPIC_AUTH_TOKEN ?? env.OPENROUTER_API_KEY ?? "",
		OPENROUTER_API_KEY: env.OPENROUTER_API_KEY ?? "",
		AGENT_PORT: String(AGENT_PORT),
		CLAUDE_CODE_EXECUTABLE_PATH:
			"/app/node_modules/@anthropic-ai/claude-code/cli.js"
	}

	console.log(
		"[gateway] processEnv.OPENROUTER_API_KEY:",
		processEnv.OPENROUTER_API_KEY ? "SET" : "NOT SET"
	)
	console.log(
		"[gateway] processEnv.ANTHROPIC_BASE_URL:",
		processEnv.ANTHROPIC_BASE_URL || "not set"
	)
	console.log(
		"[gateway] processEnv.ANTHROPIC_AUTH_TOKEN:",
		processEnv.ANTHROPIC_AUTH_TOKEN ? "SET" : "NOT SET"
	)

	console.log("[gateway] Starting agent server...")
	const serverProc = await sandbox.startProcess(
		"node /app/dist/server/index.cjs",
		{
			env: { ...processEnv, FORCE_COLOR: "0", NODE_NO_WARNINGS: "1" },
			onOutput: (stream, data) => {
				console.log(`[server][${stream}]: ${data.trim()}`)
			},
			onExit: (code) => {
				console.log(`[gateway] server exited with code ${code}`)
			}
		}
	)
	console.log(`[gateway] Server started with ID: ${serverProc.id}`)

	console.log(`[gateway] Waiting for port ${AGENT_PORT}...`)
	await serverProc.waitForPort(AGENT_PORT, { mode: "tcp" })
	console.log(`[gateway] Port ${AGENT_PORT} is ready`)

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
