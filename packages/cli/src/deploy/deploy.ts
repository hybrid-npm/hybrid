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
}

export async function runDeploy(
	options: DeployOptions,
	projectRoot: string,
	packageDir: string
) {
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

	// 6. Provision or reuse
	console.log(`\n📋 Instance: ${instanceName}`)
	const existingStatus = await provider.status(instanceName)

	if (existingStatus === "running" && !options.force) {
		console.log(`   ⚠️  Instance "${instanceName}" is already running.`)
		const prompts = (await import("prompts")).default
		const choice = await prompts({
			type: "select",
			name: "action",
			message: "What do you want to do?",
			choices: [
				{ title: "Redeploy (overwrite artifacts)", value: "redeploy" },
				{ title: "Force recreate VM", value: "force" },
				{ title: "Cancel", value: "cancel" }
			]
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
	}

	if (
		existingStatus === "unknown" ||
		existingStatus === "stopped" ||
		options.force
	) {
		await provider.provision(instanceName)
	}

	// 7. Deploy artifacts
	await provider.deploy(instanceName, distDir)

	// 8. Print results
	const endpoint = await provider.endpoint(instanceName)
	console.log(`\n   Instance: ${instanceName}`)
	console.log(`   URL: ${endpoint}`)
	console.log(`   Health: ${endpoint}/health`)
	console.log(`   Chat: ${endpoint}/api/chat`)
	console.log("\n✅ Deployed!")
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
	const files = ["server/index.cjs"]
	for (const file of files) {
		const src = resolve(agentDistDir, file)
		if (existsSync(src)) {
			cpSync(src, resolve(distDir, file))
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
			"@anthropic-ai/claude-agent-sdk": "^0.2.38",
			"@hono/node-server": "^1.13.5",
			ai: "^6.0.0",
			"better-sqlite3": "^11.0.0",
			dotenv: "^16.4.5",
			hono: "^4.10.8",
			"sql.js": "^1.11.0",
			zod: "^4.0.0"
		}
	}
	writeFileSync(
		resolve(distDir, "package.json"),
		JSON.stringify(deployPkg, null, 2)
	)

	// Generic Dockerfile
	writeFileSync(
		resolve(distDir, "Dockerfile"),
		`FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY server/ ./server/
COPY SOUL.md AGENTS.md IDENTITY.md TOOLS.md BOOT.md BOOTSTRAP.md HEARTBEAT.md USER.md ./
COPY credentials/ ./credentials/ 2>/dev/null || true
ENV AGENT_PORT=8454
ENV NODE_ENV=production
ENV DATA_ROOT=/app/data
EXPOSE 8454
USER node
CMD ["node", "server/index.cjs"]
`
	)

	// start.sh
	writeFileSync(
		resolve(distDir, "start.sh"),
		`#!/bin/sh\nnode server/index.cjs\n`
	)

	// .hybrid-deploy.json manifest
	writeFileSync(
		resolve(distDir, ".hybrid-deploy.json"),
		JSON.stringify(
			{
				version: 1,
				provider: "firecracker",
				startCommand: "node server/index.cjs",
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
