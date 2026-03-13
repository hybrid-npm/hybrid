#!/usr/bin/env node

import { existsSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "dotenv"

function findProjectRoot(startDir: string): string {
	const markers = ["package.json", "hybrid.config.ts", "SOUL.md"]
	let current = startDir
	while (current !== "/") {
		for (const marker of markers) {
			if (existsSync(resolve(current, marker))) {
				return current
			}
		}
		const parent = resolve(current, "..")
		if (parent === current) break
		current = parent
	}
	return startDir
}

const cwdIndex = process.argv.findIndex((a) => a === "--cwd")
if (cwdIndex !== -1 && process.argv[cwdIndex + 1]) {
	process.chdir(process.argv[cwdIndex + 1])
	process.argv.splice(cwdIndex, 2)
}

const projectRoot = findProjectRoot(process.cwd())

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
	if (command === "deploy") return deploy(args[1], args.includes("--keygen"))
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

	if (command === "clawhub" || command === "ch") {
		const subcommand = args[1]
		const passThroughArgs = args.slice(2).join(" ")
		if (subcommand === "install") return clawhubInstall(passThroughArgs)
		if (subcommand === "search") return clawhubSearch(passThroughArgs)
		if (subcommand === "publish") return clawhubPublish(passThroughArgs)
		if (subcommand === "update") return clawhubUpdate(passThroughArgs)
		if (subcommand === "list") return clawhubList()
		if (subcommand === "login") return clawhubLogin()
		if (subcommand === "logout") return clawhubLogout()
		if (subcommand === "whoami") return clawhubWhoami()
		console.log("\nUsage: hybrid clawhub <command>")
		console.log("\nCommands:")
		console.log("  install <slug>    Install a skill from ClawHub")
		console.log("  search <query>    Search for skills")
		console.log("  publish <path>    Publish a skill")
		console.log("  update [slug]     Update installed skills")
		console.log("  list              List installed skills")
		console.log("  login             Authenticate with ClawHub")
		console.log("  logout            Remove stored credentials")
		console.log("  whoami            Check authentication status")
		process.exit(1)
	}

	// Show help
	console.log("Usage: hybrid <command>")
	console.log("")
	console.log("Commands:")
	console.log("  init <name>           Initialize a new agent")
	console.log("  dev                   Start development server")
	console.log("  build [--target]      Build for deployment (fly, railway)")
	console.log("  start                 Run built agent")
	console.log("  deploy [platform]     Deploy (fly, railway)")
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
	console.log("ClawHub:")
	console.log("  clawhub install <slug>   Install from ClawHub registry")
	console.log("  clawhub search <query>   Search ClawHub skills")
	console.log("  clawhub publish <path>   Publish a skill")
	console.log("  clawhub update [slug]    Update installed skills")
	console.log("  clawhub list             List ClawHub skills")
	console.log("  clawhub login            Authenticate with ClawHub")
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
// ClawHub - Wrapper around clawhub CLI
// ============================================================================

async function clawhubInstall(extraArgs: string) {
	const { execSync } = await import("node:child_process")
	console.log("\n📥 Installing from ClawHub...\n")
	execSync(`npx clawhub install ${extraArgs}`, { stdio: "inherit" })
}

async function clawhubSearch(query: string) {
	const { execSync } = await import("node:child_process")
	execSync(`npx clawhub search ${query}`, { stdio: "inherit" })
}

async function clawhubPublish(extraArgs: string) {
	const { execSync } = await import("node:child_process")
	console.log("\n📤 Publishing to ClawHub...\n")
	execSync(`npx clawhub publish ${extraArgs}`, { stdio: "inherit" })
}

async function clawhubUpdate(extraArgs: string) {
	const { execSync } = await import("node:child_process")
	console.log("\n🔄 Updating skills from ClawHub...\n")
	execSync(`npx clawhub update ${extraArgs}`, { stdio: "inherit" })
}

async function clawhubList() {
	const { execSync } = await import("node:child_process")
	execSync("npx clawhub list", { stdio: "inherit" })
}

async function clawhubLogin() {
	const { execSync } = await import("node:child_process")
	console.log("\n🔐 Logging into ClawHub...\n")
	execSync("npx clawhub login", { stdio: "inherit" })
}

async function clawhubLogout() {
	const { execSync } = await import("node:child_process")
	execSync("npx clawhub logout", { stdio: "inherit" })
}

async function clawhubWhoami() {
	const { execSync } = await import("node:child_process")
	execSync("npx clawhub whoami", { stdio: "inherit" })
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

	// Copy .env.example to .env
	const envExamplePath = resolve(targetDir, ".env.example")
	const envPath = resolve(targetDir, ".env")
	if (existsSync(envExamplePath)) {
		cpSync(envExamplePath, envPath)
	}

	// Collect configuration via prompts
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout
	})

	const question = (prompt: string): Promise<string> => {
		return new Promise((resolve) => {
			rl.question(prompt, (answer: string) => {
				resolve(answer.trim())
			})
		})
	}

	// Owner wallet address
	const ownerAddress = await question("\nEnter your wallet address (owner): ")

	// Wallet key - generate using keygen flow
	console.log("\n🔑 Generating wallet key...")
	const { privateKeyToAccount } = await import("viem/accounts")
	const { randomBytes } = await import("node:crypto")
	const walletKey = `0x${randomBytes(32).toString("hex")}` as `0x${string}`
	const account = privateKeyToAccount(walletKey as `0x${string}`)
	console.log(`   Address: ${account.address}`)
	console.log(`   Key: ${walletKey.slice(0, 10)}...${walletKey.slice(-8)}`)

	rl.close()

	// Provider picker using prompts
	const prompts = (await import("prompts")).default
	const providerResponse = await prompts({
		type: "select",
		name: "provider",
		message: "LLM Provider",
		choices: [
			{ title: "Anthropic", value: "anthropic" },
			{ title: "OpenRouter", value: "openrouter" }
		],
		initial: 0
	})

	if (providerResponse.provider === undefined) {
		console.log("\nCancelled.")
		process.exit(0)
	}

	let anthropicKey = ""
	let openrouterKey = ""

	if (providerResponse.provider === "anthropic") {
		const keyResponse = await prompts({
			type: "password",
			name: "key",
			message: "Anthropic API key"
		})
		anthropicKey = keyResponse.key || ""
	} else if (providerResponse.provider === "openrouter") {
		const keyResponse = await prompts({
			type: "password",
			name: "key",
			message: "OpenRouter API key"
		})
		openrouterKey = keyResponse.key || ""
	}

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

	// Update .env file with generated key and API keys
	let envContent = readFileSync(envPath, "utf-8")

	// Update wallet key
	envContent = envContent.replace(
		/AGENT_WALLET_KEY=.*/,
		`AGENT_WALLET_KEY=${walletKey}`
	)

	// Update API keys based on provider choice
	if (anthropicKey) {
		envContent = envContent.replace(
			/ANTHROPIC_API_KEY=.*/,
			`ANTHROPIC_API_KEY=${anthropicKey}`
		)
		// Comment out OpenRouter lines if present
		envContent = envContent.replace(
			/^ANTHROPIC_BASE_URL=https:\/\/openrouter\.ai\/api/m,
			"# ANTHROPIC_BASE_URL=https://openrouter.ai/api"
		)
		envContent = envContent.replace(
			/^ANTHROPIC_AUTH_TOKEN=(?!your_openrouter_key)/m,
			"# ANTHROPIC_AUTH_TOKEN="
		)
	}

	if (openrouterKey) {
		// Uncomment/set OpenRouter lines
		envContent = envContent.replace(
			/# ANTHROPIC_BASE_URL=https:\/\/openrouter\.ai\/api/,
			"ANTHROPIC_BASE_URL=https://openrouter.ai/api"
		)
		// Replace commented placeholder OR existing AUTH_TOKEN in one pass
		envContent = envContent.replace(
			/^#?\s*ANTHROPIC_AUTH_TOKEN=.*/m,
			`ANTHROPIC_AUTH_TOKEN=${openrouterKey}`
		)
		// Comment out direct Anthropic key if OpenRouter is used
		envContent = envContent.replace(
			/^ANTHROPIC_API_KEY=/m,
			(match) => `# ${match}`
		)
	}

	writeFileSync(envPath, envContent)
	console.log("✅ Updated .env file")

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

	const projectDir = projectRoot
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

	const files = ["server/index.cjs", "xmtp.cjs"]

	for (const file of files) {
		const src = resolve(agentDistDir, file)
		if (existsSync(src)) {
			cpSync(src, resolve(distDir, file))
		} else {
			console.error(`  Missing: ${file} - run 'pnpm build' in hybrid package`)
		}
	}

	// Copy config files
	console.log("📋 Copying agent config...")
	for (const file of [
		"SOUL.md",
		"AGENTS.md",
		"IDENTITY.md",
		"TOOLS.md",
		"BOOT.md",
		"BOOTSTRAP.md",
		"HEARTBEAT.md",
		"USER.md"
	]) {
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
		name: "hybrid",
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
			"sql.js": "^1.11.0",
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
node server/index.cjs &
node xmtp.cjs &
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

# Copy built agent runtime
COPY server/ ./server/
COPY xmtp.cjs ./

# Copy config
COPY SOUL.md ./
COPY AGENTS.md ./
COPY IDENTITY.md ./
COPY TOOLS.md ./
COPY BOOTSTRAP.md ./
COPY HEARTBEAT.md ./
COPY USER.md ./

# Copy credentials (owner ACL)
COPY credentials/ ./credentials/

# Copy deployment files
COPY package.json ./
COPY start.sh ./

# Install dependencies
RUN npm install --production

# Create data directories and set ownership
RUN mkdir -p /app/data/xmtp && \\
    chown -R node:node /app

ENV AGENT_PORT=8454
ENV NODE_ENV=production
EXPOSE 8454

USER node
CMD ["sh", "start.sh"]
`
	}

	return `FROM node:20
WORKDIR /app
COPY . ./
RUN npm install --production
RUN chown -R node:node /app
USER node
CMD ["sh", "start.sh"]
`
}

function generateFlyToml(appName = "hybrid-agent"): string {
	return `# Generated by hybrid build
app = "${appName}"
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
	const { existsSync, readFileSync } = await import("node:fs")
	const { privateKeyToAccount } = await import("viem/accounts")

	if (useDocker) {
		console.log("\n🐳 Docker dev not yet implemented for new structure")
		console.log("Use 'hybrid dev' without --docker for now")
		return
	}

	const projectDir = projectRoot

	// Check if agent is registered
	const walletKey = process.env.AGENT_WALLET_KEY || process.env.WALLET_KEY
	if (walletKey) {
		const walletKeyFormatted = walletKey.startsWith("0x")
			? walletKey
			: `0x${walletKey}`
		const account = privateKeyToAccount(walletKeyFormatted as `0x${string}`)
		console.log(`\n🔍 Checking XMTP registration for ${account.address}...`)

		try {
			const result = execSync(
				`npx tsx -e "
import { createSigner, createXMTPClient } from './src/client';
const signer = createSigner('${walletKeyFormatted}');
const client = await createXMTPClient(signer, { env: 'production' });
console.log('REGISTERED:', client.inboxId);
process.exit(0);
"`,
				{
					cwd: resolve(packageDir, "..", "xmtp"),
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"]
				}
			)
			if (result.includes("REGISTERED:")) {
				const inboxId = result.match(/REGISTERED: (.+)/)?.[1]
				console.log(`   ✅ Already registered (inbox: ${inboxId})`)
			}
		} catch (err: any) {
			const output = err.stdout || err.stderr || ""
			if (
				output.includes("not registered") ||
				output.includes("No inbox found") ||
				output.includes("incomplete identity") ||
				err.exitCode
			) {
				console.log("   ❌ Not registered")
				console.log("\n📝 Registering agent on XMTP...")

				execSync("npx pnpm --filter @hybrd/xmtp register", {
					cwd: resolve(packageDir, "..", ".."),
					stdio: "inherit",
					env: { ...process.env, AGENT_WALLET_KEY: walletKey }
				})
			}
		}
	}

	// Remove duplicate projectDir declaration
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

	const projectDir = projectRoot
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

async function deploy(platform?: string, keygen = false) {
	const { spawn, execSync } = await import("node:child_process")
	const { existsSync, readFileSync, writeFileSync } = await import("node:fs")
	const prompts = (await import("prompts")).default
	const { privateKeyToAccount } = await import("viem/accounts")
	const { randomBytes } = await import("node:crypto")

	const projectDir = projectRoot
	const distDir = resolve(projectDir, "dist")

	// Prompt for platform if not specified
	let deployPlatform = platform

	// Check hybrid.config.ts for saved platform
	if (!deployPlatform) {
		const hybridConfig = resolve(projectDir, "hybrid.config.ts")
		if (existsSync(hybridConfig)) {
			const configContent = readFileSync(hybridConfig, "utf-8")
			const match = configContent.match(
				/deployPlatform\s*[=:]\s*["']([^"']+)["']/
			)
			if (match) {
				deployPlatform = match[1]
				console.log(`   Using saved platform: ${deployPlatform}`)
			}
		}
	}

	if (!deployPlatform) {
		const choice = await prompts({
			type: "select",
			name: "platform",
			message: "Where do you want to deploy?",
			choices: [
				{ title: "Fly.io", value: "fly" },
				{ title: "Railway", value: "railway" }
			],
			initial: 0
		})
		if (!choice.platform) {
			console.log("\n  Cancelled.\n")
			process.exit(0)
		}
		deployPlatform = choice.platform

		// Save platform to hybrid.config.ts
		const hybridConfig = resolve(projectDir, "hybrid.config.ts")
		let configContent = ""
		if (existsSync(hybridConfig)) {
			configContent = readFileSync(hybridConfig, "utf-8")
		}
		if (!configContent.includes("deployPlatform")) {
			const newContent = configContent
				? configContent.replace(
						/export default/,
						`const deployPlatform = "${deployPlatform}"\n\nexport default`
					)
				: `const deployPlatform = "${deployPlatform}"\n\nexport default {}`
			writeFileSync(hybridConfig, newContent)
		}
	}
	const flyTomlPath = resolve(distDir, "fly.toml")
	const projectFlyToml = resolve(projectDir, "fly.toml")

	// Get project name from directory as default
	const projectName = basename(projectDir)
	let appName = projectName

	// Check project fly.toml first (preferred)
	if (existsSync(projectFlyToml)) {
		const flyToml = readFileSync(projectFlyToml, "utf-8")
		const match = flyToml.match(/^app\s*=\s*["']([^"']+)["']/m)
		if (match) appName = match[1]
	} else {
		// Prompt for app name only if no project fly.toml exists
		const result = await prompts({
			type: "text",
			name: "appName",
			message: "App name:",
			initial: projectName
		})
		if (result.appName) appName = result.appName
	}

	// Check for wallet key
	let walletKey = process.env.AGENT_WALLET_KEY || process.env.WALLET_KEY

	// Validate app name to prevent command injection
	if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(appName)) {
		console.error(`\n❌ Invalid app name: ${appName}`)
		console.error("App name must start with a letter/digit and contain only letters, digits, hyphens, and underscores.")
		process.exit(1)
	}

	// Check if app exists
	const { execFileSync } = await import("node:child_process")
	let appExists = false
	try {
		execFileSync("fly", ["status", "--app", appName], { stdio: "pipe" })
		appExists = true
	} catch {
		// App doesn't exist
	}

	// Check for OpenRouter key
	let openRouterKey = process.env.OPENROUTER_API_KEY

	// Only prompt for secrets on first deploy (when app doesn't exist)
	// On subsequent deploys, secrets are already set on Fly
	if (!appExists) {
		// Auto-generate wallet if not set or keygen flag is passed
		if (!walletKey || keygen) {
			if (keygen) {
				console.log("\n🔐 Generating new wallet key...")
			} else {
				console.log("\n🔐 No AGENT_WALLET_KEY found. Generating new wallet...")
			}
			walletKey = await generateVanityWallet(
				"",
				privateKeyToAccount,
				randomBytes
			)
			const account = privateKeyToAccount(walletKey as `0x${string}`)
			console.log(`✅ Wallet: ${account.address}\n`)
		}

		// Prompt for OpenRouter key if not set (required for new apps)
		if (!openRouterKey) {
			console.log("🔑 No OPENROUTER_API_KEY found.")
			while (true) {
				const result = await prompts({
					type: "password",
					name: "key",
					message: "Paste OpenRouter API key:"
				})
				const key = result.key?.trim()
				if (key && key.length > 0) {
					openRouterKey = key
					break
				}
				console.log("   OpenRouter API key is required. Please enter a value.")
			}
		}

		// Set up owner ACL
		const aclPath = resolve(projectDir, "credentials", "xmtp-allowFrom.json")
		if (!existsSync(aclPath)) {
			const result = await prompts({
				type: "text",
				name: "owner",
				message: "Your wallet address (owner):",
				validate: (v: string) =>
					/^0x[a-fA-F0-9]{40}$/.test(v) ||
					"Enter a valid Ethereum address (0x...)"
			})
			if (result.owner) {
				const { mkdirSync } = await import("node:fs")
				mkdirSync(resolve(projectDir, "credentials"), { recursive: true })
				writeFileSync(
					aclPath,
					JSON.stringify(
						{ version: 1, allowFrom: [result.owner.toLowerCase()] },
						null,
						"\t"
					)
				)
				console.log(`✅ Owner set: ${result.owner}\n`)
			}
		}
	}

	// Build first
	await build(deployPlatform)

	if (deployPlatform === "fly") {
		console.log("\n🚀 Deploying to Fly.io...")

		// Ensure fly.toml exists with correct app name
		if (existsSync(projectFlyToml)) {
			// Copy project fly.toml to dist
			const { cpSync } = await import("node:fs")
			cpSync(projectFlyToml, resolve(distDir, "fly.toml"))
		} else {
			// Generate fly.toml with correct app name
			const { writeFileSync } = await import("node:fs")
			const flyTomlContent = generateFlyToml(appName)
			writeFileSync(resolve(distDir, "fly.toml"), flyTomlContent)
		}

		if (!appExists) {
			console.log(`📦 Creating Fly.io app: ${appName}`)
			try {
				execFileSync("fly", ["apps", "create", appName], {
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

		// Set secrets via fly secrets (doesn't require VM to be running)
		// Use execFileSync with array args to avoid leaking secrets in the process list
		if (walletKey) {
			console.log("\n🔐 Setting wallet key as secret...")
			try {
				execFileSync(
					"fly",
					["secrets", "set", `AGENT_WALLET_KEY=${walletKey}`, "--app", appName],
					{
						cwd: distDir,
						stdio: "inherit"
					}
				)
			} catch (e) {
				console.log("   ⚠️  Could not set secret, skipping...")
			}
		}

		// Set OpenRouter secret
		if (openRouterKey) {
			console.log("\n🔑 Setting OpenRouter key as secret...")
			try {
				execFileSync(
					"fly",
					["secrets", "set", `OPENROUTER_API_KEY=${openRouterKey}`, "--app", appName],
					{
						cwd: distDir,
						stdio: "inherit"
					}
				)
			} catch (e) {
				console.log("   ⚠️  Could not set secret, skipping...")
			}
		}

		console.log("\n✅ Deployed!")
		console.log(`   Dashboard: https://fly.io/apps/${appName}`)

		// Save fly.toml to project for future deploys
		if (!existsSync(projectFlyToml)) {
			const { cpSync } = await import("node:fs")
			cpSync(resolve(distDir, "fly.toml"), projectFlyToml)
			console.log(`   Saved fly.toml to project`)
		}

		return
	}

	if (deployPlatform === "railway") {
		console.log("\n🚂 Railway deployment not yet implemented.")
		console.log("   See https://railway.app for manual deployment.")
		process.exit(1)
	}

	console.error(`Unknown platform: ${deployPlatform}`)
	console.error("Supported: fly, railway")
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
	const { existsSync, readFileSync } = await import("node:fs")
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

	// Verify ACL exists
	const projectDir = projectRoot
	const aclPath = join(projectDir, "credentials", "xmtp-allowFrom.json")

	if (!existsSync(aclPath)) {
		console.error("\n❌ No credentials/xmtp-allowFrom.json")
		console.error("Run 'hybrid init' first")
		process.exit(1)
	}

	try {
		const acl = JSON.parse(readFileSync(aclPath, "utf-8"))
		if (!acl.allowFrom?.length) {
			console.error("\n❌ No owners in ACL")
			process.exit(1)
		}
	} catch {
		console.error("\n❌ Invalid credentials/xmtp-allowFrom.json")
		process.exit(1)
	}

	console.log(`\n🔐 Registering ${account.address} on XMTP...`)
	try {
		execSync("npx pnpm --filter @hybrd/xmtp register", {
			cwd: resolve(packageDir, "..", ".."),
			stdio: "inherit",
			env: { ...process.env, AGENT_WALLET_KEY: walletKey }
		})
	} catch {
		console.error("\n❌ Registration failed")
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

	const projectDir = projectRoot
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

	const projectDir = projectRoot
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

	const projectDir = projectRoot
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
