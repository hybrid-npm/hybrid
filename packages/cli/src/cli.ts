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

	// Create ACL file with owner (skip for now)

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

	const files = ["server/index.cjs"]

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

	// Generate Dockerfile (generic Firecracker target)
	writeFileSync(resolve(distDir, "Dockerfile"), generateDockerfile())

	// .hybrid-deploy.json manifest for provider consumption
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

	// Generate start script
	writeFileSync(
		resolve(distDir, "start.sh"),
		`#!/bin/sh
node server/index.cjs
`
	)

	console.log("\n✅ Build complete!")
	console.log(`   Output: ${distDir}`)
	console.log(`   Target: ${buildTarget}`)
}

function generateDockerfile(): string {
	return `FROM node:20-bookworm-slim
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
	const name = args.find(
		(a, i) => i > 1 && !a.startsWith("--") && !a.startsWith("-")
	)
	const platform = args.find(
		(a, i) =>
			(i > 1 && a.endsWith(":") === false && args[i - 1] === "--provider") ||
			(i > 1 && args[i - 1] === "-p")
	)
	const providerFlag =
		args[args.indexOf("--provider") + 1] || args[args.indexOf("-p") + 1]
	const nameFlag =
		args[args.indexOf("--name") + 1] || args[args.indexOf("-n") + 1]
	const skipBuild = args.includes("--no-build")
	const force = args.includes("--force")
	const posArg = args[1] && !args[1].startsWith("-") ? args[1] : undefined
	const follow = !args.includes("--no-follow")
	return {
		platform: providerFlag,
		name: nameFlag || posArg,
		skipBuild,
		force,
		follow
	}
}

async function deployCommand(args: string[]) {
	const sub = args[1]

	// No subcommand — do full deploy
	if (!sub || sub.startsWith("-")) {
		const flags = parseDeployArgs(args)
		const { runDeploy } = await loadDeploy()
		await runDeploy(
			{
				platform: flags.platform,
				name: flags.name,
				skipBuild: flags.skipBuild,
				force: flags.force
			},
			projectRoot,
			packageDir
		)
		return
	}

	const name = args.find((a, i) => i > 1 && !a.startsWith("-"))
	const platform =
		args[args.indexOf("--provider") + 1] || args[args.indexOf("-p") + 1]

	switch (sub) {
		case "sleep": {
			if (!name) {
				console.error("Usage: hybrid deploy sleep <name>")
				process.exit(1)
			}
			const { runSleep } = await loadDeploy()
			await runSleep(name, platform, projectRoot)
			break
		}
		case "wake": {
			if (!name) {
				console.error("Usage: hybrid deploy wake <name>")
				process.exit(1)
			}
			const { runWake } = await loadDeploy()
			await runWake(name, platform, projectRoot)
			break
		}
		case "status": {
			if (!name) {
				console.error("Usage: hybrid deploy status <name>")
				process.exit(1)
			}
			const { runStatus } = await loadDeploy()
			await runStatus(name, platform, projectRoot)
			break
		}
		case "logs": {
			if (!name) {
				console.error("Usage: hybrid deploy logs <name>")
				process.exit(1)
			}
			const follow = !args.includes("--no-follow")
			const { runLogs } = await loadDeploy()
			await runLogs(name, follow, platform, projectRoot)
			break
		}
		case "teardown": {
			if (!name) {
				console.error("Usage: hybrid deploy teardown <name>")
				process.exit(1)
			}
			const { runTeardown } = await loadDeploy()
			await runTeardown(name, platform, projectRoot)
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
		"Flags: --provider <name>  --name <name>  --force  --no-build  --no-follow"
	)
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
