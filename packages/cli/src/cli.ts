#!/usr/bin/env node

import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
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

	if (command === "build") {
		const targetFlag = args.indexOf("--target")
		return build(targetFlag !== -1 ? args[targetFlag + 1] : args[1])
	}
	if (command === "dev") return dev(args.includes("--docker"))
	if (command === "start") return start()
	if (command === "deploy") return deployCommand(args)
	if (command === "init") return init(args[1])

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

	if (command === "msg" || command === "m") return msgCommand(args.slice(1))

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
	console.log("  init <name>               Initialize a new agent")
	console.log("  dev                       Start development server")
	console.log("  build [--target]          Build for deployment (firecracker)")
	console.log("  start                     Run built agent")
	console.log("  msg <message>             Send a message to an agent")
	console.log(
		"  deploy [platform]              Deploy to a Firecracker provider"
	)
	console.log("  deploy sleep <name>            Put VM to sleep")
	console.log("  deploy wake <name>             Wake VM")
	console.log("  deploy status <name>           Show VM status")
	console.log("  deploy logs <name>             Stream agent logs")
	console.log("  deploy teardown <name> [--all] Destroy VM")
	console.log("")
	console.log("Deploy flags:")
	console.log("  --provider <name>  Override provider (sprites, e2b, northflank, daytona)")
	console.log("  --name <name>         Override instance name")
	console.log("  --force               Recreate VM even if it exists")
	console.log("  --no-build            Skip build step")
	console.log("  --public              Make the sprite URL public (no auth wall)")
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
	const credentialsDir = resolve(targetDir, "credentials")
	mkdirSync(credentialsDir, { recursive: true })
	const acl: { version: number; allowFrom: string[] } = {
		version: 1,
		allowFrom: []
	}
	const ownerResponse = await prompts({
		type: "text",
		name: "address",
		message: "Enter your wallet address (owner, optional)"
	})
	const ownerAddress = ownerResponse?.address?.trim() || ""
	if (ownerAddress) {
		acl.allowFrom.push(ownerAddress.toLowerCase())
		console.log(`\n✅ Added owner: ${ownerAddress.toLowerCase()}`)
	}
	writeFileSync(
		resolve(credentialsDir, "allowFrom.json"),
		JSON.stringify(acl, null, 2)
	)

	// Close readline now that all prompts are done
	// (rl is not used — all prompts use the prompts library now)

	// Update .env file with generated key and API keys
	let envContent = readFileSync(envPath, "utf-8")

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
	const buildTarget = target || "firecracker"

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

	const files = ["server/index.mjs"]

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

	// Generate Dockerfile (only COPY files that exist in dist)
	writeFileSync(resolve(distDir, "Dockerfile"), generateDockerfile(distDir))

	// .hybrid-deploy.json manifest for provider consumption
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

	// Generate start script
	writeFileSync(
		resolve(distDir, "start.sh"),
		`#!/bin/sh
node server/index.mjs
`
	)

	console.log("\n✅ Build complete!")
	console.log(`   Output: ${distDir}`)
	console.log(`   Target: ${buildTarget}`)
}

function generateDockerfile(distDir: string): string {
	const configFiles = [
		"SOUL.md",
		"AGENTS.md",
		"IDENTITY.md",
		"TOOLS.md",
		"BOOT.md",
		"BOOTSTRAP.md",
		"HEARTBEAT.md",
		"USER.md",
	]
	const present = configFiles.filter((f) =>
		existsSync(resolve(distDir, f)),
	)
	const hasCredentials = existsSync(resolve(distDir, "credentials"))
	const configCopy = present.length > 0 ? `COPY ${present.join(" ")} ./` : ""
	const credCopy = hasCredentials ? "COPY credentials/ ./credentials/" : ""

	return `FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY server/ ./server/
${configCopy}
${credCopy}
ENV AGENT_PORT=8454
ENV NODE_ENV=production
ENV DATA_ROOT=/app/data
EXPOSE 8454
USER node
CMD ["node", "server/index.mjs"]
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

	const projectDir = projectRoot
	const agentServer = resolve(packageDir, "dist", "server", "index.cjs")

	console.log("\n🚀 Starting development server...\n")
	console.log(`   Project: ${projectDir}`)
	console.log(`   Runtime: ${packageDir}\n`)

	try {
		execSync(`node ${agentServer}`, {
			cwd: projectDir,
			stdio: "inherit",
			env: {
				...process.env,
				AGENT_PROJECT_ROOT: projectDir
			}
		})
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

	const exitHandler = (code: number | null) => {
		if (code !== 0 && code !== null) process.exit(code)
	}

	server.on("exit", exitHandler)

	process.on("SIGINT", () => {
		server.kill("SIGINT")
		process.exit(0)
	})
}

// ============================================================================
// Deploy — delegates to deploy/ providers
// ============================================================================

let deployModule: typeof import("./deploy/deploy") | null = null
async function loadDeploy() {
	if (!deployModule) {
		deployModule = await import("./deploy/deploy")
	}
	return deployModule
}

function parseDeployArgs(args: string[]) {
	// Collect known flag indices so we don't mistake flag values as positional names
	const skipSet = new Set<number>()
	// Only flags that consume a value should skip the NEXT index
	const valuedFlags = new Set([
		"--provider",
		"-p",
		"--name",
		"-n",
	])
	for (let i = 0; i < args.length; i++) {
		if (valuedFlags.has(args[i])) {
			skipSet.add(i)
			skipSet.add(i + 1)
		}
	}
	const providerIdx = args.indexOf("--provider")
	const providerAltIdx = args.indexOf("-p")
	const nameIdx = args.indexOf("--name")
	const nameAltIdx = args.indexOf("-n")
	const providerFlag =
		(providerIdx !== -1 ? args[providerIdx + 1] : undefined) ||
		(providerAltIdx !== -1 ? args[providerAltIdx + 1] : undefined)
	const nameFlag =
		(nameIdx !== -1 ? args[nameIdx + 1] : undefined) ||
		(nameAltIdx !== -1 ? args[nameAltIdx + 1] : undefined)

	// Find the first positional arg that isn't a flag, flag value, or subcommand
	const name = args.find(
		(a, i) =>
			i > 1 &&
			!a.startsWith("--") &&
			!a.startsWith("-") &&
			!skipSet.has(i) &&
			a !== "deploy" &&
			a !== "sleep" &&
			a !== "wake" &&
			a !== "status" &&
			a !== "logs" &&
			a !== "teardown" &&
			a !== providerFlag &&
			a !== nameFlag,
	)
	const skipBuild = args.includes("--no-build")
	const force = args.includes("--force")
	const makePublic = args.includes("--public")
	const follow = !args.includes("--no-follow")
	return {
		platform: providerFlag,
		name: name || nameFlag,
		skipBuild,
		force,
		public: makePublic,
		follow,
	}
}

async function deployCommand(args: string[]) {
	const sub = args[1]

	// If sub looks like a known provider, treat it as the platform and deploy.
	// Otherwise treat it as a subcommand.
	const knownProviders = new Set([
		"sprites",
		"e2b",
		"daytona",
		"northflank",
	])
	const isPlatform = sub && !sub.startsWith("-") && knownProviders.has(sub)

	if (!sub || sub.startsWith("-") || isPlatform) {
		const flags = parseDeployArgs(args)
		const { runDeploy } = await loadDeploy()
		await runDeploy(
			{
				platform: flags.platform || (isPlatform ? sub : undefined),
				name: flags.name,
				skipBuild: flags.skipBuild,
				force: flags.force,
				public: flags.public,
			},
			projectRoot,
			packageDir,
		)
		return
	}

	const pIdx = args.indexOf("--provider")
	const pAlt = args.indexOf("-p")
	const nIdx = args.indexOf("--name")
	const nAlt = args.indexOf("-n")
	const subPlatform =
		(pIdx !== -1 ? args[pIdx + 1] : undefined) ||
		(pAlt !== -1 ? args[pAlt + 1] : undefined)
	const subSkipIdx = new Set<number>()
	subSkipIdx.add(pIdx)
	subSkipIdx.add(pAlt)
	subSkipIdx.add(nIdx)
	subSkipIdx.add(nAlt)
	// Skip the values after valued flags too
	if (pIdx !== -1) subSkipIdx.add(pIdx + 1)
	if (pAlt !== -1) subSkipIdx.add(pAlt + 1)
	if (nIdx !== -1) subSkipIdx.add(nIdx + 1)
	if (nAlt !== -1) subSkipIdx.add(nAlt + 1)
	const name = args.find(
		(a, i) => i > 1 && !a.startsWith("-") && !subSkipIdx.has(i),
	)

	switch (sub) {
		case "sleep": {
			if (!name) {
				console.error("Usage: hybrid deploy sleep <name>")
				process.exit(1)
			}
			const { runSleep } = await loadDeploy()
			await runSleep(name, subPlatform, projectRoot)
			break
		}
		case "wake": {
			if (!name) {
				console.error("Usage: hybrid deploy wake <name>")
				process.exit(1)
			}
			const { runWake } = await loadDeploy()
			await runWake(name, subPlatform, projectRoot)
			break
		}
		case "status": {
			if (!name) {
				console.error("Usage: hybrid deploy status <name>")
				process.exit(1)
			}
			const { runStatus } = await loadDeploy()
			await runStatus(name, subPlatform, projectRoot)
			break
		}
		case "logs": {
			if (!name) {
				console.error("Usage: hybrid deploy logs <name>")
				process.exit(1)
			}
			const follow = !args.includes("--no-follow")
			const { runLogs } = await loadDeploy()
			await runLogs(name, follow, subPlatform, projectRoot)
			break
		}
		case "teardown": {
			if (!name) {
				console.error("Usage: hybrid deploy teardown <name>")
				process.exit(1)
			}
			const { runTeardown } = await loadDeploy()
			await runTeardown(name, subPlatform, projectRoot)
			break
		}
		default:
			console.error(`Unknown deploy subcommand: ${sub}`)
			printDeployHelp()
			process.exit(1)
	}
}

function printDeployHelp() {
	console.error("")
	console.error("Usage: hybrid deploy <subcommand>")
	console.error("")
	console.error("Commands:")
	console.error(
		"  deploy [platform]             Deploy to a Firecracker provider"
	)
	console.error("  deploy sleep <name>            Put VM to sleep")
	console.error("  deploy wake <name>             Wake VM")
	console.error("  deploy status <name>           Show VM status")
	console.error("  deploy logs <name>             Stream agent logs")
	console.error("  deploy teardown <name> [--all] Destroy VM")
	console.error("")
	console.error(
		"Flags: --provider <name>  --name <name>  --force  --no-build  --no-follow  --public"
	)
}

// ============================================================================
// Msg — Send a message to any agent over HTTP
// ============================================================================

async function msgCommand(msgArgs: string[]) {
	// Parse flags: --user, --chat, --conversation, --channel, --url
	let message = msgArgs.find((a) => !a.startsWith("--"))
	const urlFlag = msgArgs.find(
		(_, i) => {
			const prev = msgArgs[i - 1]
			return prev === "--url"
		}
	)
	const userId = msgArgs.find(
		(_, i) => {
			const prev = msgArgs[i - 1]
			return prev === "--user" || prev === "-u"
		}
	)
	const chatId = msgArgs.find(
		(_, i) => {
			const prev = msgArgs[i - 1]
			return prev === "--chat" || prev === "-c"
		}
	)
	const conversationId = msgArgs.find(
		(_, i) => {
			const prev = msgArgs[i - 1]
			return prev === "--conversation" || prev === "--convo"
		}
	)
	const channelFlag = msgArgs.find(
		(_, i) => {
			const prev = msgArgs[i - 1]
			return prev === "--channel"
		}
	)
	const noStream = msgArgs.includes("--no-stream") || msgArgs.includes("-n")

	if (!message) {
		console.error("Usage: hybrid msg <message> [flags]")
		console.error("")
		console.error("Send a message to an agent and stream the response.")
		console.error("")
		console.error("Environment:")
		console.error("  AGENT_URL   Agent base URL (default: http://localhost:8454)")
		console.error("")
		console.error("Flags:")
		console.error("  --url <url>            Override AGENT_URL")
		console.error("  -u, --user <id>        User ID (default: anonymous)")
		console.error("  -c, --chat <id>        Chat/session ID (default: random)")
		console.error("  --convo <id>           Conversation ID (for scope & reminders)")
		console.error("  --channel <ch>         Channel hint (web, slack, whatsapp, ...)")
		console.error("  -n, --no-stream        Buffer and print full response at once")
		console.error("")
		console.error("Examples:")
		console.error('  hybrid msg "Hello!"')
		console.error('  hybrid msg "hi there" --url https://my-agent.sprites.dev')
		console.error('  hybrid msg "remind me at 5pm" -u alice --convo slack-D123')
		process.exit(1)
	}

	const agentUrl = urlFlag || process.env.AGENT_URL || "http://localhost:8454"
	const chatIdValue = chatId || crypto.randomUUID()
	const conversationIdValue = conversationId || undefined
	const channelValue = channelFlag || "web"

	// ── Resolve identity key ─────────────────────────────────────────────
	// Priority: PRIVATE_KEY env > .hybrid-key.json in project root
	const { signRequestBody, recoverRequestSigner } = await import("./lib/sign")

	let privateKey = process.env.PRIVATE_KEY

	// Fall back to local key file
	if (!privateKey) {
		const { existsSync, readFileSync } = await import("node:fs")
		const { resolve } = await import("node:path")
		const localKeyPath = resolve(projectRoot, ".hybrid-key.json")
		if (existsSync(localKeyPath)) {
			try {
				const keyData = JSON.parse(readFileSync(localKeyPath, "utf-8"))
				privateKey = keyData.privateKey
			} catch { /* ignore */ }
		}
	}

	// Build request body
	const bodyObj = {
		messages: [
			{
				id: crypto.randomUUID(),
				role: "user" as const,
				content: message
			}
		],
		chatId: chatIdValue,
		userId: "anonymous", // server overrides with recovered address when signed
		conversationId: conversationIdValue,
		channel: channelValue
	}
	const bodyStr = JSON.stringify(bodyObj)

	// Sign if we have a key
	let signature: string | undefined
	let signerAddress: string | undefined
	if (privateKey) {
		signature = await signRequestBody(bodyStr, privateKey)
		signerAddress = (await recoverRequestSigner(bodyStr, signature)) ?? undefined
	}

	const endpoint = `${agentUrl.replace(/\/+$/, "")}/api/chat`

	console.error("")
	console.error(`  → ${endpoint}`)
	if (signerAddress) {
		console.error(`  signed: ${signerAddress} | chat: ${chatIdValue.slice(0, 8)}… | channel: ${channelValue}`)
	} else {
		const anonId = userId || "anonymous"
		console.error(`  user: ${anonId} | chat: ${chatIdValue.slice(0, 8)}… | channel: ${channelValue}`)
		console.error(`  ⚠️  unsigned — set PRIVATE_KEY or create .hybrid-key.json`)
	}
	console.error("")

	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"X-Source": "cli"
		}
		if (signature) {
			headers["X-Signature"] = signature
		}

		const response = await fetch(endpoint, {
			method: "POST",
			headers,
			body: bodyStr,
			redirect: "manual", // detect auth redirects explicitly
		})

		// Detect auth redirects (sprites.dev etc.)
		if ([301, 302, 303, 307, 308].includes(response.status)) {
			const location = response.headers.get("location") || ""
			console.error(`  ❌ Auth required — the agent is behind a login wall`)
			if (location) console.error(`  Redirect: ${location}`)
			console.error(`  💡 Make sprite auth public: sprite url update --auth public`)
			console.error(`  💡 Or run: sprite proxy 8454`)
			console.error(`  Then:  AGENT_URL=http://localhost:8454 hybrid msg "hi"`)
			process.exit(1)
		}

		if (!response.ok) {
			const body = await response.text()
			console.error(`  ❌ Agent returned ${response.status}: ${body}`)
			process.exit(1)
		}

		const reader = response.body?.getReader()
		if (!reader) {
			console.error("  ❌ No response body")
			process.exit(1)
		}

		const decoder = new TextDecoder()
		let buffer = ""
		let fullResponse = ""
		let errorOutput: string | null = null
		let usageInfo: object | null = null

		while (true) {
			const { done, value } = await reader.read()
			if (done) break

			const text = decoder.decode(value, { stream: true })
			buffer += text

			const lines = buffer.split("\n")
			buffer = lines.pop() || ""

			for (const line of lines) {
				const trimmed = line.trim()
				if (!trimmed.startsWith("data: ")) continue
				if (trimmed === "data: [DONE]") break

				try {
					const parsed = JSON.parse(trimmed.slice(6))
					if (parsed.type === "text" && parsed.content) {
						if (noStream) {
							fullResponse += parsed.content
						} else {
							process.stdout.write(parsed.content)
						}
					} else if (parsed.type === "error") {
						errorOutput = parsed.content || "Unknown error"
					} else if (parsed.type === "usage") {
						usageInfo = parsed
					}
				} catch {
					// skip malformed lines
				}
			}
		}

		if (errorOutput) {
			console.error(`\n\n  ❌ ${errorOutput}`)
			process.exit(1)
		}

		if (noStream && fullResponse) {
			process.stdout.write(fullResponse + "\n")
		}

		if (usageInfo) {
			const u = usageInfo as any
			console.error("")
			console.error(`  ${u.inputTokens ?? 0} in / ${u.outputTokens ?? 0} out | $${(u.totalCostUsd ?? 0).toFixed(4)}`)
			if (u.telemetry) {
				console.error(`  ⏱️  TTFB: ${u.telemetry.ttfbMs}ms | Latency: ${u.telemetry.llmLatencyMs}ms | Total: ${u.telemetry.totalMs}ms`)
			}
		}

		if (!noStream) console.error("")
	} catch (err) {
		if (err instanceof Error && (err as any).code === "ECONNREFUSED") {
			console.error(`  ❌ Connection refused: ${endpoint}`)
			console.error("  💡 Is the agent running? Try 'hybrid dev'")
		} else {
			console.error(`  ❌ ${err instanceof Error ? err.message : "Unknown error"}`)
		}
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
	const aclPath = join(projectDir, "credentials", "allowFrom.json")
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
	const aclPath = join(projectDir, "credentials", "allowFrom.json")

	if (!existsSync(aclPath)) {
		console.error("No ACL file. Run 'hybrid init' first.")
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
	const aclPath = join(projectDir, "credentials", "allowFrom.json")

	if (!existsSync(aclPath)) {
		console.log("\n⚠️  No ACL file. Run 'hybrid init' first.")
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
