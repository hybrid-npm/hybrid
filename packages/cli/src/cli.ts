#!/usr/bin/env node

import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "dotenv"

// Load .env files
const projectRoot = process.cwd()
for (const envFile of [".env", ".env.local"]) {
	const path = resolve(projectRoot, envFile)
	if (existsSync(path)) {
		config({ path })
	}
}

// Node version check
const [major] = process.versions.node.split(".").map(Number)
if (!major || major < 20) {
	console.error("Error: Node.js version 20 or higher is required")
	process.exit(1)
}

// Get package directory (where bundled files live)
const __dirname = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(__dirname, "..")

async function main() {
	const args = process.argv.slice(2)
	const command = args[0]

	if (command === "build") return build(args[1])
	if (command === "dev") return dev(args.includes("--docker"))
	if (command === "start") return start()
	if (command === "deploy") return deploy(args[1])
	if (command === "init") return init(args[1])
	if (command === "keygen") return keygen(args[1])
	if (command === "register") return register()
	if (command === "revoke") return revoke(args[1])
	if (command === "revoke-all") return revokeAll()

	if (command === "owner") {
		const subcommand = args[1]
		if (subcommand === "add") return ownerAdd(args[2])
		if (subcommand === "remove" || subcommand === "rm")
			return ownerRemove(args[2])
		if (subcommand === "list" || subcommand === "ls") return ownerList()
		console.log("\nUsage: hybrid owner <command>")
		console.log("\nCommands:")
		console.log("  owner add <address>     Add an owner")
		console.log("  owner remove <address>  Remove an owner")
		console.log("  owner list              List all owners")
		process.exit(1)
	}

	if (command === "skills") {
		const subcommand = args[1]
		if (subcommand === "add") {
			const isGlobal = args.includes("-g") || args.includes("--global")
			const source = args.find((a, i) => i > 1 && !a.startsWith("-"))
			return skillsAdd(source, isGlobal)
		}
		if (subcommand === "remove" || subcommand === "rm") {
			const isGlobal = args.includes("-g") || args.includes("--global")
			const name = args.find((a, i) => i > 1 && !a.startsWith("-"))
			return skillsRemove(name, isGlobal)
		}
		if (subcommand === "list" || subcommand === "ls" || !subcommand) {
			return skillsList()
		}
		console.error(`Unknown skills subcommand: ${subcommand}`)
		console.error("Usage: hybrid skills add|remove|list")
		process.exit(1)
	}

	// Show help
	console.log("Usage: hybrid <command>")
	console.log("")
	console.log("Commands:")
	console.log("  init <name>           Initialize a new agent")
	console.log("  dev                   Start development server")
	console.log("  build [--target]      Build for deployment (fly, railway, cf)")
	console.log("  start                 Run built agent")
	console.log("  deploy [platform]     Deploy (fly, railway, cf)")
	console.log("")
	console.log("Wallet:")
	console.log("  keygen [prefix]       Generate a new wallet")
	console.log("  register              Register wallet on XMTP")
	console.log("  revoke <inboxId>      Revoke installations")
	console.log("  revoke-all            Revoke all installations")
	console.log("")
	console.log("Owner:")
	console.log("  owner add <address>     Add an owner")
	console.log("  owner remove <address>  Remove an owner")
	console.log("  owner list              List all owners")
	console.log("")
	console.log("Skills:")
	console.log("  skills add <source> [-g]    Install a skill")
	console.log("  skills remove <name> [-g]   Remove a skill")
	console.log("  skills list                 List installed skills")
	console.log("")
	console.log("  Uses npx skills --agent openclaw under the hood")
	console.log("  -g, --global    Install to ~/.openclaw/skills/")
	console.log("")
	console.log("Sources:")
	console.log("  owner/repo          GitHub shorthand")
	console.log("  owner/repo/skill    GitHub skill path")
	console.log("  @scope/package     npm package")
	console.log("  ./local-path       Local directory")
	console.log("")

	if (command) process.exit(1)
}

// ============================================================================
// Skills - Thin wrapper around npx skills --agent openclaw
// ============================================================================

async function skillsAdd(source?: string, isGlobal = false) {
	if (!source) {
		console.error("Error: Skill source required")
		console.error("Usage: hybrid skills add <source>")
		console.error("       hybrid skills add <source> -g  # Global install")
		process.exit(1)
	}

	const { execSync } = await import("node:child_process")
	const cmdArgs = ["skills", "add", source, "-a", "openclaw", "-y"]
	if (isGlobal) cmdArgs.push("-g")

	console.log(
		`\n📥 Installing skill: ${source}${isGlobal ? " (global)" : ""}\n`
	)
	execSync(`npx ${cmdArgs.join(" ")}`, { stdio: "inherit" })
}

async function skillsRemove(name?: string, isGlobal = false) {
	if (!name) {
		console.error("Error: Skill name required")
		console.error("Usage: hybrid skills remove <skill-name>")
		process.exit(1)
	}

	const { execSync } = await import("node:child_process")
	const cmdArgs = ["skills", "remove", name, "-a", "openclaw", "-y"]
	if (isGlobal) cmdArgs.push("-g")

	execSync(`npx ${cmdArgs.join(" ")}`, { stdio: "inherit" })
}

async function skillsList() {
	const { execSync } = await import("node:child_process")
	execSync("npx skills list -a openclaw", { stdio: "inherit" })
}

// ============================================================================
// Init
// ============================================================================

async function init(name?: string) {
	if (!name) {
		console.error("Error: Agent name required")
		console.error("Usage: hybrid init <name>")
		process.exit(1)
	}

	const {
		cpSync,
		existsSync,
		mkdirSync,
		writeFileSync,
		readdirSync,
		readFileSync
	} = await import("node:fs")
	const { createInterface } = await import("node:readline")

	const templateDir = resolve(packageDir, "templates", "agent")
	const targetDir = resolve(process.cwd(), name)

	if (existsSync(targetDir)) {
		console.error(`Error: Directory '${name}' already exists`)
		process.exit(1)
	}

	console.log(`\n📦 Creating agent: ${name}\n`)

	// Copy template
	cpSync(templateDir, targetDir, { recursive: true })

	// Update package.json with agent name
	const pkgPath = resolve(targetDir, "package.json")
	const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
	pkg.name = name
	writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))

	// Copy core skills from bundled package
	const skillsDir = resolve(packageDir, "skills")
	const targetSkillsDir = resolve(targetDir, "skills")

	if (existsSync(skillsDir)) {
		console.log("📚 Copying core skills...")
		const coreSkills = readdirSync(skillsDir, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => d.name)

		mkdirSync(targetSkillsDir, { recursive: true })

		for (const skill of coreSkills) {
			cpSync(resolve(skillsDir, skill), resolve(targetSkillsDir, skill), {
				recursive: true
			})
			console.log(`   ✓ ${skill}`)
		}

		// Create skills-lock.json
		const lockfile: Record<string, { source: string; installedAt: string }> = {}
		const now = new Date().toISOString()
		for (const skill of coreSkills) {
			lockfile[skill] = { source: "core", installedAt: now }
		}
		writeFileSync(
			resolve(targetDir, "skills-lock.json"),
			JSON.stringify(lockfile, null, 2)
		)
	}

	// Ask for owner wallet address
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout
	})

	const ownerAddress = await new Promise<string>((resolve) => {
		rl.question("\nEnter your wallet address (owner): ", (answer: string) => {
			rl.close()
			resolve(answer.trim())
		})
	})

	// Create ACL file with owner
	if (ownerAddress) {
		const normalized = ownerAddress.toLowerCase()
		const credentialsDir = resolve(targetDir, "credentials")
		mkdirSync(credentialsDir, { recursive: true })
		writeFileSync(
			resolve(credentialsDir, "xmtp-allowFrom.json"),
			JSON.stringify({ version: 1, allowFrom: [normalized] }, null, 2)
		)
		console.log(`\n✅ Added owner: ${normalized}`)
	}

	console.log(`\n✅ Created agent at: ${name}/`)
	console.log("\nNext steps:")
	console.log(`  cd ${name}`)
	console.log("  npm install  # or pnpm install")
	console.log("  hybrid dev   # Start development")
}

// ============================================================================
// Build
// ============================================================================

async function build(target?: string) {
	const { execSync } = await import("node:child_process")
	const {
		cpSync,
		existsSync,
		mkdirSync,
		rmSync,
		writeFileSync,
		readdirSync,
		readFileSync
	} = await import("node:fs")

	const projectDir = process.cwd()
	const distDir = resolve(projectDir, "dist")
	const buildTarget = target || "fly"

	console.log("\n🔧 Building agent...")

	// Clean dist
	if (existsSync(distDir)) {
		rmSync(distDir, { recursive: true, force: true })
	}
	mkdirSync(distDir, { recursive: true })
	mkdirSync(resolve(distDir, "server"), { recursive: true })

	// Copy agent runtime from bundled package
	console.log("📦 Copying agent runtime...")
	const agentDistDir = resolve(packageDir, "dist")

	const files = [
		"index.cjs",
		"server/simple.cjs",
		"server/index.cjs",
		"xmtp.cjs"
	]

	for (const file of files) {
		const src = resolve(agentDistDir, file)
		if (existsSync(src)) {
			cpSync(src, resolve(distDir, file))
		} else {
			console.error(`  Missing: ${file} - run 'pnpm build' in hybrid package`)
		}
	}

	// Copy config files
	console.log("📋 Copying config...")
	for (const file of ["SOUL.md", "AGENTS.md", "IDENTITY.md"]) {
		const src = resolve(projectDir, file)
		if (existsSync(src)) {
			cpSync(src, resolve(distDir, file))
			console.log(`   ✓ ${file}`)
		}
	}

	// Copy/migrate config file
	const hybridConfig = resolve(projectDir, "hybrid.config.ts")
	const openclawConfig = resolve(projectDir, "openclaw.json")
	const agentConfig = resolve(projectDir, "agent.ts")

	if (existsSync(hybridConfig)) {
		// TODO: Compile TypeScript config
		cpSync(hybridConfig, resolve(distDir, "hybrid.config.ts"))
		console.log("   ✓ hybrid.config.ts")
	} else if (existsSync(openclawConfig)) {
		const content = readFileSync(openclawConfig, "utf-8")
		writeFileSync(
			resolve(projectDir, "hybrid.config.ts"),
			`// Migrated from openclaw.json\nexport default ${content}`
		)
		console.log("   ✓ Migrated openclaw.json → hybrid.config.ts")
	} else if (existsSync(agentConfig)) {
		cpSync(agentConfig, resolve(distDir, "agent.ts"))
		console.log("   ✓ agent.ts (legacy)")
	}

	// Skills stay in ./skills/ at project root - not copied
	// Verify skills exist
	const skillsDir = resolve(projectDir, "skills")
	if (existsSync(skillsDir)) {
		const skills = readdirSync(skillsDir, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => d.name)
		console.log(`📚 Skills: ${skills.length} in ./skills/`)
	} else {
		console.log("⚠️  No ./skills/ directory found - run 'hybrid init' first?")
	}

	// Copy credentials if exist
	const credsDir = resolve(projectDir, "credentials")
	if (existsSync(credsDir)) {
		mkdirSync(resolve(distDir, "credentials"), { recursive: true })
		cpSync(credsDir, resolve(distDir, "credentials"), { recursive: true })
		console.log("   ✓ credentials/")
	}

	// Generate package.json for deployment
	const deployPkg = {
		name: "hybrid-agent",
		version: "1.0.0",
		type: "module",
		dependencies: {
			"@anthropic-ai/claude-agent-sdk": "^0.2.38",
			"@hono/node-server": "^1.13.5",
			"@xmtp/agent-sdk": "0.0.14",
			"@xmtp/node-bindings": "^1.9.1",
			"@xmtp/node-sdk": "^4.1.0",
			ai: "^6.0.0",
			"better-sqlite3": "^11.0.0",
			dotenv: "^16.4.5",
			hono: "^4.10.8",
			viem: "^2.46.2",
			zod: "^4.0.0"
		}
	}
	writeFileSync(
		resolve(distDir, "package.json"),
		JSON.stringify(deployPkg, null, 2)
	)

	// Generate Dockerfile
	writeFileSync(resolve(distDir, "Dockerfile"), generateDockerfile(buildTarget))

	// Copy or generate fly.toml
	if (buildTarget === "fly") {
		const projectFlyToml = resolve(projectDir, "fly.toml")
		if (existsSync(projectFlyToml)) {
			cpSync(projectFlyToml, resolve(distDir, "fly.toml"))
		} else {
			writeFileSync(resolve(distDir, "fly.toml"), generateFlyToml())
		}
	}

	// Generate start script
	writeFileSync(
		resolve(distDir, "start.sh"),
		`#!/bin/sh
node dist/server/simple.cjs &
node dist/xmtp.cjs &
wait
`
	)

	console.log("\n✅ Build complete!")
	console.log(`   Output: ${distDir}`)
	console.log(`   Target: ${buildTarget}`)
}

function generateDockerfile(target: string): string {
	if (target === "fly" || target === "railway") {
		return `FROM node:20

WORKDIR /app

# Copy built agent
COPY dist/ ./dist/

# Copy skills (at project root)
COPY skills/ ./skills/

# Copy config
COPY dist/SOUL.md ./SOUL.md
COPY dist/AGENTS.md ./AGENTS.md
COPY dist/IDENTITY.md ./IDENTITY.md

# Copy deployment files
COPY dist/package.json ./package.json
COPY dist/start.sh ./start.sh
COPY dist/Dockerfile ./Dockerfile

# Install dependencies
RUN npm install --production

# Create data directories
RUN mkdir -p /app/data/xmtp

ENV AGENT_PORT=8454
ENV NODE_ENV=production
EXPOSE 8454

CMD ["sh", "start.sh"]
`
	}

	return `FROM node:20
WORKDIR /app
COPY . ./
RUN npm install --production
CMD ["sh", "start.sh"]
`
}

function generateFlyToml(): string {
	return `# Generated by hybrid build
app = "hybrid-agent"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"
  context = "."

[deployment]
  min_machines = 1
  max_machines = 1

[env]
  XMTP_ENV = "production"

[[services]]
  protocol = "tcp"
  internal_port = 8454

  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

[vm]
  memory = "1gb"
  cpu_kind = "shared"
  cpus = 1
`
}

// ============================================================================
// Dev
// ============================================================================

async function dev(useDocker: boolean) {
	const { execSync } = await import("node:child_process")

	if (useDocker) {
		console.log("\n🐳 Docker dev not yet implemented for new structure")
		console.log("Use 'hybrid dev' without --docker for now")
		return
	}

	const projectDir = process.cwd()
	const agentServer = resolve(packageDir, "dist", "server", "index.cjs")
	const agentXmtp = resolve(packageDir, "dist", "xmtp.cjs")

	console.log("\n🚀 Starting development server...\n")
	console.log(`   Project: ${projectDir}`)
	console.log(`   Runtime: ${packageDir}\n`)

	try {
		execSync(
			`npx concurrently --names "server,xmtp" --prefix-colors "cyan,magenta" "node ${agentServer}" "node ${agentXmtp}"`,
			{
				cwd: projectDir,
				stdio: "inherit",
				env: {
					...process.env,
					AGENT_PROJECT_ROOT: projectDir
				}
			}
		)
	} catch {
		console.error("\n❌ Failed to start dev server")
		process.exit(1)
	}
}

// ============================================================================
// Start
// ============================================================================

async function start() {
	const { spawn } = await import("node:child_process")
	const { existsSync } = await import("node:fs")

	const projectDir = process.cwd()
	const distDir = resolve(projectDir, "dist")

	if (!existsSync(resolve(distDir, "server", "simple.cjs"))) {
		console.error("Error: No build found. Run 'hybrid build' first.")
		process.exit(1)
	}

	console.log("\n🚀 Starting agent from ./dist/...\n")

	const server = spawn("node", [resolve(distDir, "server", "simple.cjs")], {
		cwd: projectDir,
		stdio: "inherit",
		env: { ...process.env, AGENT_PROJECT_ROOT: projectDir }
	})

	const xmtp = spawn("node", [resolve(distDir, "xmtp.cjs")], {
		cwd: projectDir,
		stdio: "inherit",
		env: { ...process.env, AGENT_PROJECT_ROOT: projectDir }
	})

	const exitHandler = (code: number | null) => {
		if (code !== 0 && code !== null) process.exit(code)
	}

	server.on("exit", exitHandler)
	xmtp.on("exit", exitHandler)

	process.on("SIGINT", () => {
		server.kill("SIGINT")
		xmtp.kill("SIGINT")
		process.exit(0)
	})
}

// ============================================================================
// Deploy
// ============================================================================

async function deploy(platform = "fly") {
	const { spawn, execSync } = await import("node:child_process")
	const { existsSync, readFileSync } = await import("node:fs")
	const prompts = (await import("prompts")).default
	const { privateKeyToAccount } = await import("viem/accounts")
	const { randomBytes } = await import("node:crypto")

	const projectDir = process.cwd()
	const distDir = resolve(projectDir, "dist")

	// Read app name from fly.toml
	const flyTomlPath = resolve(distDir, "fly.toml")
	const projectFlyToml = resolve(projectDir, "fly.toml")
	let appName = "hybrid-agent"

	if (existsSync(flyTomlPath)) {
		const flyToml = readFileSync(flyTomlPath, "utf-8")
		const match = flyToml.match(/^app\s*=\s*["']([^"']+)["']/m)
		if (match) appName = match[1]
	}

	// Check for AGENT_WALLET_KEY
	let walletKey = process.env.AGENT_WALLET_KEY || process.env.WALLET_KEY

	// Check if app exists
	let appExists = false
	try {
		execSync(`fly status --app ${appName}`, { stdio: "pipe" })
		appExists = true
	} catch {
		// App doesn't exist
	}

	// Generate wallet if needed
	if (!walletKey && !appExists) {
		console.log("\n🔐 No AGENT_WALLET_KEY found.")
		const choice = await prompts({
			type: "select",
			name: "action",
			message: "How to set up wallet?",
			choices: [
				{ title: "Generate new wallet", value: "generate" },
				{ title: "Paste existing key", value: "paste" }
			]
		})

		if (!choice.action) {
			console.log("\n  Cancelled.\n")
			process.exit(0)
		}

		if (choice.action === "paste") {
			const result = await prompts({
				type: "password",
				name: "key",
				message: "Paste private key (0x...)",
				validate: (v: string) =>
					v.startsWith("0x") && v.length === 66 ? true : "Invalid key format"
			})
			if (!result.key) process.exit(0)
			walletKey = result.key
		} else {
			walletKey = await generateVanityWallet(
				"",
				privateKeyToAccount,
				randomBytes
			)
		}

		const account = privateKeyToAccount(walletKey as `0x${string}`)
		console.log(`\n✅ Wallet: ${account.address}\n`)
	}

	// Build first
	await build(platform)

	if (platform === "fly" || !platform) {
		console.log("\n🚀 Deploying to Fly.io...")

		// Copy fly.toml from project if exists
		if (existsSync(projectFlyToml)) {
			const { cpSync } = await import("node:fs")
			cpSync(projectFlyToml, resolve(distDir, "fly.toml"))
		}

		if (!appExists) {
			console.log(`📦 Creating Fly.io app: ${appName}`)
			try {
				execSync(`fly apps create ${appName}`, {
					cwd: distDir,
					stdio: "inherit"
				})
			} catch {
				console.log(`   App may already exist, continuing...`)
			}
		}

		// Deploy
		await new Promise<void>((resolve, reject) => {
			const deploy = spawn("fly", ["deploy", "--config", "fly.toml"], {
				cwd: distDir,
				stdio: "inherit"
			})
			deploy.on("error", (err) =>
				reject(new Error(`Deploy failed: ${err.message}`))
			)
			deploy.on("close", (code) =>
				code === 0 ? resolve() : reject(new Error(`Exit ${code}`))
			)
		})

		// Set secrets if new wallet
		if (walletKey) {
			console.log("\n🔐 Setting AGENT_WALLET_KEY...")
			try {
				execSync(
					`fly secrets set AGENT_WALLET_KEY=${walletKey} --app ${appName}`,
					{
						cwd: distDir,
						stdio: "inherit"
					}
				)
				execSync(`fly apps restart ${appName}`, {
					cwd: distDir,
					stdio: "inherit"
				})
			} catch {
				console.log("⚠️  Could not set wallet key")
			}
		}

		console.log("\n✅ Deployed!")
		console.log(`   Dashboard: https://fly.io/apps/${appName}`)
		return
	}

	console.error(`Unknown platform: ${platform}`)
	console.error("Supported: fly, railway, cf")
	process.exit(1)
}

// ============================================================================
// Keygen
// ============================================================================

async function keygen(prefix?: string) {
	if (prefix === "-h" || prefix === "--help") {
		console.log("\nUsage: hybrid keygen [prefix]")
		console.log("\nGenerate a new wallet key.")
		console.log(
			"  prefix    Optional hex prefix for vanity address (max 6 chars)\n"
		)
		return
	}

	const { privateKeyToAccount } = await import("viem/accounts")
	const { randomBytes } = await import("node:crypto")

	const targetPrefix = prefix?.toLowerCase() || ""

	if (targetPrefix && !/^[0-9a-f]+$/.test(targetPrefix)) {
		console.error("\n❌ Prefix must be hex characters (0-9, a-f)")
		process.exit(1)
	}

	if (targetPrefix.length > 6) {
		console.error("\n❌ Prefix too long (max 6 characters)")
		process.exit(1)
	}

	console.log("\n🔑 Generating wallet...")
	if (targetPrefix) console.log(`   Looking for 0x${targetPrefix}...`)

	const walletKey = await generateVanityWallet(
		targetPrefix,
		privateKeyToAccount,
		randomBytes
	)
	const account = privateKeyToAccount(walletKey as `0x${string}`)

	console.log(`\n✅ Wallet generated!`)
	console.log(`   Address: ${account.address}`)
	console.log(`   Private key: ${walletKey}\n`)
	console.log("⚠️  Save this key securely!")
	console.log(`   Add to .env: AGENT_WALLET_KEY=${walletKey}\n`)
}

async function generateVanityWallet(
	prefix: string,
	privateKeyToAccount: (key: `0x${string}`) => { address: string },
	randomBytes: (size: number) => Buffer
): Promise<string> {
	let attempts = 0
	const max = prefix ? 1000000 : 1

	while (attempts < max) {
		attempts++
		const key = `0x${randomBytes(32).toString("hex")}` as `0x${string}`
		if (!prefix) return key

		const { address } = privateKeyToAccount(key)
		if (address.toLowerCase().startsWith(`0x${prefix}`)) {
			console.log(`   Found in ${attempts} attempts!`)
			return key
		}

		if (attempts % 1000 === 0) {
			process.stdout.write(
				`\r   Searching${".".repeat((attempts / 1000) % 4)}${" ".repeat(3)}${attempts}\r`
			)
		}
	}

	throw new Error(`No vanity address found after ${max} attempts`)
}

// ============================================================================
// Register
// ============================================================================

async function register() {
	const { execSync } = await import("node:child_process")
	const { existsSync, mkdirSync, writeFileSync, readFileSync } = await import(
		"node:fs"
	)
	const { join } = await import("node:path")
	const { privateKeyToAccount } = await import("viem/accounts")

	const walletKey = process.env.AGENT_WALLET_KEY || process.env.WALLET_KEY
	if (!walletKey) {
		console.error("\n❌ Set AGENT_WALLET_KEY first")
		process.exit(1)
	}

	const account = privateKeyToAccount(
		(walletKey.startsWith("0x") ? walletKey : `0x${walletKey}`) as `0x${string}`
	)
	console.log(`\n📍 Wallet: ${account.address}`)

	// Update ACL
	const projectDir = process.cwd()
	const aclPath = join(projectDir, "credentials", "xmtp-allowFrom.json")

	let acl: { version: number; allowFrom: string[] } = {
		version: 1,
		allowFrom: []
	}
	if (existsSync(aclPath)) {
		try {
			acl = JSON.parse(readFileSync(aclPath, "utf-8"))
		} catch {}
	}

	if (!acl.allowFrom.includes(account.address.toLowerCase())) {
		acl.allowFrom.push(account.address.toLowerCase())
		mkdirSync(join(projectDir, "credentials"), { recursive: true })
		writeFileSync(aclPath, JSON.stringify(acl, null, "\t"))
		console.log(`\n✅ Added owner to ACL`)
	}

	console.log("\n🔐 Registering on XMTP...")
	try {
		execSync("npx pnpm --filter @hybrd/xmtp register", {
			cwd: resolve(packageDir, "..", ".."),
			stdio: "inherit",
			env: { ...process.env, AGENT_WALLET_KEY: walletKey }
		})
		console.log("\n✅ Registered")
	} catch {
		console.log("\n❌ Registration failed. Check AGENT_WALLET_KEY")
		process.exit(1)
	}
}

// ============================================================================
// Revoke
// ============================================================================

async function revoke(inboxId?: string) {
	const { execSync } = await import("node:child_process")

	if (!inboxId) {
		console.log("\nUsage: hybrid revoke <inboxId>")
		console.log("Or use: hybrid revoke-all\n")
		process.exit(1)
	}

	console.log("\n🔄 Revoking XMTP installations...\n")
	try {
		execSync(`npx pnpm --filter @hybrd/xmtp revoke ${inboxId}`, {
			cwd: resolve(packageDir, "..", ".."),
			stdio: "inherit"
		})
	} catch {
		console.log("\n❌ Revoke failed. Check AGENT_WALLET_KEY")
		process.exit(1)
	}
}

async function revokeAll() {
	const { execSync } = await import("node:child_process")

	console.log("\n🔄 Revoking all XMTP installations...\n")
	try {
		execSync("npx pnpm --filter @hybrd/xmtp revoke-all", {
			cwd: resolve(packageDir, "..", ".."),
			stdio: "inherit"
		})
	} catch {
		console.log("\n❌ Revoke failed. Check AGENT_WALLET_KEY")
		process.exit(1)
	}
}

// ============================================================================
// Owner
// ============================================================================

async function ownerAdd(address?: string) {
	const { join } = await import("node:path")
	const { existsSync, mkdirSync, writeFileSync, readFileSync } = await import(
		"node:fs"
	)

	if (!address) {
		console.error("Usage: hybrid owner add <address>")
		process.exit(1)
	}

	const projectDir = process.cwd()
	const aclPath = join(projectDir, "credentials", "xmtp-allowFrom.json")
	const normalized = address.toLowerCase().trim()

	mkdirSync(join(projectDir, "credentials"), { recursive: true })

	let acl: { version: number; allowFrom: string[] } = {
		version: 1,
		allowFrom: []
	}
	if (existsSync(aclPath)) {
		try {
			acl = JSON.parse(readFileSync(aclPath, "utf-8"))
		} catch {}
	}

	if (!acl.allowFrom.includes(normalized)) {
		acl.allowFrom.push(normalized)
		writeFileSync(aclPath, JSON.stringify(acl, null, "\t"))
		console.log(`\n✅ Added owner: ${normalized}`)
	} else {
		console.log(`\n⚠️  Already an owner: ${normalized}`)
	}

	console.log(`\n📋 Owners (${acl.allowFrom.length}):`)
	for (const owner of acl.allowFrom) console.log(`  - ${owner}`)
}

async function ownerRemove(address?: string) {
	const { join } = await import("node:path")
	const { existsSync, writeFileSync, readFileSync } = await import("node:fs")

	if (!address) {
		console.error("Usage: hybrid owner remove <address>")
		process.exit(1)
	}

	const projectDir = process.cwd()
	const aclPath = join(projectDir, "credentials", "xmtp-allowFrom.json")

	if (!existsSync(aclPath)) {
		console.error("No ACL file. Run 'hybrid register' first.")
		process.exit(1)
	}

	const acl: { version: number; allowFrom: string[] } = JSON.parse(
		readFileSync(aclPath, "utf-8")
	)
	const normalized = address.toLowerCase().trim()
	const index = acl.allowFrom.indexOf(normalized)

	if (index === -1) {
		console.log(`\n⚠️  Not an owner: ${normalized}`)
		process.exit(1)
	}

	acl.allowFrom.splice(index, 1)
	writeFileSync(aclPath, JSON.stringify(acl, null, "\t"))
	console.log(`\n✅ Removed owner: ${normalized}`)

	if (acl.allowFrom.length > 0) {
		console.log(`\n📋 Remaining (${acl.allowFrom.length}):`)
		for (const owner of acl.allowFrom) console.log(`  - ${owner}`)
	} else {
		console.log("\n⚠️  No owners. Agent is open to all users.")
	}
}

async function ownerList() {
	const { join } = await import("node:path")
	const { existsSync, readFileSync } = await import("node:fs")

	const projectDir = process.cwd()
	const aclPath = join(projectDir, "credentials", "xmtp-allowFrom.json")

	if (!existsSync(aclPath)) {
		console.log("\n⚠️  No ACL file. Run 'hybrid register' first.")
		console.log("\n  Agent is open to all users.")
		return
	}

	const acl: { version: number; allowFrom: string[] } = JSON.parse(
		readFileSync(aclPath, "utf-8")
	)

	if (acl.allowFrom.length === 0) {
		console.log("\n📋 No owners. Agent is open to all users.")
		return
	}

	console.log(`\n📋 Owners (${acl.allowFrom.length}):`)
	for (const owner of acl.allowFrom) console.log(`  - ${owner}`)
}

// ============================================================================
// Run
// ============================================================================

// Export for testing
export { init }

main().catch((error) => {
	console.error("CLI error:", error)
	process.exit(1)
})
