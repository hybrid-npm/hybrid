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

	if (command === "build") {
		return build(args[1])
	}

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

	if (command === "skills") {
		const subcommand = args[1]
		if (subcommand === "add") {
			const globalIndex = args.indexOf("-g")
			const globalIndex2 = args.indexOf("--global")
			const isGlobal = globalIndex !== -1 || globalIndex2 !== -1
			const sourceArg =
				args[2] === "-g" || args[2] === "--global" ? args[3] : args[2]
			return install(sourceArg, isGlobal)
		}
		if (subcommand === "remove" || subcommand === "rm") {
			const globalIndex = args.indexOf("-g")
			const globalIndex2 = args.indexOf("--global")
			const isGlobal = globalIndex !== -1 || globalIndex2 !== -1
			const nameArg =
				args[2] === "-g" || args[2] === "--global" ? args[3] : args[2]
			return uninstall(nameArg, isGlobal)
		}
		if (subcommand === "list" || subcommand === "ls" || !subcommand) {
			return skillsList()
		}
		console.error(`Unknown skills subcommand: ${subcommand}`)
		console.error("Usage: hybrid skills add|remove|list")
		process.exit(1)
	}

	console.log("Usage: hybrid <command>")
	console.log("")
	console.log("Commands:")
	console.log("  init <name>        Initialize a new agent from template")
	console.log("  build [--target]   Build agent bundle (.hybrid/)")
	console.log("  dev                Start development server")
	console.log("  dev --docker       Start development server with Docker")
	console.log("  register           Register wallet on XMTP network")
	console.log("  deploy [platform]  Deploy (fly, railway, cf)")
	console.log("")
	console.log("Skills:")
	console.log("  skills add <source> [-g]    Install a skill")
	console.log("  skills remove <name> [-g]    Remove a skill")
	console.log("  skills list                  List installed skills")
	console.log("")
	console.log("  -g, --global                 Use ~/.hybrid/skills/")
	console.log("")
	console.log("Sources:")
	console.log("  github:owner/repo            GitHub repository")
	console.log("  github:owner/repo/skill     Specific skill in repo")
	console.log("  @scope/package              npm package")
	console.log("  ./local-path                Local directory")
	console.log("")

	if (command) {
		process.exit(1)
	}
}

async function build(target?: string) {
	const { execSync } = await import("node:child_process")
	const { resolve, dirname, basename } = await import("node:path")
	const { fileURLToPath } = await import("node:url")
	const {
		cpSync,
		existsSync,
		mkdirSync,
		rmSync,
		writeFileSync,
		readdirSync,
		readFileSync
	} = await import("node:fs")

	const __dirname = dirname(fileURLToPath(import.meta.url))
	const projectDir = process.cwd()
	const monorepoDir = resolve(__dirname, "../../..")
	const hybridDir = resolve(projectDir, ".hybrid")
	const buildTarget = target || "fly"

	console.log("\n🔧 Building agent...")

	// Build packages/agent
	try {
		execSync("npx pnpm --filter hybrid/agent run build", {
			cwd: monorepoDir,
			stdio: "inherit"
		})
	} catch {
		console.error("Build failed")
		process.exit(1)
	}

	// Create .hybrid directory structure
	console.log("\n📁 Creating .hybrid/ directory...")
	rmSync(hybridDir, { recursive: true, force: true })
	mkdirSync(resolve(hybridDir, "skills/core"), { recursive: true })
	mkdirSync(resolve(hybridDir, "skills/ext"), { recursive: true })

	// Copy built agent
	console.log("📦 Copying agent bundle...")
	cpSync(
		resolve(monorepoDir, "packages/agent/dist"),
		resolve(hybridDir, "dist"),
		{
			recursive: true
		}
	)

	// Copy agent config from current directory (project)
	const agentDir = projectDir
	if (existsSync(resolve(agentDir, "SOUL.md"))) {
		console.log("📋 Copying agent config...")
		// Copy SOUL.md, AGENTS.md (not README.md)
		for (const file of ["SOUL.md", "AGENTS.md"]) {
			const src = resolve(agentDir, file)
			if (existsSync(src)) {
				cpSync(src, resolve(hybridDir, file))
				console.log(`   ✓ ${file}`)
			}
		}
		// Copy agent.ts config
		const agentConfigSrc = resolve(agentDir, "agent.ts")
		if (existsSync(agentConfigSrc)) {
			cpSync(agentConfigSrc, resolve(hybridDir, "agent.config.js"))
			console.log("   ✓ agent.config.js")
		}
	}

	// Copy core skills from packages/agent/skills/
	const coreSkillsDir = resolve(monorepoDir, "packages/agent/skills")
	if (existsSync(coreSkillsDir)) {
		console.log("📚 Copying core skills...")
		const coreSkills = readdirSync(coreSkillsDir, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name)

		for (const skill of coreSkills) {
			const srcPath = resolve(coreSkillsDir, skill)
			const destPath = resolve(hybridDir, "skills/core", skill)
			cpSync(srcPath, destPath, { recursive: true })
			console.log(`   ✓ ${skill}`)
		}
	}

	// Copy user skills from ./skills/
	const userSkillsDir = resolve(projectDir, "skills")
	if (existsSync(userSkillsDir)) {
		console.log("🔌 Copying user skills...")
		const userSkills = readdirSync(userSkillsDir, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name)

		for (const skill of userSkills) {
			const srcPath = resolve(userSkillsDir, skill)
			const destPath = resolve(hybridDir, "skills/ext", skill)
			cpSync(srcPath, destPath, { recursive: true })
			console.log(`   ✓ ${skill}`)
		}
	}

	// Generate skill index
	console.log("📝 Generating skill index...")
	const coreSkills = existsSync(coreSkillsDir)
		? readdirSync(coreSkillsDir, { withFileTypes: true })
				.filter((dirent) => dirent.isDirectory())
				.map((dirent) => dirent.name)
		: []
	const userSkills = existsSync(userSkillsDir)
		? readdirSync(userSkillsDir, { withFileTypes: true })
				.filter((dirent) => dirent.isDirectory())
				.map((dirent) => dirent.name)
		: []

	writeFileSync(
		resolve(hybridDir, "skills/skills_lock.json"),
		JSON.stringify({ core: coreSkills, ext: userSkills }, null, 2)
	)

	// Generate package.json for the build (use deployment package.json if available)
	console.log("📦 Generating package.json...")
	const deployPkgPath = resolve(monorepoDir, "deployments/flyio/package.json")
	let pkg: Record<string, unknown> = {
		name: "hybrid-agent",
		version: "1.0.0",
		type: "module",
		dependencies: {
			"@anthropic-ai/claude-agent-sdk": "^0.2.38",
			"@anthropic-ai/claude-code": "^2.1.56",
			"@hono/node-server": "^1.13.5",
			"@xmtp/agent-sdk": "0.0.14",
			ai: "^6.0.0",
			dotenv: "^16.4.5",
			hono: "^4.10.8",
			viem: "^2.46.2"
		}
	}
	if (existsSync(deployPkgPath)) {
		try {
			pkg = JSON.parse(readFileSync(deployPkgPath, "utf-8"))
		} catch {
			// Use defaults
		}
	}
	writeFileSync(
		resolve(hybridDir, "package.json"),
		JSON.stringify(pkg, null, 2)
	)

	// Generate Dockerfile
	console.log(`🐳 Generating Dockerfile for ${buildTarget}...`)
	writeFileSync(
		resolve(hybridDir, "Dockerfile"),
		generateDockerfile(buildTarget)
	)

	// Generate fly.toml for Fly.io
	if (buildTarget === "fly") {
		console.log("🚀 Generating fly.toml...")
		writeFileSync(resolve(hybridDir, "fly.toml"), generateFlyToml())
	}

	// Generate start script
	console.log("🚀 Generating start script...")
	writeFileSync(
		resolve(hybridDir, "start.sh"),
		`#!/bin/sh
node dist/server/simple.cjs &
node dist/xmtp.cjs &
wait
`
	)

	console.log("\n✅ Build complete!")
	console.log(`   Output: ${hybridDir}`)
	console.log(`   Core skills: ${coreSkills.length}`)
	console.log(`   Extensions: ${userSkills.length}`)
	console.log(`   Target: ${buildTarget}`)
}

function generateDockerfile(target: string): string {
	if (target === "fly" || target === "railway") {
		return `FROM node:20

WORKDIR /app

# Copy hybrid build (context is .hybrid/ directory)
COPY dist/ ./dist/
COPY skills/ ./skills/
COPY package.json ./package.json
COPY start.sh ./start.sh

# Copy agent docs and config
COPY SOUL.md ./SOUL.md
COPY AGENTS.md ./AGENTS.md

# Install dependencies
RUN npm install

# Create data directories
RUN mkdir -p /app/data/xmtp

ENV AGENT_PORT=4100
ENV NODE_ENV=production
EXPOSE 4100

CMD ["sh", "start.sh"]
`
	}

	if (target === "cf" || target === "cloudflare") {
		return `# Cloudflare Workers deployment
# Build the gateway and deploy with wrangler
FROM node:20
WORKDIR /app
COPY . ./
RUN npm install
`
	}

	return `FROM node:20
WORKDIR /app
COPY . ./
RUN npm install
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
  AGENT_PORT = "4100"
  XMTP_ENV = "production"

[[services]]
  protocol = "tcp"
  internal_port = 4100

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

async function install(source: string, isGlobal = false) {
	if (!source) {
		console.error("Error: Skill source required")
		console.error("Usage: hybrid skills add <source>")
		console.error("       hybrid skills add <source> -g  # Global install")
		console.error("")
		console.error("Sources:")
		console.error("  github:owner/repo")
		console.error("  github:owner/repo/skill")
		console.error("  @scope/package")
		console.error("  ./local-path")
		process.exit(1)
	}

	const { resolve, dirname } = await import("node:path")
	const { fileURLToPath } = await import("node:url")
	const { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } =
		await import("node:fs")
	const { execSync } = await import("node:child_process")
	const { homedir } = await import("node:os")

	const projectDir = process.cwd()
	const globalSkillsDir = resolve(homedir(), ".hybrid", "skills")
	const projectSkillsDir = resolve(projectDir, "skills")
	const skillsDir = isGlobal ? globalSkillsDir : projectSkillsDir
	const lockfilePath = resolve(skillsDir, "..", "skills-lock.json")

	// Ensure skills directory exists
	if (!existsSync(skillsDir)) {
		mkdirSync(skillsDir, { recursive: true })
	}

	let skillName: string
	let skillPath: string

	// Create temp directory for downloads
	const tempBase = resolve(skillsDir, ".temp")
	if (!existsSync(tempBase)) {
		mkdirSync(tempBase, { recursive: true })
	}

	// Parse source type
	if (source.startsWith("github:")) {
		// GitHub source: github:user/repo/skill or github:user/repo
		const parts = source.slice(7).split("/")
		if (parts.length < 2) {
			console.error(
				"Invalid GitHub source. Use: github:user/repo or github:user/repo/skill"
			)
			process.exit(1)
		}

		const repo = parts.slice(0, 2).join("/")
		skillName = parts[2] || parts[1]

		console.log(`📥 Installing from GitHub: ${repo}...`)

		// Clone to temp directory
		const tempDir = resolve(tempBase, "skill-install")
		try {
			execSync(
				`git clone --depth 1 https://github.com/${repo}.git ${tempDir}`,
				{
					stdio: "inherit",
					env: { ...process.env, DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1" }
				}
			)
		} catch {
			console.error("Failed to clone repository")
			process.exit(1)
		}

		// Find SKILL.md
		const skillDir = parts[2] ? resolve(tempDir, ...parts.slice(2)) : tempDir

		if (!existsSync(resolve(skillDir, "SKILL.md"))) {
			console.error("No SKILL.md found in repository")
			process.exit(1)
		}

		skillPath = resolve(skillsDir, skillName)
		cpSync(skillDir, skillPath, { recursive: true })

		// Cleanup temp
		execSync(`rm -rf ${tempDir}`)
	} else if (source.startsWith("@") || source.includes("/")) {
		// npm package
		skillName = source.split("/").pop() || source

		console.log(`📥 Installing from npm: ${source}...`)

		const tempNpmDir = resolve(tempBase, "npm-install")
		try {
			execSync(`npm install ${source} --prefix ${tempNpmDir}`, {
				stdio: "inherit",
				env: { ...process.env, DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1" }
			})
		} catch {
			console.error("Failed to install npm package")
			process.exit(1)
		}

		const installedDir = resolve(tempNpmDir, "node_modules", source)
		if (!existsSync(resolve(installedDir, "SKILL.md"))) {
			console.error("No SKILL.md found in npm package")
			process.exit(1)
		}

		skillPath = resolve(skillsDir, skillName)
		cpSync(installedDir, skillPath, { recursive: true })

		// Cleanup temp
		execSync(`rm -rf ${tempNpmDir}`)
	} else if (
		source.startsWith("./") ||
		source.startsWith("../") ||
		!source.includes("/")
	) {
		// Local path
		const localPath =
			source.startsWith("./") || source.startsWith("../")
				? resolve(process.cwd(), source)
				: resolve(process.cwd(), source)

		if (!existsSync(resolve(localPath, "SKILL.md"))) {
			console.error(`No SKILL.md found at ${localPath}`)
			process.exit(1)
		}

		skillName = source.split("/").pop() || source
		skillPath = resolve(skillsDir, skillName)
		cpSync(localPath, skillPath, { recursive: true })
	} else {
		console.error("Unknown source format")
		console.error("Use: github:user/repo, @scope/package, or ./local-path")
		process.exit(1)
	}

	// Update lockfile
	let lockfile: { version: number; extensions: Record<string, any> } = {
		version: 2,
		extensions: {}
	}
	if (existsSync(lockfilePath)) {
		try {
			lockfile = JSON.parse(readFileSync(lockfilePath, "utf-8"))
		} catch {
			// Use defaults
		}
	}

	lockfile.extensions[skillName] = {
		source,
		installedAt: new Date().toISOString()
	}

	writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2))

	console.log(`\n✅ Installed skill: ${skillName}`)
	console.log(`   Location: skills/${skillName}/`)
}

async function uninstall(name: string, isGlobal = false) {
	if (!name) {
		console.error("Error: Skill name required")
		console.error("Usage: hybrid skills remove <skill-name>")
		console.error(
			"       hybrid skills remove <skill-name> -g  # Remove global skill"
		)
		process.exit(1)
	}

	const { resolve } = await import("node:path")
	const { homedir } = await import("node:os")
	const { existsSync, rmSync, readFileSync, writeFileSync } = await import(
		"node:fs"
	)

	const projectDir = process.cwd()
	const globalSkillsDir = resolve(homedir(), ".hybrid", "skills")
	const projectSkillsDir = resolve(projectDir, "skills")
	const skillsDir = isGlobal ? globalSkillsDir : projectSkillsDir
	const skillPath = resolve(skillsDir, name)
	const lockfilePath = resolve(skillsDir, "..", "skills-lock.json")

	if (!existsSync(skillPath)) {
		console.error(
			`Skill '${name}' not found in ${isGlobal ? "~/.hybrid/skills/" : "./skills/"}`
		)
		process.exit(1)
	}

	rmSync(skillPath, { recursive: true })

	// Update lockfile
	if (existsSync(lockfilePath)) {
		const lockfile = JSON.parse(readFileSync(lockfilePath, "utf-8"))
		delete lockfile.extensions[name]
		writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2))
	}

	console.log(`✅ Removed skill: ${name}`)
}

async function skillsList() {
	const { resolve } = await import("node:path")
	const { homedir } = await import("node:os")
	const { existsSync, readdirSync, readFileSync } = await import("node:fs")

	const projectDir = process.cwd()
	const globalSkillsDir = resolve(homedir(), ".hybrid", "skills")
	const projectSkillsDir = resolve(projectDir, "skills")

	// Project skills
	console.log("\n🔌 Project Skills (./skills/):")
	if (existsSync(projectSkillsDir)) {
		const projectSkills = readdirSync(projectSkillsDir, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name)

		if (projectSkills.length === 0) {
			console.log("   (none)")
		} else {
			for (const skill of projectSkills) {
				const skillMdPath = resolve(projectSkillsDir, skill, "SKILL.md")
				let description = ""
				if (existsSync(skillMdPath)) {
					const content = readFileSync(skillMdPath, "utf-8")
					const match = content.match(/^description:\s*(.+)$/m)
					if (match) description = match[1]
				}
				console.log(`   ${skill}${description ? ` - ${description}` : ""}`)
			}
		}
	} else {
		console.log("   (none)")
	}

	// Global skills
	console.log("\n🌐 Global Skills (~/.hybrid/skills/):")
	if (existsSync(globalSkillsDir)) {
		const globalSkills = readdirSync(globalSkillsDir, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name)

		if (globalSkills.length === 0) {
			console.log("   (none)")
		} else {
			for (const skill of globalSkills) {
				const skillMdPath = resolve(globalSkillsDir, skill, "SKILL.md")
				let description = ""
				if (existsSync(skillMdPath)) {
					const content = readFileSync(skillMdPath, "utf-8")
					const match = content.match(/^description:\s*(.+)$/m)
					if (match) description = match[1]
				}
				console.log(`   ${skill}${description ? ` - ${description}` : ""}`)
			}
		}
	} else {
		console.log("   (none)")
	}

	console.log("")
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
	const { spawn, execSync } = await import("node:child_process")
	const { resolve, dirname } = await import("node:path")
	const { fileURLToPath } = await import("node:url")

	const __dirname = dirname(fileURLToPath(import.meta.url))
	const rootDir = resolve(__dirname, "../../..")

	// Build first
	await build(platform)

	if (platform === "fly" || !platform) {
		const flyToken = process.env.FLY_API_TOKEN
		if (!flyToken) {
			console.error("Error: Please run 'fly auth login' first")
			console.error("Or set FLY_API_TOKEN environment variable")
			process.exit(1)
		}

		console.log("\n🚀 Deploying to Fly.io...")

		const hybridDir = resolve(rootDir, ".hybrid")

		// Deploy from .hybrid directory with the generated fly.toml
		await new Promise<void>((resolve, reject) => {
			const deploy = spawn(
				"fly",
				["deploy", "--config", "fly.toml", "--dockerfile", "Dockerfile"],
				{
					cwd: hybridDir,
					stdio: "inherit",
					env: { ...process.env, FLY_API_TOKEN: flyToken }
				}
			)
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
	console.log("  hybrid build          # Build agent bundle")
	console.log("  hybrid deploy         # Deploy to Fly.io")
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
