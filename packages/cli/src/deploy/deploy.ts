import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from "node:fs"
import { resolve } from "node:path"
import type { ProviderName } from "./deploy-provider"
import { getProvider } from "./index"

// ============================================================================
// Unified Deploy Orchestration
// ============================================================================

export interface DeployOptions {
	/** Platform/provider name (sprites, e2b, northflank, daytona) */
	platform?: string
	/** Instance name (VM name) */
	name?: string
	/** Skip build step */
	skipBuild?: boolean
	/** Force recreate instance even if it exists */
	force?: boolean
	/** Make the URL public without an auth wall */
	public?: boolean
	/** Start tailing logs immediately after deploy */
	tail?: boolean
}

export interface DeployResult {
	endpoint: string
	keyPair?: {
		privateKey: string
		address: string
	}
}

async function ensureAgentModel(projectRoot: string) {
	const { readFileSync, writeFileSync, existsSync } = await import("node:fs")
	const { resolve } = await import("node:path")
	const envPath = resolve(projectRoot, ".env")
	if (!existsSync(envPath)) return

	let envContent = readFileSync(envPath, "utf-8")
	if (envContent.includes("AGENT_MODEL=")) return

	console.log("\n🤖 No AGENT_MODEL configured in .env. Fetching available models...")
	process.env.NODE_ENV = "development" // skip production checks if any
	
	let isUsingOpenRouter = false
	if (envContent.includes("ANTHROPIC_BASE_URL=https://openrouter.ai/api")) {
		isUsingOpenRouter = true
	} else if (process.env.ANTHROPIC_BASE_URL?.includes("openrouter.ai")) {
		isUsingOpenRouter = true
	}

	const { ModelRegistry, AuthStorage } = await import("@mariozechner/pi-coding-agent")
	// AuthStorage loads from .env internally if initialized
	const authStorage = AuthStorage.create()
	// Set the key from the file to let pi know
	const apiKeyLine = envContent.split("\n").find(l => l.startsWith(isUsingOpenRouter ? "ANTHROPIC_AUTH_TOKEN=" : "ANTHROPIC_API_KEY=") && !l.startsWith("#"))
	if (apiKeyLine) {
		const key = apiKeyLine.split("=")[1].trim()
		authStorage.setRuntimeApiKey(isUsingOpenRouter ? "openrouter" : "anthropic", key)
	}

	const registry = ModelRegistry.create(authStorage)
	const models = await registry.getAvailable()
	const providerFilter = isUsingOpenRouter ? "openrouter" : "anthropic"
	
	const choices = models
		.filter((m: any) => m.provider === providerFilter)
		.map((m: any) => ({ title: m.name, value: m.id }))
	
	if (choices.length === 0) {
		console.warn(`⚠️  No models found for ${providerFilter}. Defaulting to Sonnet.`)
		envContent += `\n# Select the model ID to use\nAGENT_MODEL=${isUsingOpenRouter ? "anthropic/claude-sonnet-4" : "claude-sonnet-4-20250514"}\n`
		writeFileSync(envPath, envContent)
		return
	}

	const prompts = (await import("prompts")).default
	const choice = await prompts({
		type: "autocomplete",
		name: "model",
		message: "Select a model to deploy with",
		choices,
		initial: choices.findIndex((c: any) => c.value.includes("sonnet")),
		suggest: async (input: string, choices: any[]) => choices.filter((i: any) => i.title.toLowerCase().includes(input.toLowerCase())),
	})

	if (!choice.model) {
		console.log("\n  Cancelled.\n")
		process.exit(0)
	}

	envContent += `\n# Select the model ID to use\nAGENT_MODEL=${choice.model}\n`
	writeFileSync(envPath, envContent)
	console.log(`✅ Saved AGENT_MODEL=${choice.model} to .env`)
}

export async function runDeploy(
	options: DeployOptions,
	projectRoot: string,
	packageDir: string
): Promise<DeployResult> {
	// 0. Ensure a model is selected
	await ensureAgentModel(projectRoot)

	// 1. Resolve platform
	const platform = resolvePlatform(options.platform, projectRoot)

	// 2. Load provider
	const provider = await getProvider(platform as ProviderName)
	console.log(`\n🚀 Deploying to ${provider.label}...`)

	// 3. Auth check
	try {
		await provider.authCheck()
	} catch (err: any) {
		console.error(`\n❌ ${err.message}`)
		process.exit(1)
	}

	// 4. Build
	if (!options.skipBuild) {
		await runBuild(projectRoot, packageDir)
	}

	// 5. Determine instance name
	const distDir = resolve(projectRoot, "dist")
	const instanceName = options.name || provider.defaultName(projectRoot)

	// 6. Provision or reuse based on current status
	console.log(`\n📋 Instance: ${instanceName}`)
	const existingStatus = await provider.status(instanceName)

	if (options.force) {
		if (existingStatus === "running" || existingStatus === "sleeping") {
			await provider.teardown(instanceName)
		}
		await provider.provision(instanceName)
	} else if (existingStatus === "sleeping") {
		console.log(`   ☀️  Waking sleeping instance...`)
		await provider.wake(instanceName)
	} else if (existingStatus === "running") {
		console.log(`   ⚠️  Instance "${instanceName}" is already running.`)
		const prompts = (await import("prompts")).default
		const choice = await prompts({
			type: "select",
			name: "action",
			message: "What do you want to do?",
			choices: [
				{ title: "Redeploy (overwrite artifacts)", value: "redeploy" },
				{ title: "Force recreate VM", value: "force" },
				{ title: "Cancel", value: "cancel" },
			],
		})
		if (choice.action === "cancel") {
			console.log("\n  Cancelled.\n")
			process.exit(0)
		}
		if (choice.action === "force") {
			await provider.teardown(instanceName)
			await provider.provision(instanceName)
		}
		// redeploy: use existing instance, just push new artifacts
	} else if (existingStatus === "unknown" || existingStatus === "stopped") {
		await provider.provision(instanceName)
	} else if (existingStatus === "provisioning") {
		console.error(`   ⏳ Instance still provisioning, try again shortly.`)
		process.exit(1)
	} else if (existingStatus === "error") {
		console.error(`   ❌ Instance in error state. Run 'hybrid deploy teardown ${instanceName}' then retry.`)
		process.exit(1)
	}

	// 7. Deploy artifacts
	await provider.deploy(instanceName, distDir)

	// 8. Key management — ensure an identity key exists
	const keyPair = await ensureDeployKey(projectRoot, distDir)

	// 8.5 Setup public visibility if requested
	if (options.public) {
		console.log(`\n🌍 Making sprite URL public...`)
		try {
			await provider.makePublic?.(instanceName)
			console.log(`   ✓ URL is now public`)
		} catch (err: any) {
			console.error(`   ⚠️ Failed to make sprite public: ${err.message}`)
		}
	}

	// 9. Print results
	const endpoint = await provider.endpoint(instanceName)
	console.log(`\n   Instance: ${instanceName}`)
	console.log(`   URL: ${endpoint}`)
	console.log(`   Health: ${endpoint}/health`)
	console.log(`   Chat: ${endpoint}/api/chat`)

	if (keyPair) {
		console.log("\n  ─────────────────────────────────────────────────")
		console.log("  🔑 Your agent identity key (save this securely!)")
		console.log("  ─────────────────────────────────────────────────")
		console.log(`  Address: ${keyPair.address}`)
		console.log(`  Private Key: ${keyPair.privateKey}`)
		console.log("  ─────────────────────────────────────────────────")
		console.log("\n  Use with: hybrid msg \"hi\"")
		console.log(`  Or set:   PRIVATE_KEY=${keyPair.privateKey}`)
		console.log("  ─────────────────────────────────────────────────\n")
	}

	console.log("\n✅ Deployed!")

	if (options.tail && typeof provider.logs === "function") {
		console.log("\n📜 Tailing logs...")
		await provider.logs(instanceName, true)
	}

	return { endpoint, keyPair }
}

export async function runSleep(
	name: string,
	platform: string | undefined,
	projectRoot: string
) {
	const provider = await getProvider(
		resolvePlatform(platform, projectRoot) as ProviderName
	)
	await provider.authCheck()
	await provider.sleep(name)
}

export async function runWake(
	name: string,
	platform: string | undefined,
	projectRoot: string
) {
	const provider = await getProvider(
		resolvePlatform(platform, projectRoot) as ProviderName
	)
	await provider.authCheck()
	await provider.wake(name)
}

export async function runStatus(
	name: string,
	platform: string | undefined,
	projectRoot: string
) {
	const provider = await getProvider(
		resolvePlatform(platform, projectRoot) as ProviderName
	)
	await provider.authCheck()
	const status = await provider.status(name)
	const endpoint = await provider.endpoint(name)
	console.log(`\n📋 Instance: ${name}`)
	console.log(`   Status: ${status}`)
	console.log(`   URL: ${endpoint}`)
}

export async function runLogs(
	name: string,
	follow: boolean,
	platform: string | undefined,
	projectRoot: string
) {
	const provider = await getProvider(
		resolvePlatform(platform, projectRoot) as ProviderName
	)
	await provider.authCheck()
	await provider.logs(name, follow)
}

export async function runTeardown(
	name: string,
	platform: string | undefined,
	projectRoot: string
) {
	const provider = await getProvider(
		resolvePlatform(platform, projectRoot) as ProviderName
	)
	await provider.authCheck()
	await provider.teardown(name)
}

// ============================================================================
// Helpers
// ============================================================================

function resolvePlatform(
	platform?: string,
	projectRoot?: string
): ProviderName {
	if (platform) return platform as ProviderName

	// Check hybrid.config.ts
	if (projectRoot) {
		const configPath = resolve(projectRoot, "hybrid.config.ts")
		if (existsSync(configPath)) {
			const content = readFileSync(configPath, "utf-8")
			const match = content.match(
				/(?:platform|deployPlatform)\s*[=:]\s*["']([^"']+)["']/
			)
			if (match) return match[1] as ProviderName
		}
	}

	// Default to sprites (only implemented provider right now)
	return "sprites"
}

// ============================================================================
// Build (extracted subset for deploy use)
// ============================================================================

// ============================================================================
// Key Management — Ed25519 identity for agent access
// ============================================================================

/** Path for the deployer's private key (kept locally, never uploaded) */
function getLocalKeyPath(projectRoot: string): string {
	return resolve(projectRoot, ".hybrid-key.json")
}

/**
 * Ensure an identity key exists for talking to this agent.
 * - If PRIVATE_KEY env is set, derive pubkey and add to allowFrom.
 * - If a local .hybrid-key.json exists, use it and ensure pubkey is in allowFrom.
 * - Otherwise generate a new key, save locally, add pubkey to allowFrom.
 *
 * The private key stays on the deployer machine. Only the public address
 * gets written to the agent's credentials/allowFrom.json.
 * Always returns the keypair so it can be printed.
 */
async function ensureDeployKey(
	projectRoot: string,
	distDir: string
): Promise<{ privateKey: string; address: string } | undefined> {
	const { generateEthKeypair } = await import("../lib/sign")
	const credentialsDir = resolve(projectRoot, "credentials")
	const aclPath = resolve(credentialsDir, "allowFrom.json")
	const localKeyPath = getLocalKeyPath(projectRoot)

	let existingKey: { privateKey: string; address: string } | undefined

	// 1. Check env override
	const envKey = process.env.PRIVATE_KEY
	if (envKey) {
		const { privateKeyToAccount } = await import("viem/accounts")
		const account = privateKeyToAccount(envKey as `0x${string}`)
		existingKey = { privateKey: envKey, address: account.address }
	}

	// 2. Check local key file
	if (!existingKey && existsSync(localKeyPath)) {
		try {
			existingKey = JSON.parse(readFileSync(localKeyPath, "utf-8"))
		} catch {
			// corrupt file, will generate new
		}
	}

	// 3. Generate new key if needed
	let keyPair: { privateKey: string; address: string }
	if (existingKey) {
		keyPair = existingKey
	} else {
		keyPair = generateEthKeypair()
		writeFileSync(localKeyPath, JSON.stringify(keyPair, null, 2))
	}

	// 4. Ensure public address is in allowFrom.json
	mkdirSync(credentialsDir, { recursive: true })
	let acl: { version: number; allowFrom: string[] } = {
		version: 1,
		allowFrom: []
	}
	if (existsSync(aclPath)) {
		try {
			acl = JSON.parse(readFileSync(aclPath, "utf-8"))
		} catch {}
	}

	const normalized = keyPair.address.toLowerCase()
	if (!acl.allowFrom.includes(normalized)) {
		acl.allowFrom.push(normalized)
		writeFileSync(aclPath, JSON.stringify(acl, null, 2))
	}

	// 5. Copy updated credentials into dist
	cpSync(credentialsDir, resolve(distDir, "credentials"), { recursive: true })

	return keyPair
}

// ============================================================================
// Build (extracted subset for deploy use)
// ============================================================================

async function runBuild(projectRoot: string, packageDir: string) {
	const distDir = resolve(projectRoot, "dist")

	console.log("\n🔧 Building agent...")

	if (existsSync(distDir)) {
		rmSync(distDir, { recursive: true, force: true })
	}
	mkdirSync(distDir, { recursive: true })
	mkdirSync(resolve(distDir, "server"), { recursive: true })

	console.log("📦 Copying agent runtime...")
	const agentDistDir = resolve(packageDir, "dist")
	const files = ["server/index.mjs"]
	for (const file of files) {
		const src = resolve(agentDistDir, file)
		if (existsSync(src)) {
			cpSync(src, resolve(distDir, file))
		} else {
			console.error(`  Missing: ${file} - run 'pnpm build' in hybrid package (looked at ${src})`)
			process.exit(1)
		}
	}

	console.log("📋 Copying agent config...")
	const configFiles = [
		"SOUL.md",
		"AGENTS.md",
		"IDENTITY.md",
		"TOOLS.md",
		"BOOT.md",
		"BOOTSTRAP.md",
		"HEARTBEAT.md",
		"USER.md"
	]
	for (const file of configFiles) {
		const src = resolve(projectRoot, file)
		if (existsSync(src)) {
			cpSync(src, resolve(distDir, file))
		}
	}

	// Copy .env if it exists (contains API keys)
	const envPath = resolve(projectRoot, ".env")
	if (existsSync(envPath)) {
		cpSync(envPath, resolve(distDir, ".env"))
		console.log("   ✓ .env")
	} else {
		console.log("   ⚠️  No .env found — agent will have no API key")
	}

	// Copy credentials
	const credsDir = resolve(projectRoot, "credentials")
	if (existsSync(credsDir)) {
		cpSync(credsDir, resolve(distDir, "credentials"), { recursive: true })
	}

	// package.json
	const deployPkg = {
		name: "hybrid",
		version: "1.0.0",
		type: "module",
		dependencies: {
			"@hono/node-server": "^1.13.5",
			"@mariozechner/pi-coding-agent": "0.19.1",
			ai: "^6.0.0",
			"better-sqlite3": "^11.0.0",
			dotenv: "^16.4.5",
			hono: "^4.10.8",
			"sql.js": "^1.11.0",
			viem: "^2.46.2",
			zod: "^4.0.0"
		}
	}
	writeFileSync(
		resolve(distDir, "package.json"),
		JSON.stringify(deployPkg, null, 2)
	)

	// Generate Dockerfile — only COPY files that exist in dist
	const present = configFiles.filter((f) =>
		existsSync(resolve(distDir, f)),
	)
	const hasCredentials = existsSync(resolve(distDir, "credentials"))
	const configCopy =
		present.length > 0 ? `COPY ${present.join(" ")} ./` : ""
	const credCopy = hasCredentials
		? "COPY credentials/ ./credentials/"
		: "COPY .hybrid-deploy.json ./"

	writeFileSync(
		resolve(distDir, "Dockerfile"),
		`FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY server/ ./server/
COPY ${configCopy} ./
${credCopy}
ENV AGENT_PORT=8454
ENV NODE_ENV=production
ENV DATA_ROOT=/app/data
EXPOSE 8454
USER node
CMD ["node", "server/index.mjs"]
`
	)

	// start.sh
	writeFileSync(
		resolve(distDir, "start.sh"),
		`#!/bin/sh\nnode server/index.mjs\n`
	)

	// .hybrid-deploy.json manifest
	writeFileSync(
		resolve(distDir, ".hybrid-deploy.json"),
		JSON.stringify(
			{
				version: 1,
				provider: "firecracker",
				startCommand: "node server/index.mjs",
				port: 8454,
				healthPath: "/health"
			},
			null,
			2
		)
	)

	console.log("\n✅ Build complete!")
	console.log(`   Output: ${distDir}`)
}
