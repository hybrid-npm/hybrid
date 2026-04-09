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

	const aclContent = `## Owners

<!-- Add your wallet address here to become the owner -->
<!-- Example: 0xabc123... -->
- YOUR_WALLET_ADDRESS_HERE
`
	writeFileSync(join(projectDir, "ACL.md"), aclContent)

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
				"@anthropic-ai/claude-agent-sdk": "^0.2.38",
				"@cloudflare/sandbox": "^0.7.1",
				ai: "^6.0.0",
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
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { type Options, query } from "@anthropic-ai/claude-agent-sdk"
import { Hono } from "hono"

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const AGENT_PORT = Number.parseInt(process.env.AGENT_PORT || "8454")
const AGENT_ENDPOINT = "/api/chat"
const HEALTH_CHECK_PATH = "/health"

function resolveClaudeCodeExecutable(): string {
	if (process.env.CLAUDE_CODE_EXECUTABLE_PATH)
		return process.env.CLAUDE_CODE_EXECUTABLE_PATH
	const sdkDir = dirname(
		require.resolve("@anthropic-ai/claude-agent-sdk/cli.js")
	)
	return join(sdkDir, "cli.js")
}

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
const BOOT_MD = loadMarkdownFile("BOOT.md")
const BOOTSTRAP_MD = loadMarkdownFile("BOOTSTRAP.md")
const HEARTBEAT_MD = loadMarkdownFile("HEARTBEAT.md")

interface ContainerRequest {
	messages: Array<{
		id: string
		role: "system" | "user" | "assistant"
		content: string
	}>
	chatId: string
	teamId?: string
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

const HISTORY_TAIL_SIZE = 20

function buildPromptWithHistory(
	messages: ContainerRequest["messages"]
): string {
	if (messages.length <= 1) {
		return messages.at(-1)?.content ?? ""
	}

	const currentMessage = messages.at(-1)
	if (!currentMessage) return ""

	const priorMessages = messages.slice(0, -1)

	let historyMessages: ContainerRequest["messages"]
	if (priorMessages.length <= HISTORY_TAIL_SIZE) {
		historyMessages = priorMessages
	} else {
		const tail = priorMessages.slice(-HISTORY_TAIL_SIZE + 1)
		const first = priorMessages.slice(0, 1)
		const omitted: ContainerRequest["messages"] = [
			{
				id: "",
				role: "system",
				content: \`... \${priorMessages.length - HISTORY_TAIL_SIZE} earlier messages omitted ...\`
			}
		]
		historyMessages = [...first, ...omitted, ...tail]
	}

	const historyBlock = historyMessages
		.map((m) => \`[\${m.role}]: \${m.content}\`)
		.join("\\n\\n")

	return \`<conversation_history>
\${historyBlock}
</conversation_history>

\${currentMessage.content}\`
}

function extractTextDelta(msg: any): string | null {
	if (msg.type === "stream_event") {
		const event = msg.event
		if (
			event?.type === "content_block_delta" &&
			event.delta?.type === "text_delta"
		) {
			return event.delta.text ?? ""
		}
	} else if (msg.type === "assistant") {
		const content = msg.message?.content
		if (Array.isArray(content)) {
			const textBlock = content.find((b: any) => b.type === "text")
			return textBlock?.text ?? null
		}
	}
	return null
}

function runAgent(req: ContainerRequest): ReadableStream<Uint8Array> {
	const USER_MD = loadUserMarkdown(req.userId)
	
	const systemPrompt = [
		IDENTITY_MD,
		SOUL_MD,
		req.systemPrompt,
		AGENTS_MD,
		TOOLS_MD,
		USER_MD
	]
		.filter(Boolean)
		.join("\\n\\n")
	const prompt = buildPromptWithHistory(req.messages)

	const abortController = new AbortController()

	const options: Options = {
		abortController,
		systemPrompt,
		model: "claude-sonnet-4-20250514",
		cwd: PROJECT_ROOT,
		pathToClaudeCodeExecutable: resolveClaudeCodeExecutable(),
		settingSources: [],
		permissionMode: "bypassPermissions",
		allowDangerouslySkipPermissions: true,
		tools: [],
		maxTurns: 25,
		includePartialMessages: true,
		env: {
			...process.env,
			ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
			ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN
		}
	}

	console.log(\`[agent] calling query() with prompt="\${prompt.slice(0, 200)}"\`)

	const conversation = query({ prompt, options })

	let messageCount = 0

	return new ReadableStream<Uint8Array>({
		cancel() {
			console.log("[agent] stream cancelled, aborting agent")
			abortController.abort()
		},
		async pull(controller) {
			try {
				const { value: msg, done } = await conversation.next()
				if (done) {
					console.log(\`[agent] conversation done after \${messageCount} messages\`)
					controller.enqueue(encodeDone())
					controller.close()
					return
				}

				messageCount++

				if (msg.type === "stream_event") {
					const event = msg.event as { type: string }
					if (event.type !== "content_block_delta") {
						console.log(\`[agent] msg #\${messageCount} event.type="\${event.type}"\`)
					}

					const text = extractTextDelta(msg)
					if (text) {
						controller.enqueue(encodeSSEJson({ type: "text", content: text }))
						return
					}

					if (event.type === "content_block_start") {
						const block = (event as any).content_block
						if (block?.type === "tool_use") {
							controller.enqueue(
								encodeSSEJson({
									type: "tool-call-start",
									toolCallId: block.id,
									toolName: block.name
								})
							)
						}
						return
					}

					if (event.type === "content_block_delta") {
						const delta = (event as any).delta
						if (delta?.type === "input_json_delta") {
							controller.enqueue(
								encodeSSEJson({
									type: "tool-call-delta",
									toolCallId: (event as any).index?.toString(),
									argsTextDelta: delta.partial_json ?? ""
								})
							)
						}
						return
					}

					if (event.type === "content_block_stop") {
						controller.enqueue(
							encodeSSEJson({
								type: "tool-call-end",
								toolCallId: (event as any).index?.toString()
							})
						)
						return
					}
				} else if (msg.type === "result") {
					const usage = msg.usage
					controller.enqueue(
						encodeSSEJson({
							type: "usage",
							inputTokens: usage?.input_tokens ?? 0,
							outputTokens: usage?.output_tokens ?? 0,
							totalCostUsd: msg.total_cost_usd ?? 0,
							numTurns: msg.num_turns ?? 1
						})
					)
				} else if (msg.type === "assistant") {
					const text = extractTextDelta(msg)
					if (text) {
						controller.enqueue(encodeSSEJson({ type: "text", content: text }))
					}
				}
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : "Agent error"
				console.error("[agent] error:", err)
				try {
					controller.enqueue(encodeSSEJson({ type: "error", content: errorMessage }))
					controller.enqueue(encodeDone())
					controller.close()
				} catch {
					// Stream already cancelled
				}
			}
		}
	})
}

const app = new Hono()

app.get(HEALTH_CHECK_PATH, (c) => {
	return c.json({ ok: true, service: "${data.agentName}" })
})

app.post(AGENT_ENDPOINT, async (c) => {
	const req = await c.req.json<ContainerRequest>()
	const stream = runAgent(req)

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
console.log(\`  Templates loaded:\`)
console.log(\`    IDENTITY.md      \${IDENTITY_MD ? "✓" : "✗"}\`)
console.log(\`    SOUL.md          \${SOUL_MD ? "✓" : "✗"}\`)
console.log(\`    AGENTS.md        \${AGENTS_MD ? "✓" : "✗"}\`)
console.log(\`    TOOLS.md         \${TOOLS_MD ? "✓" : "✗"}\`)
console.log(\`    USER.md          \${loadMarkdownFile("USER.md") ? "✓" : "✗"}\`)
console.log(\`    BOOT.md          \${BOOT_MD ? "✓" : "✗"}\`)
console.log(\`    BOOTSTRAP.md     \${BOOTSTRAP_MD ? "✓" : "✗"}\`)
console.log(\`    HEARTBEAT.md     \${HEARTBEAT_MD ? "✓" : "✗"}\`)

Bun.serve({
	port: AGENT_PORT,
	fetch: app.fetch
})

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

function envExample() {
	return `# Anthropic API (or use OpenRouter below)
ANTHROPIC_API_KEY=your_api_key_here

# OpenRouter proxy (optional)
# ANTHROPIC_BASE_URL=https://openrouter.ai/api
# ANTHROPIC_AUTH_TOKEN=your_openrouter_key

# Agent configuration
WALLET_KEY=your_private_key_here
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
