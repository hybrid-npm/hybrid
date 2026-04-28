import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import prompts from "prompts"

const __dirname = dirname(fileURLToPath(import.meta.url))

const TEMPLATES_DIR = join(__dirname, "..", "templates")

function parseArgs() {
	const args = process.argv.slice(2)
	const result: Record<string, string> = {}

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]
		if (arg?.startsWith("--")) {
			const key = arg.slice(2)
			const value = args[i + 1]
			if (value && !value.startsWith("--")) {
				result[key] = value
				i++
			} else {
				result[key] = "true"
			}
		} else if (!result.name && arg) {
			result.name = arg
		}
	}

	return result
}

async function main() {
	console.log("\n  🤖 Create Hybrid Agent\n")

	const cliArgs = parseArgs()

	const response = await prompts([
		{
			type: cliArgs.name ? null : "text",
			name: "name",
			message: "Project name",
			initial: "my-agent"
		},
		{
			type: cliArgs["agent-name"] ? null : "text",
			name: "agentName",
			message: "Agent display name",
			initial: "Hybrid Agent"
		}
	])

	const name = cliArgs.name || response.name
	const agentName = cliArgs["agent-name"] || response.agentName

	if (!name) {
		console.log("\n  Cancelled.\n")
		process.exit(0)
	}

	const projectDir = join(process.cwd(), name)

	if (existsSync(projectDir)) {
		console.log(`\n  Error: Directory "${name}" already exists.\n`)
		process.exit(1)
	}

	mkdirSync(projectDir, { recursive: true })
	mkdirSync(join(projectDir, "src", "gateway"), { recursive: true })
	mkdirSync(join(projectDir, "src", "server"), { recursive: true })
	mkdirSync(join(projectDir, "users"), { recursive: true })

	const templateData = {
		name,
		agentName: agentName || "Hybrid Agent"
	}

	writeFileSync(join(projectDir, "package.json"), packageJson(templateData))
	writeFileSync(join(projectDir, "tsconfig.json"), tsconfigJson())
	writeFileSync(join(projectDir, "wrangler.jsonc"), wranglerJsonc(templateData))
	writeFileSync(join(projectDir, "Dockerfile"), dockerfile())
	writeFileSync(join(projectDir, "build.mjs"), buildMjs())
	writeFileSync(join(projectDir, "start.sh"), startSh())
	writeFileSync(join(projectDir, "src", "gateway", "index.ts"), gatewayIndex())
	writeFileSync(
		join(projectDir, "src", "server", "index.ts"),
		serverIndex(templateData)
	)
	writeFileSync(join(projectDir, "src", "dev-gateway.ts"), devGateway())

	const agentTemplatesDir = join(
		__dirname,
		"..",
		"..",
		"cli",
		"templates",
		"agent"
	)

	const templates = [
		"AGENTS.md",
		"SOUL.md",
		"IDENTITY.md",
		"USER.md",
		"TOOLS.md",
		"BOOTSTRAP.md",
		"HEARTBEAT.md"
	]

	for (const template of templates) {
		const templatePath = join(agentTemplatesDir, template)
		if (existsSync(templatePath)) {
			const content = readFileSync(templatePath, "utf-8")
			writeFileSync(join(projectDir, template), content)
		}
	}

	// ACL is managed automatically via deploy keypair — no manual setup needed.

	writeFileSync(join(projectDir, "SOUL.md"), soulMd(templateData))
	writeFileSync(join(projectDir, ".env.example"), envExample(templateData))
	writeFileSync(join(projectDir, ".gitignore"), gitignore())

	console.log(`\n  ✓ Created ${name}\n`)
	console.log("  Next steps:\n")
	console.log(`    cd ${name}`)
	console.log("    pnpm install")
	console.log("    pnpm dev\n")
	console.log("  Deploy:\n")
	console.log("    wrangler secret put ANTHROPIC_AUTH_TOKEN")
	console.log("    pnpm deploy\n")
}

function packageJson(data: { name: string }) {
	return JSON.stringify(
		{
			name: data.name,
			private: true,
			type: "module",
			scripts: {
				build: "node build.mjs",
				dev: "tsx src/server/index.ts & tsx src/dev-gateway.ts & wait",
				"dev:container": "tsx src/server/index.ts",
				"dev:gateway": "tsx src/dev-gateway.ts",
				deploy: "wrangler deploy",
				typecheck: "tsc --noEmit"
			},
			dependencies: {
				"@mariozechner/pi-coding-agent": "^0.70.0",
				"@sinclair/typebox": "^0.34.49",
				"@cloudflare/sandbox": "^0.7.1",
				hono: "^4.10.8"
			},
			devDependencies: {
				"@cloudflare/workers-types": "^4.20250214.0",
				"@types/node": "^22.8.6",
				"bun-types": "^1.2.0",
				tsx: "^4.19.3",
				typescript: "^5.9.2",
				wrangler: "^4.0.0"
			}
		},
		null,
		2
	)
}

function tsconfigJson() {
	return JSON.stringify(
		{
			compilerOptions: {
				lib: ["ES2022"],
				types: ["@cloudflare/workers-types", "node", "bun-types"],
				module: "ESNext",
				moduleResolution: "bundler",
				noEmit: true,
				strict: true,
				esModuleInterop: true,
				skipLibCheck: true
			},
			include: ["src/**/*"],
			exclude: ["node_modules", "dist"]
		},
		null,
		2
	)
}

function wranglerJsonc(data: { name: string }) {
	return JSON.stringify(
		{
			name: data.name,
			main: "src/gateway/index.ts",
			compatibility_date: "2025-05-06",
			compatibility_flags: ["nodejs_compat"],
			containers: [
				{
					class_name: "Sandbox",
					image: "./Dockerfile",
					instance_type: "standard-1",
					max_instances: 50
				}
			],
			durable_objects: {
				bindings: [{ class_name: "Sandbox", name: "Sandbox" }]
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["Sandbox"] }],
			vars: {
				AGENT_PORT: "8454"
			}
		},
		null,
		2
	)
}

function dockerfile() {
	return `FROM docker.io/cloudflare/sandbox:0.7.0

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY dist/server/ ./dist/server/
COPY AGENTS.md SOUL.md IDENTITY.md USER.md TOOLS.md BOOT.md BOOTSTRAP.md HEARTBEAT.md ./
COPY start.sh ./
RUN chmod +x start.sh

ENV AGENT_PORT=8454
EXPOSE 8454
`
}

function startSh() {
	return `#!/bin/bash
exec node dist/server/index.js
`
}

function gatewayIndex() {
	return `import { Sandbox } from "@cloudflare/sandbox"
import type { UIMessage } from "ai"
import { Hono } from "hono"
import { cors } from "hono/cors"

export interface GatewayEnv {
	Sandbox: DurableObjectNamespace
	ANTHROPIC_API_KEY?: string
	ANTHROPIC_BASE_URL?: string
	ANTHROPIC_AUTH_TOKEN?: string
}

type SandboxStub = InstanceType<typeof Sandbox>

const app = new Hono<{ Bindings: GatewayEnv }>()

app.use("*", cors())

app.get("/health", (c) => {
	return c.json({
		status: "healthy",
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

function getSandbox(env: GatewayEnv, teamId: string): SandboxStub {
	const id = env.Sandbox.idFromName(teamId)
	return env.Sandbox.get(id) as unknown as SandboxStub
}

async function ensureAgentServer(sandbox: SandboxStub, env: GatewayEnv) {
	const AGENT_PORT = 8454

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
			ANTHROPIC_AUTH_TOKEN: env.ANTHROPIC_AUTH_TOKEN ?? "",
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
`
}

function serverIndex(data: { agentName: string }) {
	return `import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
	AuthStorage,
	createAgentSession,
	SessionManager,
	ModelRegistry
} from "@mariozechner/pi-coding-agent"
import { Hono } from "hono"

const __dirname = dirname(fileURLToPath(import.meta.url))

const AGENT_PORT = Number.parseInt(process.env.AGENT_PORT || "8454")
const AGENT_ENDPOINT = "/api/chat"
const HEALTH_CHECK_PATH = "/health"

function resolveProjectRoot(): string {
	if (process.env.AGENT_PROJECT_ROOT) return process.env.AGENT_PROJECT_ROOT
	let dir = __dirname
	for (let i = 0; i < 5; i++) {
		try {
			readFileSync(join(dir, "AGENTS.md"), "utf-8")
			return dir
		} catch {
			dir = dirname(dir)
		}
	}
	return join(__dirname, "..", "..")
}

const PROJECT_ROOT = resolveProjectRoot()

function loadMarkdownFile(relativePath: string): string {
	try {
		return readFileSync(join(PROJECT_ROOT, relativePath), "utf-8").trim()
	} catch {
		return ""
	}
}

function loadUserMarkdown(userId?: string): string {
	if (!userId) return loadMarkdownFile("USER.md")
	const userPath = join("users", userId, "USER.md")
	const userFile = loadMarkdownFile(userPath)
	return userFile || loadMarkdownFile("USER.md")
}

const IDENTITY_MD = loadMarkdownFile("IDENTITY.md")
const SOUL_MD = loadMarkdownFile("SOUL.md")
const AGENTS_MD = loadMarkdownFile("AGENTS.md")
const TOOLS_MD = loadMarkdownFile("TOOLS.md")

interface ContainerRequest {
	messages: Array<{
		id: string
		role: "system" | "user" | "assistant"
		content: string
	}>
	chatId: string
	userId?: string
	systemPrompt?: string
}

function encodeSSE(data: string): Uint8Array {
	return new TextEncoder().encode(\`data: \${data}\\n\\n\`)
}

function encodeSSEJson(data: unknown): Uint8Array {
	return encodeSSE(JSON.stringify(data))
}

function encodeDone(): Uint8Array {
	return new TextEncoder().encode("data: [DONE]\\n\\n")
}

async function runAgent(req: ContainerRequest): Promise<ReadableStream<Uint8Array>> {
	const systemPrompt = [
		IDENTITY_MD,
		SOUL_MD,
		req.systemPrompt,
		AGENTS_MD,
		TOOLS_MD
	].filter(Boolean).join("\\n\\n")

	const prompt = req.messages.at(-1)?.content ?? ""

	const isUsingOpenRouter = (process.env.ANTHROPIC_BASE_URL || "").includes("openrouter.ai")
	const authToken = process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.OPENROUTER_API_KEY
	const apiKey = process.env.ANTHROPIC_API_KEY
	const modelId = process.env.AGENT_MODEL || (isUsingOpenRouter ? "anthropic/claude-sonnet-4" : "claude-sonnet-4-20250514")

	if (!apiKey && !authToken) {
		return new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encodeSSEJson({ type: "error", content: "No API key configured" }))
				controller.enqueue(encodeDone())
				controller.close()
			}
		})
	}

	const authStorage = AuthStorage.create()
	if (isUsingOpenRouter) {
		if (authToken) authStorage.setRuntimeApiKey("openrouter", authToken)
	} else {
		if (apiKey) authStorage.setRuntimeApiKey("anthropic", apiKey)
	}

	const modelRegistry = ModelRegistry.create(authStorage)
	const activeModel = modelRegistry.getAll().find(m => m.id === modelId)
	if (!activeModel) {
		return new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encodeSSEJson({ type: "error", content: \`Model \${modelId} not found\` }))
				controller.enqueue(encodeDone())
				controller.close()
			}
		})
	}

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				const { session } = await createAgentSession({
					cwd: PROJECT_ROOT,
					model: activeModel,
					authStorage,
					sessionManager: SessionManager.inMemory(),
				})

				await session.steer(\`[System Instruction Override]\\n\${systemPrompt}\`)
				await session.prompt(prompt)
				for await (const event of session.stream()) {
					if (event.type === "message_update" && event.assistantMessageEvent) {
						const ev = event.assistantMessageEvent
						if (ev.type === "text_delta") {
							controller.enqueue(encodeSSEJson({ type: "text", content: ev.delta }))
						} else if (ev.type === "toolcall_start") {
							const block = (ev as any).partial?.content?.[(ev as any).contentIndex]
							controller.enqueue(encodeSSEJson({
								type: "tool-call-start",
								toolCallId: block?.id || "",
								toolName: block?.name || "unknown"
							}))
						} else if (ev.type === "toolcall_delta") {
							const block = (ev as any).partial?.content?.[(ev as any).contentIndex]
							controller.enqueue(encodeSSEJson({
								type: "tool-call-delta",
								toolCallId: block?.id || "",
								argsTextDelta: (ev as any).delta || ""
							}))
						} else if (ev.type === "toolcall_end") {
							controller.enqueue(encodeSSEJson({
								type: "tool-call-end",
								toolCallId: (ev as any).toolCall?.id || ""
							}))
						}
					}
				}

				const stats = session.getSessionStats()
				controller.enqueue(encodeSSEJson({
					type: "usage",
					inputTokens: stats.tokens.input,
					outputTokens: stats.tokens.output,
					totalCostUsd: stats.cost,
					numTurns: 1
				}))

				controller.enqueue(encodeDone())
				controller.close()
			} catch (err) {
				controller.enqueue(encodeSSEJson({
					type: "error",
					content: err instanceof Error ? err.message : "Agent error"
				}))
				controller.enqueue(encodeDone())
				controller.close()
			}
		}
	})

	return stream
}

const app = new Hono()

app.get(HEALTH_CHECK_PATH, (c) => {
	return c.json({ ok: true, service: "${data.agentName}" })
})

app.post(AGENT_ENDPOINT, async (c) => {
	const req = await c.req.json<ContainerRequest>()
	const stream = await runAgent(req)

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive"
		}
	})
})

process.on("uncaughtException", (err) => {
	console.error("[agent] uncaughtException:", err)
	process.exit(1)
})

process.on("unhandledRejection", (reason) => {
	console.error("[agent] unhandledRejection:", reason)
	process.exit(1)
})

console.log(\`${data.agentName} listening on http://localhost:\${AGENT_PORT}\`)

import { serve } from "@hono/node-server"
serve({ hostname: "0.0.0.0", port: AGENT_PORT, fetch: app.fetch })

export default app
`
}

function soulMd(data: { agentName: string }) {
	return `## Identity

You are ${data.agentName}. Be accurate, concise, and practical.

## Principles

- Verify before asserting. If unsure, say so.
- Use available tools to find information.
- Never claim actions you haven't completed.
- Ask for clarification when needed.

## Style

- Be direct and brief.
- Use bullet points over numbered lists.
- Anticipate follow-up questions.
`
}

function envExample(templateData: { name: string }) {
	return `# ${templateData.name} Agent
AGENT_NAME=${templateData.name}

# Anthropic API (or use OpenRouter below)
ANTHROPIC_API_KEY=your_api_key_here

# OpenRouter proxy (optional)
# ANTHROPIC_BASE_URL=https://openrouter.ai/api
# ANTHROPIC_AUTH_TOKEN=your_openrouter_key
`
}

function gitignore() {
	return `node_modules/
dist/
.wrangler/
.dev.vars
.env
*.log
`
}

function buildMjs() {
	return `import { build } from "esbuild"

await build({
	entryPoints: ["src/server/index.ts"],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: "dist/server/index.js",
	minify: true
})

console.log("Build complete")
`
}

function devGateway() {
	return `import type { UIMessage } from "ai"
import { Hono } from "hono"
import { cors } from "hono/cors"

const app = new Hono()

app.use("*", cors())

app.get("/health", (c) => {
	return c.json({ status: "healthy", mode: "dev-gateway" })
})

function extractTextFromParts(parts: UIMessage["parts"]): string {
	return parts
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("")
}

app.post("/api/chat", async (c) => {
	const body = await c.req.json<{
		messages: UIMessage[]
		chatId: string
		teamId?: string
		systemPrompt?: string
	}>()

	const messages = body.messages.map((m) => ({
		id: m.id,
		role: m.role,
		content: extractTextFromParts(m.parts)
	}))

	const containerRes = await fetch("http://localhost:8454/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			messages,
			chatId: body.chatId,
			teamId: body.teamId,
			systemPrompt: body.systemPrompt
		})
	})

	return new Response(containerRes.body, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive"
		}
	})
})

console.log("Dev gateway running on http://localhost:8787")
Bun.serve({ port: 8787, fetch: app.fetch })
`
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
