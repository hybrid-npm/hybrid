#!/usr/bin/env node

const nodeVersion = process.versions.node
const [major] = nodeVersion.split(".").map(Number)
if (!major || major < 20) {
	console.error("Error: Node.js version 20 or higher is required")
	process.exit(1)
}

async function main() {
	const args = process.argv.slice(2)
	const command = args[0]

	if (command === "dev") {
		return dev(args.includes("--docker"))
	}

	if (command === "deploy") {
		return deploy(args[1])
	}

	if (command === "init") {
		return init(args[1])
	}

	if (command === "register") {
		return register()
	}

	console.log("Usage: hybrid <command>")
	console.log("")
	console.log("Commands:")
	console.log("  init <name>     Initialize a new agent from template")
	console.log("  dev             Start development server")
	console.log("  dev --docker    Start development server with Docker")
	console.log("  register        Register wallet on XMTP network")
	console.log("  deploy          Deploy to default platform (fly)")
	console.log("  deploy fly      Deploy to Fly.io")
	console.log("  deploy railway  Deploy to Railway")
	console.log("")
	console.log("Environment Variables:")
	console.log("  CLOUDFLARE_API_TOKEN    Required for Cloudflare deploy")
	console.log("  FLY_API_TOKEN           Required for Fly.io deploy")
	console.log("")

	if (command) {
		process.exit(1)
	}
}

async function dev(useDocker: boolean) {
	const { execSync } = await import("node:child_process")
	const { resolve, dirname } = await import("node:path")
	const { fileURLToPath } = await import("node:url")

	const __dirname = dirname(fileURLToPath(import.meta.url))
	const rootDir = resolve(__dirname, "../../..")

	console.log("\n🔧 Building packages...")

	try {
		execSync("npx pnpm --filter hybrid/agent run build", {
			cwd: rootDir,
			stdio: "inherit"
		})
	} catch (error) {
		console.error("Build failed")
		process.exit(1)
	}

	if (useDocker) {
		console.log("\n🐳 Starting with Docker...\n")
		console.log("Docker dev not yet implemented for new structure")
		return
	}

	console.log("\n🚀 Starting agent (server + sidecar)...\n")

	const agentDir = resolve(rootDir, "agents/hybrid-agent")
	try {
		execSync("npx pnpm run dev", {
			cwd: agentDir,
			stdio: "inherit"
		})
	} catch {
		console.error("\n❌ Failed to start dev server")
		process.exit(1)
	}
}

async function deploy(platform = "fly") {
	const { spawn } = await import("node:child_process")
	const { execSync } = await import("node:child_process")
	const { resolve, dirname } = await import("node:path")
	const { fileURLToPath } = await import("node:url")

	const __dirname = dirname(fileURLToPath(import.meta.url))
	const rootDir = resolve(__dirname, "../../..")

	if (platform === "fly" || !platform) {
		const flyToken = process.env.FLY_API_TOKEN
		if (!flyToken) {
			console.error("Error: FLY_API_TOKEN is required")
			console.error("Usage: FLY_API_TOKEN=xxx hybrid deploy fly")
			process.exit(1)
		}

		const deployDir = resolve(rootDir, "deployments/flyio")

		console.log("Building packages/agent...")

		try {
			execSync("npx pnpm --filter hybrid/agent run build", {
				cwd: rootDir,
				stdio: "inherit"
			})
		} catch {
			console.error("Build failed")
			process.exit(1)
		}

		console.log("Deploying to Fly.io...")

		await new Promise<void>((resolve, reject) => {
			const deploy = spawn("fly", ["deploy", "--config", "fly.toml"], {
				cwd: deployDir,
				stdio: "inherit",
				env: { ...process.env, FLY_API_TOKEN: flyToken }
			})
			deploy.on("close", (code) => {
				if (code === 0) resolve()
				else reject(new Error(`Deploy failed with code ${code}`))
			})
		})

		console.log("✅ Deploy complete!")
		return
	}

	if (platform === "railway") {
		console.log("Railway deploy not yet implemented")
		return
	}

	if (platform === "cloudflare" || platform === "cf") {
		const apiToken = process.env.CLOUDFLARE_API_TOKEN
		if (!apiToken) {
			console.error("Error: CLOUDFLARE_API_TOKEN is required")
			console.error("Usage: CLOUDFLARE_API_TOKEN=xxx hybrid deploy cf")
			process.exit(1)
		}

		console.log("Building packages/gateway...")

		try {
			execSync("npx pnpm --filter hybrid/gateway run build", {
				cwd: rootDir,
				stdio: "inherit"
			})
		} catch {
			console.error("Build failed")
			process.exit(1)
		}

		console.log("Deploying to Cloudflare...")

		try {
			execSync("npx wrangler deploy", {
				cwd: resolve(rootDir, "packages/gateway"),
				stdio: "inherit"
			})
		} catch {
			console.error("Deploy failed")
			process.exit(1)
		}

		console.log("✅ Deploy complete!")
		return
	}

	console.error(`Unknown platform: ${platform}`)
	console.error("Supported platforms: fly, railway, cf (cloudflare)")
	process.exit(1)
}

async function init(name: string) {
	if (!name) {
		console.error("Error: Agent name required")
		console.error("Usage: hybrid init my-agent")
		process.exit(1)
	}

	const { execSync } = await import("node:child_process")
	const { resolve, dirname } = await import("node:path")
	const { fileURLToPath } = await import("node:url")
	const { readFileSync, writeFileSync, cpSync, existsSync } = await import(
		"node:fs"
	)

	const __dirname = dirname(fileURLToPath(import.meta.url))
	const rootDir = resolve(__dirname, "../../..")
	const agentsDir = resolve(rootDir, "agents")
	const newAgentDir = resolve(agentsDir, name)

	if (existsSync(newAgentDir)) {
		console.error(`Error: Agent '${name}' already exists at agents/${name}`)
		process.exit(1)
	}

	console.log(`Creating agent: ${name}`)

	cpSync(resolve(agentsDir, "hybrid-agent"), newAgentDir, { recursive: true })

	const pkg = JSON.parse(
		readFileSync(resolve(newAgentDir, "package.json"), "utf-8")
	)
	pkg.name = name
	writeFileSync(
		resolve(newAgentDir, "package.json"),
		JSON.stringify(pkg, null, 2)
	)

	console.log(`\n✅ Created agent at: agents/${name}`)
	console.log("\nNext steps:")
	console.log(`  cd agents/${name}`)
	console.log("  cp .env.example .env  # Add your keys")
	console.log("  pnpm dev             # Test locally")
	console.log("  hybrid deploy        # Deploy to Fly.io")
}

async function register() {
	const { execSync } = await import("node:child_process")
	const { resolve, dirname } = await import("node:path")
	const { fileURLToPath } = await import("node:url")

	const __dirname = dirname(fileURLToPath(import.meta.url))
	const rootDir = resolve(__dirname, "../../..")

	console.log("\n🔐 Registering wallet on XMTP network...\n")

	try {
		execSync("npx pnpm --filter @hybrd/xmtp register", {
			cwd: rootDir,
			stdio: "inherit"
		})
	} catch {
		console.log(
			"\n❌ Registration failed. Make sure AGENT_WALLET_KEY and AGENT_SECRET are set"
		)
		process.exit(1)
	}
}

main().catch((error) => {
	console.error("CLI error:", error)
	process.exit(1)
})
