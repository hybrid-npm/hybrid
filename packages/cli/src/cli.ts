#!/usr/bin/env node

import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { config } from "dotenv"

// Load .env first, then .env.local (which overrides)
const projectRoot = process.cwd()
const envFiles = [
	resolve(projectRoot, ".env"),
	resolve(projectRoot, ".env.local")
]
for (const envFile of envFiles) {
	if (existsSync(envFile)) {
		config({ path: envFile })
	}
}

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

	if (command === "start") {
		return start()
	}

	if (command === "deploy") {
		return deploy(args[1])
	}

	if (command === "init") {
		return init(args[1])
	}

	if (command === "keygen") {
		return keygen(args[1])
	}

	if (command === "register") {
		return register()
	}

	if (command === "revoke") {
		return revoke(args[1])
	}

	if (command === "revoke-all") {
		return revokeAll()
	}

	if (command === "owner") {
		const subcommand = args[1]
		if (subcommand === "add") {
			return ownerAdd(args[2])
		}
		if (subcommand === "remove" || subcommand === "rm") {
			return ownerRemove(args[2])
		}
		if (subcommand === "list" || subcommand === "ls") {
			return ownerList()
		}
		console.log("\nUsage: hybrid owner <command>")
		console.log("\nCommands:")
		console.log("  owner add <address>    Add an owner")
		console.log("  owner remove <address> Remove an owner")
		console.log("  owner list             List all owners")
		process.exit(1)
	}

	if (command === "install") {
		return install(args[1])
	}

	if (command === "uninstall") {
		return uninstall(args[1])
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
	console.log("  keygen [prefix]   Generate a new wallet (optional hex prefix)")
	console.log("  build [--target]  Build agent bundle (.hybrid/)")
	console.log("  dev               Start development server")
	console.log("  dev --docker      Start development server with Docker")
	console.log("  start             Run built agent from .hybrid/")
	console.log("  register          Register wallet on XMTP network")
	console.log("  revoke <inboxId>   Revoke installations for an inbox ID")
	console.log(
		"  revoke-all         Revoke all XMTP installations (auto-detect)"
	)
	console.log("  deploy [platform]  Deploy (fly, railway, cf)")
	console.log("")
	console.log("Owner:")
	console.log("  owner add <address>    Add an owner")
	console.log("  owner remove <address>  Remove an owner")
	console.log("  owner list              List all owners")
	console.log("")
	console.log("Skills:")
	console.log("  skills add <source> [-g]    Install a skill")
	console.log("  skills remove <name> [-g]    Remove a skill")
	console.log("  skills list                  List installed skills")
	console.log("")
	console.log("  -g, --global                 Use ~/.hybrid/skills/")
	console.log("")
	console.log("Sources:")
	console.log("  owner/repo                 GitHub shorthand")
	console.log("  owner/repo/skill          GitHub skill path")
	console.log("  github:owner/repo         GitHub (explicit)")
	console.log("  @scope/package            npm scoped package")
	console.log("  package-name              npm package (bare name)")
	console.log("  ./local-path              Local directory")
	console.log("")

	if (command) {
		process.exit(1)
	}
}

async function ensureSkills(projectDir: string, monorepoDir: string) {
	const { resolve } = await import("node:path")
	const { cpSync, existsSync, mkdirSync, readdirSync } = await import("node:fs")

	const hybridDir = resolve(projectDir, ".hybrid")
	const coreSkillsDir = resolve(monorepoDir, "packages/agent/skills")
	const userSkillsDir = resolve(projectDir, "skills")

	// Ensure .hybrid/skills directories exist
	mkdirSync(resolve(hybridDir, "skills/core"), { recursive: true })
	mkdirSync(resolve(hybridDir, "skills/ext"), { recursive: true })

	// Copy core skills if not already present
	if (existsSync(coreSkillsDir)) {
		const coreSkills = readdirSync(coreSkillsDir, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name)

		for (const skill of coreSkills) {
			const destPath = resolve(hybridDir, "skills/core", skill)
			if (!existsSync(destPath)) {
				cpSync(resolve(coreSkillsDir, skill), destPath, { recursive: true })
			}
		}
	}

	// Copy user skills if not already present
	if (existsSync(userSkillsDir)) {
		const userSkills = readdirSync(userSkillsDir, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name)

		for (const skill of userSkills) {
			const destPath = resolve(hybridDir, "skills/ext", skill)
			if (!existsSync(destPath)) {
				cpSync(resolve(userSkillsDir, skill), destPath, { recursive: true })
			}
		}
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
		// Copy config file (priority: hybrid.config.ts > openclaw.json migration > agent.ts)
		const hybridConfigPath = resolve(agentDir, "hybrid.config.ts")
		const openclawConfigPath = resolve(agentDir, "openclaw.json")
		const agentConfigPath = resolve(agentDir, "agent.ts")

		if (existsSync(hybridConfigPath)) {
			cpSync(hybridConfigPath, resolve(hybridDir, "hybrid.config.js"))
			console.log("   ✓ hybrid.config.ts → hybrid.config.js")
		} else if (existsSync(openclawConfigPath)) {
			// Migrate openclaw.json → hybrid.config.ts
			const openclawContent = readFileSync(openclawConfigPath, "utf-8")
			const hybridConfigContent = `// Migrated from openclaw.json\nexport default ${openclawContent}`
			writeFileSync(resolve(agentDir, "hybrid.config.ts"), hybridConfigContent)
			cpSync(openclawConfigPath, resolve(hybridDir, "hybrid.config.js"))
			console.log(
				"   ✓ Migrated openclaw.json → hybrid.config.ts (original preserved)"
			)
		} else if (existsSync(agentConfigPath)) {
			cpSync(agentConfigPath, resolve(hybridDir, "hybrid.config.js"))
			console.log("   ✓ agent.ts → hybrid.config.js (legacy)")
		}
	}

	// Copy core skills from packages/agent/skills/
	const coreSkillsDir = resolve(monorepoDir, "packages/agent/skills")
	const coreSkillNames: string[] = []
	if (existsSync(coreSkillsDir)) {
		console.log("📚 Copying core skills...")
		const coreSkills = readdirSync(coreSkillsDir, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name)

		for (const skill of coreSkills) {
			const srcPath = resolve(coreSkillsDir, skill)
			const destPath = resolve(hybridDir, "skills/core", skill)
			cpSync(srcPath, destPath, { recursive: true })
			coreSkillNames.push(skill)
			console.log(`   ✓ ${skill}`)
		}
	}

	// Copy user skills from ./skills/
	// User skills can override core skills by using the same name
	const userSkillsDir = resolve(projectDir, "skills")
	const userSkillNames: string[] = []
	if (existsSync(userSkillsDir)) {
		console.log("🔌 Copying user skills...")
		const userSkills = readdirSync(userSkillsDir, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name)

		for (const skill of userSkills) {
			const srcPath = resolve(userSkillsDir, skill)
			const destPath = resolve(hybridDir, "skills/ext", skill)
			cpSync(srcPath, destPath, { recursive: true })
			userSkillNames.push(skill)

			// Warn if overriding a core skill
			if (coreSkillNames.includes(skill)) {
				console.log(`   ✓ ${skill} (overrides core)`)
			} else {
				console.log(`   ✓ ${skill}`)
			}
		}
	}

	// Generate skill index
	console.log("📝 Generating skill index...")
	writeFileSync(
		resolve(hybridDir, "skills/skills_lock.json"),
		JSON.stringify({ core: coreSkillNames, ext: userSkillNames }, null, 2)
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

	// Copy or generate fly.toml for Fly.io
	if (buildTarget === "fly") {
		const projectFlyToml = resolve(projectDir, "fly.toml")
		if (existsSync(projectFlyToml)) {
			console.log("📋 Copying fly.toml...")
			cpSync(projectFlyToml, resolve(hybridDir, "fly.toml"))
		} else {
			console.log("🚀 Generating fly.toml...")
			writeFileSync(resolve(hybridDir, "fly.toml"), generateFlyToml())
		}
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
	console.log(`   Core skills: ${coreSkillNames.length}`)
	console.log(`   Extensions: ${userSkillNames.length}`)
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

ENV AGENT_PORT=8454
ENV NODE_ENV=production
EXPOSE 8454

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
	const { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync } =
		await import("node:fs")
	const { execSync } = await import("node:child_process")
	const { homedir } = await import("node:os")

	// Helper to find SKILL.md in common locations
	function findSkillDir(baseDir: string, skillName: string): string | null {
		const searchPaths = [
			baseDir,
			resolve(baseDir, "skills", skillName),
			resolve(baseDir, skillName),
			resolve(baseDir, ".agents", "skills", skillName)
		]
		for (const path of searchPaths) {
			if (existsSync(resolve(path, "SKILL.md"))) {
				return path
			}
		}
		return null
	}

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
		// GitHub explicit: github:owner/repo or github:owner/repo/skill
		const parts = source.slice(7).split("/")
		if (parts.length < 2) {
			console.error(
				"Invalid GitHub source. Use: github:owner/repo or github:owner/repo/skill"
			)
			process.exit(1)
		}

		const repo = parts.slice(0, 2).join("/")
		skillName = parts[2] || parts[1]

		console.log(`📥 Installing from GitHub: ${repo}...`)

		const tempDir = resolve(tempBase, "skill-install")
		rmSync(tempDir, { recursive: true, force: true })
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

		// If specific skill path provided, use it; otherwise search for SKILL.md
		let skillDir: string
		if (parts[2]) {
			skillDir = resolve(tempDir, ...parts.slice(2))
		} else {
			const found = findSkillDir(tempDir, skillName)
			if (!found) {
				console.error("No SKILL.md found in repository")
				console.error(
					`Searched: root, skills/${skillName}/, .agents/skills/${skillName}/`
				)
				process.exit(1)
			}
			skillDir = found
		}

		if (!existsSync(resolve(skillDir, "SKILL.md"))) {
			console.error(`No SKILL.md found at ${skillDir}`)
			process.exit(1)
		}

		skillPath = resolve(skillsDir, skillName)
		cpSync(skillDir, skillPath, { recursive: true })

		execSync(`rm -rf ${tempDir}`)
	} else if (source.startsWith("./") || source.startsWith("../")) {
		// Local path
		const localPath = resolve(process.cwd(), source)

		if (!existsSync(resolve(localPath, "SKILL.md"))) {
			console.error(`No SKILL.md found at ${localPath}`)
			process.exit(1)
		}

		skillName = source.split("/").pop() || source
		skillPath = resolve(skillsDir, skillName)
		cpSync(localPath, skillPath, { recursive: true })
	} else if (source.startsWith("@")) {
		// npm scoped package: @scope/package
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

		execSync(`rm -rf ${tempNpmDir}`)
	} else if (source.includes("/")) {
		// GitHub shorthand: owner/repo or owner/repo/skill
		const parts = source.split("/")
		if (parts.length < 2) {
			console.error("Invalid source. Use: owner/repo or owner/repo/skill")
			process.exit(1)
		}

		const repo = parts.slice(0, 2).join("/")
		skillName = parts[2] || parts[1]

		console.log(`📥 Installing from GitHub: ${repo}...`)

		const tempDir = resolve(tempBase, "skill-install")
		rmSync(tempDir, { recursive: true, force: true })
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

		// If specific skill path provided, use it; otherwise search for SKILL.md
		let skillDir: string
		if (parts[2]) {
			skillDir = resolve(tempDir, ...parts.slice(2))
		} else {
			const found = findSkillDir(tempDir, skillName)
			if (!found) {
				console.error("No SKILL.md found in repository")
				console.error(
					`Searched: root, skills/${skillName}/, .agents/skills/${skillName}/`
				)
				process.exit(1)
			}
			skillDir = found
		}

		if (!existsSync(resolve(skillDir, "SKILL.md"))) {
			console.error(`No SKILL.md found at ${skillDir}`)
			process.exit(1)
		}

		skillPath = resolve(skillsDir, skillName)
		cpSync(skillDir, skillPath, { recursive: true })

		execSync(`rm -rf ${tempDir}`)
	} else {
		// Bare name - treat as npm package
		skillName = source

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

		execSync(`rm -rf ${tempNpmDir}`)
	}

	// Update lockfile
	let lockfile: { version: number; extensions: Record<string, any> } = {
		version: 2,
		extensions: {}
	}
	if (existsSync(lockfilePath)) {
		try {
			const parsed = JSON.parse(readFileSync(lockfilePath, "utf-8"))
			lockfile = {
				version: parsed.version || 2,
				extensions: parsed.extensions || {}
			}
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
	const projectDir = process.cwd()

	// Ensure skills are copied to .hybrid/
	await ensureSkills(projectDir, rootDir)

	if (useDocker) {
		console.log("\n🐳 Starting with Docker...\n")
		console.log("Docker dev not yet implemented for new structure")
		return
	}

	console.log("\n🚀 Starting agent (server + sidecar)...\n")

	const agentDir = resolve(rootDir, "packages/agent")

	try {
		execSync(
			'npx concurrently --names "server,xmtp" --prefix-colors "cyan,magenta" "npx tsx watch --clear-screen=false src/server/index.ts" "npx tsx watch --clear-screen=false src/xmtp.ts"',
			{
				cwd: agentDir,
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

async function start() {
	const { spawn } = await import("node:child_process")
	const { resolve, dirname } = await import("node:path")
	const { fileURLToPath } = await import("node:url")
	const { existsSync } = await import("node:fs")

	const __dirname = dirname(fileURLToPath(import.meta.url))
	const rootDir = resolve(__dirname, "../../..")
	const projectDir = process.cwd()
	const hybridDir = resolve(projectDir, ".hybrid")

	// Check if build exists
	if (!existsSync(resolve(hybridDir, "dist"))) {
		console.error("Error: No build found. Run 'hybrid build' first.")
		process.exit(1)
	}

	// Ensure skills are copied to .hybrid/
	await ensureSkills(projectDir, rootDir)

	console.log("\n🚀 Starting agent from .hybrid/...\n")

	const serverPath = resolve(hybridDir, "dist/server/simple.cjs")
	const xmtpPath = resolve(hybridDir, "dist/xmtp.cjs")

	// Run both processes
	const server = spawn("node", [serverPath], {
		cwd: hybridDir,
		stdio: "inherit",
		env: {
			...process.env,
			AGENT_PROJECT_ROOT: projectDir
		}
	})

	const xmtp = spawn("node", [xmtpPath], {
		cwd: hybridDir,
		stdio: "inherit",
		env: {
			...process.env,
			AGENT_PROJECT_ROOT: projectDir
		}
	})

	const exitHandler = (code: number | null) => {
		if (code !== 0 && code !== null) {
			process.exit(code)
		}
	}

	server.on("exit", exitHandler)
	xmtp.on("exit", exitHandler)

	// Handle Ctrl+C
	process.on("SIGINT", () => {
		server.kill("SIGINT")
		xmtp.kill("SIGINT")
		process.exit(0)
	})
}

async function deploy(platform = "fly") {
	const { spawn, execSync } = await import("node:child_process")
	const { resolve, dirname } = await import("node:path")
	const { fileURLToPath } = await import("node:url")
	const { existsSync, readFileSync, appendFileSync } = await import("node:fs")
	const prompts = (await import("prompts")).default
	const { privateKeyToAccount } = await import("viem/accounts")
	const { randomBytes } = await import("node:crypto")

	const __dirname = dirname(fileURLToPath(import.meta.url))
	const projectDir = process.cwd()
	const monorepoDir = resolve(__dirname, "../../..")

	// Get app name from fly.toml
	const hybridDir = resolve(projectDir, ".hybrid")
	const flyTomlPath = resolve(hybridDir, "fly.toml")
	const projectFlyToml = resolve(projectDir, "fly.toml")
	let appName = "hybrid-agent"

	// Read app name from fly.toml
	if (existsSync(flyTomlPath)) {
		const flyToml = readFileSync(flyTomlPath, "utf-8")
		const match = flyToml.match(/^app\s*=\s*["']([^"']+)["']/m)
		if (match) {
			appName = match[1]
		}
	}

	// Check if app exists and has AGENT_WALLET_KEY
	let appExists = false
	let existingWalletOnFly = false
	let walletKey: string | undefined

	try {
		execSync(`fly status --app ${appName}`, { stdio: "pipe" })
		appExists = true
		if (process.env.DEBUG) console.log(`   Found Fly.io app: ${appName}`)

		// Check for existing wallet on Fly.io
		const secretsJson = execSync(`fly secrets list --app ${appName} --json`, {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"]
		})
		const secretsList = JSON.parse(secretsJson)
		existingWalletOnFly = secretsList.some(
			(s: any) => s.name === "AGENT_WALLET_KEY"
		)
		if (existingWalletOnFly && process.env.DEBUG) {
			console.log("   AGENT_WALLET_KEY already set on Fly.io")
		}
	} catch (e) {
		if (process.env.DEBUG)
			console.log(`   Fly.io app not found or error: ${appName}`)
		appExists = false
	}

	// Generate wallet if not on Fly.io
	if (existingWalletOnFly) {
		console.log("\n🔐 AGENT_WALLET_KEY exists on Fly.io (using existing)")
	} else {
		console.log("\n🔐 No AGENT_WALLET_KEY found on Fly.io.")

		const walletChoice = await prompts({
			type: "select",
			name: "action",
			message: "How would you like to set up your agent wallet?",
			choices: [
				{ title: "Generate new wallet", value: "generate" },
				{ title: "Paste existing key", value: "paste" }
			],
			initial: 0
		})

		if (!walletChoice.action) {
			console.log("\n  Cancelled.\n")
			process.exit(0)
		}

		if (walletChoice.action === "paste") {
			const pasteResult = await prompts({
				type: "password",
				name: "key",
				message: "Paste your private key (0x...)",
				validate: (v: string) =>
					v.startsWith("0x") && v.length === 66
						? true
						: "Key must be 0x followed by 64 hex characters"
			})

			if (!pasteResult.key) {
				console.log("\n  Cancelled.\n")
				process.exit(0)
			}

			walletKey = pasteResult.key
		} else {
			const vanityChoice = await prompts({
				type: "text",
				name: "prefix",
				message: "Vanity prefix (1-4 hex chars, or leave empty)",
				initial: "",
				validate: (v: string) => {
					if (!v) return true
					if (v.length > 4) return "Max 4 characters"
					if (!/^[0-9a-fA-F]+$/.test(v)) return "Hex chars only (0-9, a-f)"
					return true
				}
			})

			const prefix = vanityChoice.prefix?.toLowerCase() || ""

			console.log("\n🔑 Generating wallet...")
			if (prefix) {
				console.log(`   Looking for address starting with 0x${prefix}...`)
			}

			walletKey = await generateVanityWallet(
				prefix,
				privateKeyToAccount,
				randomBytes
			)
		}

		const account = privateKeyToAccount(walletKey as `0x${string}`)
		console.log(`\n✅ Wallet generated`)
		console.log(`   Wallet address: ${account.address}\n`)

		// Register wallet on XMTP network
		console.log("🔐 Registering wallet on XMTP network...\n")
		try {
			execSync("npx pnpm --filter @hybrd/xmtp register", {
				cwd: monorepoDir,
				stdio: "inherit",
				env: {
					...process.env,
					AGENT_WALLET_KEY: walletKey
				}
			})
			console.log("\n✅ Wallet registered on XMTP\n")
		} catch {
			console.log(
				"\n⚠️  XMTP registration failed. Run 'hybrid register' manually.\n"
			)
		}
	}
	// Build first
	await build(platform)

	if (platform === "fly" || !platform) {
		console.log("\n🚀 Deploying to Fly.io...")

		// Always copy the latest fly.toml from project root to .hybrid/
		if (existsSync(projectFlyToml)) {
			const { cpSync } = await import("node:fs")
			cpSync(projectFlyToml, flyTomlPath)
		}

		if (!appExists) {
			console.log(`📦 Creating Fly.io app: ${appName}`)
			try {
				execSync(`fly apps create ${appName}`, {
					cwd: hybridDir,
					stdio: "inherit"
				})
			} catch {
				console.log(`   App ${appName} may already exist, continuing...`)
			}
		}

		// Check for volume requirement
		const flyToml = existsSync(flyTomlPath)
			? readFileSync(flyTomlPath, "utf-8")
			: ""
		const volumeMatch = flyToml.match(
			/\[mounts\][\s\S]*?source\s*=\s*["']([^"']+)["']/
		)
		if (volumeMatch) {
			const volumeName = volumeMatch[1]
			const regionMatch = flyToml.match(/primary_region\s*=\s*["']([^"']+)["']/)
			const region = regionMatch ? regionMatch[1] : "iad"

			let volumeExists = false
			try {
				const volumesJson = execSync(
					`fly volumes list --app ${appName} --json`,
					{ encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
				)
				const volumes = JSON.parse(volumesJson)
				volumeExists = volumes.some((v: any) => v.name === volumeName)
			} catch {
				// No volumes yet
			}

			if (!volumeExists) {
				console.log(`💾 Creating volume: ${volumeName} (${region})`)
				try {
					execSync(
						`fly volumes create ${volumeName} --size 10 --region ${region} --app ${appName} --yes`,
						{ cwd: hybridDir, stdio: "inherit" }
					)
				} catch {
					console.log(`   Volume may already exist, continuing...`)
				}
			}
		}

		// Deploy
		await new Promise<void>((resolve, reject) => {
			const deploy = spawn(
				"fly",
				["deploy", "--config", "fly.toml", "--dockerfile", "Dockerfile"],
				{ cwd: hybridDir, stdio: "inherit" }
			)
			deploy.on("error", (err) => {
				reject(new Error(`Failed to run fly CLI: ${err.message}`))
			})
			deploy.on("close", (code) => {
				if (code === 0) resolve()
				else reject(new Error(`Deploy failed with code ${code}`))
			})
		})

		// Set AGENT_WALLET_KEY on Fly.io if generated
		if (walletKey) {
			console.log("\n🔐 Setting wallet on Fly.io...")
			try {
				execSync(
					`fly secrets set AGENT_WALLET_KEY=${walletKey} --app ${appName}`,
					{
						cwd: hybridDir,
						stdio: "inherit"
					}
				)
				console.log("✅ Wallet key set")

				// Restart to pick up new secrets
				console.log("🔄 Restarting app to apply secrets...")
				execSync(`fly apps restart ${appName}`, {
					cwd: hybridDir,
					stdio: "inherit"
				})
			} catch {
				console.log(
					"⚠️  Could not set wallet key. Run manually: fly secrets set AGENT_WALLET_KEY=xxx --app",
					appName
				)
			}
		} else {
			console.log("\n✅ Wallet already configured on Fly.io")
		}

		// Check for required API keys
		const requiredSecrets = ["OPENROUTER_API_KEY", "ANTHROPIC_API_KEY"]
		const missingSecrets: string[] = []
		try {
			const secretsJson = execSync(`fly secrets list --app ${appName} --json`, {
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"]
			})
			const secretsList = JSON.parse(secretsJson)
			const existingSecrets = new Set(secretsList.map((s: any) => s.name))
			for (const secret of requiredSecrets) {
				if (!existingSecrets.has(secret)) {
					missingSecrets.push(secret)
				}
			}
		} catch {
			// Can't check secrets, skip warning
		}

		if (missingSecrets.length > 0) {
			console.log("\n⚠️  Missing required secrets:")
			for (const secret of missingSecrets) {
				console.log(`   fly secrets set ${secret}=xxx --app ${appName}`)
			}
		}

		// Get wallet address for summary
		let walletAddress = "unknown"
		if (walletKey) {
			try {
				const account = privateKeyToAccount(walletKey as `0x${string}`)
				walletAddress = account.address
			} catch {
				// Key parsing failed
			}
		}

		console.log("\n")
		console.log(
			"═══════════════════════════════════════════════════════════════"
		)
		console.log("  🎉 Deploy is live!")
		console.log(
			"═══════════════════════════════════════════════════════════════"
		)
		console.log("")
		console.log(`  App:        ${appName}`)
		console.log(`  Dashboard:  https://fly.io/apps/${appName}`)
		console.log("")
		console.log("  💬 Message your agent:")
		console.log(`     ${walletAddress}`)
		console.log("")
		console.log("     1. Go to https://xmtp.chat")
		console.log("     2. Connect your wallet")
		console.log(`     3. Send a message to ${walletAddress}`)
		console.log("")
		console.log(
			"═══════════════════════════════════════════════════════════════"
		)
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
				cwd: monorepoDir,
				stdio: "inherit"
			})
		} catch {
			console.error("Build failed")
			process.exit(1)
		}

		console.log("Deploying to Cloudflare...")

		try {
			execSync("npx wrangler deploy", {
				cwd: resolve(monorepoDir, "packages/gateway"),
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

async function generateVanityWallet(
	prefix: string,
	privateKeyToAccount: (key: `0x${string}`) => { address: string },
	randomBytes: (size: number) => Buffer
): Promise<string> {
	const targetPrefix = prefix.toLowerCase()
	let attempts = 0
	const maxAttempts = targetPrefix ? 1000000 : 1
	let dots = 0

	while (attempts < maxAttempts) {
		attempts++
		const keyBytes = randomBytes(32)
		const privateKey = `0x${keyBytes.toString("hex")}` as `0x${string}`

		if (!targetPrefix) {
			return privateKey
		}

		const account = privateKeyToAccount(privateKey)
		const address = account.address.toLowerCase()

		if (address.startsWith(`0x${targetPrefix}`)) {
			console.log(`   Found in ${attempts} attempts!`)
			return privateKey
		}

		if (attempts % 1000 === 0) {
			dots = (dots + 1) % 4
			process.stdout.write(
				`\r   Searching${".".repeat(dots)}${" ".repeat(3 - dots)} ${attempts} attempts\r`
			)
		}
	}

	throw new Error(
		`Could not find wallet with prefix ${targetPrefix} after ${maxAttempts} attempts`
	)
}

async function keygen(prefix?: string) {
	if (prefix === "-h" || prefix === "--help") {
		console.log("\nUsage: hybrid keygen [prefix]")
		console.log("")
		console.log("Generate a new wallet key for your agent.")
		console.log("")
		console.log("Arguments:")
		console.log(
			"  prefix    Optional hex prefix for vanity address (max 6 chars)"
		)
		console.log("")
		console.log("Examples:")
		console.log("  hybrid keygen          # Generate random wallet")
		console.log("  hybrid keygen abc      # Generate vanity with 0xabc...")
		console.log("  hybrid keygen dead     # Generate vanity with 0xdead...")
		console.log("")
		process.exit(0)
	}

	const { randomBytes } = await import("node:crypto")
	const { privateKeyToAccount } = await import("viem/accounts")

	const targetPrefix = prefix?.toLowerCase() || ""

	if (targetPrefix && !/^[0-9a-f]+$/.test(targetPrefix)) {
		console.error("\n❌ Error: Prefix must be valid hexadecimal (0-9, a-f)")
		process.exit(1)
	}

	if (targetPrefix && targetPrefix.length > 6) {
		console.error("\n❌ Error: Prefix too long (max 6 characters)")
		process.exit(1)
	}

	console.log("\n🔑 Generating wallet...")
	if (targetPrefix) {
		console.log(`   Looking for address starting with 0x${targetPrefix}...`)
	}

	const walletKey = await generateVanityWallet(
		targetPrefix,
		privateKeyToAccount,
		randomBytes
	)

	const account = privateKeyToAccount(walletKey as `0x${string}`)

	console.log(`\n✅ Wallet generated!`)
	console.log(`   Address: ${account.address}`)
	console.log(`   Private key: ${walletKey}\n`)
	console.log("⚠️  Save this private key securely!")
	console.log(`   Add to .env: AGENT_WALLET_KEY=${walletKey}\n`)
}

async function init(name: string) {
	if (!name) {
		console.error("Error: Agent name required")
		console.error("Usage: hybrid init <name>")
		process.exit(1)
	}

	const { resolve, dirname } = await import("node:path")
	const { fileURLToPath } = await import("node:url")
	const { createInterface } = await import("node:readline")
	const { readFileSync, writeFileSync, cpSync, existsSync, mkdirSync } =
		await import("node:fs")

	const __dirname = dirname(fileURLToPath(import.meta.url))
	const templateDir = resolve(__dirname, "../templates/agent")
	const targetDir = resolve(process.cwd(), name)

	if (existsSync(targetDir)) {
		console.error(`Error: Directory '${name}' already exists`)
		process.exit(1)
	}

	console.log(`Creating agent: ${name}`)

	cpSync(templateDir, targetDir, { recursive: true })

	const pkgPath = resolve(targetDir, "package.json")
	const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
	pkg.name = name
	writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))

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
			JSON.stringify(
				{
					version: 1,
					allowFrom: [normalized]
				},
				null,
				2
			)
		)
		console.log(`\n✅ Added owner: ${normalized}`)
	}

	console.log(`\n✅ Created agent at: ${name}/`)
	console.log("\nNext steps:")
	console.log(`  cd ${name}`)
	console.log("  cp .env.example .env  # Add your keys")
	console.log("  hybrid dev             # Start development")
}

async function register() {
	const { execSync } = await import("node:child_process")
	const { resolve, dirname, join } = await import("node:path")
	const { fileURLToPath } = await import("node:url")
	const { existsSync, mkdirSync, writeFileSync, readFileSync } = await import(
		"node:fs"
	)
	const { privateKeyToAccount } = await import("viem/accounts")

	const __dirname = dirname(fileURLToPath(import.meta.url))
	const rootDir = resolve(__dirname, "../../..")
	const projectDir = process.cwd()

	// Get wallet key from env
	const walletKey = process.env.AGENT_WALLET_KEY || process.env.WALLET_KEY

	if (!walletKey) {
		console.log("\n❌ Registration failed. Make sure AGENT_WALLET_KEY is set")
		process.exit(1)
	}

	// Derive wallet address
	const key = walletKey.startsWith("0x")
		? (walletKey as `0x${string}`)
		: (`0x${walletKey}` as `0x${string}`)
	const account = privateKeyToAccount(key)
	const walletAddress = account.address.toLowerCase()

	console.log(`\n📍 Wallet Address: ${walletAddress}`)

	// Create ACL file with owner
	const hybridDir = join(projectDir, ".hybrid")
	const credentialsDir = join(hybridDir, "credentials")
	const aclPath = join(credentialsDir, "xmtp-allowFrom.json")

	if (!existsSync(credentialsDir)) {
		mkdirSync(credentialsDir, { recursive: true })
	}

	// Read existing ACL or create new one
	let acl: { version: number; allowFrom: string[] } = {
		version: 1,
		allowFrom: []
	}
	if (existsSync(aclPath)) {
		try {
			acl = JSON.parse(readFileSync(aclPath, "utf-8"))
		} catch {
			// Use defaults
		}
	}

	// Add owner if not already present
	if (!acl.allowFrom.includes(walletAddress)) {
		acl.allowFrom.push(walletAddress)
		writeFileSync(aclPath, JSON.stringify(acl, null, "\t"))
		console.log(`\n✅ Added owner to ACL: ${walletAddress}`)
	} else {
		console.log(`\n✅ Owner already in ACL: ${walletAddress}`)
	}

	console.log("\n🔐 Registering wallet on XMTP network...\n")

	try {
		execSync("npx pnpm --filter @hybrd/xmtp register", {
			cwd: rootDir,
			stdio: "inherit",
			env: process.env
		})
	} catch {
		console.log("\n❌ Registration failed. Make sure AGENT_WALLET_KEY is set")
		process.exit(1)
	}
}

async function ownerAdd(address?: string) {
	const { join } = await import("node:path")
	const { existsSync, mkdirSync, writeFileSync, readFileSync } = await import(
		"node:fs"
	)

	if (!address) {
		console.error("Error: Address required")
		console.error("Usage: hybrid owner add <address>")
		process.exit(1)
	}

	const projectDir = process.cwd()
	const hybridDir = join(projectDir, ".hybrid")
	const credentialsDir = join(hybridDir, "credentials")
	const aclPath = join(credentialsDir, "xmtp-allowFrom.json")

	// Normalize address
	const normalizedAddress = address.toLowerCase().trim()

	if (!existsSync(credentialsDir)) {
		mkdirSync(credentialsDir, { recursive: true })
	}

	// Read existing ACL or create new one
	let acl: { version: number; allowFrom: string[] } = {
		version: 1,
		allowFrom: []
	}
	if (existsSync(aclPath)) {
		try {
			acl = JSON.parse(readFileSync(aclPath, "utf-8"))
		} catch {
			// Use defaults
		}
	}

	// Add owner if not already present
	if (!acl.allowFrom.includes(normalizedAddress)) {
		acl.allowFrom.push(normalizedAddress)
		writeFileSync(aclPath, JSON.stringify(acl, null, "\t"))
		console.log(`\n✅ Added owner: ${normalizedAddress}`)
	} else {
		console.log(`\n⚠️  Already an owner: ${normalizedAddress}`)
	}

	console.log(`\n📋 Owners (${acl.allowFrom.length}):`)
	for (const owner of acl.allowFrom) {
		console.log(`  - ${owner}`)
	}
}

async function ownerRemove(address?: string) {
	const { join } = await import("node:path")
	const { existsSync, writeFileSync, readFileSync } = await import("node:fs")

	if (!address) {
		console.error("Error: Address required")
		console.error("Usage: hybrid owner remove <address>")
		process.exit(1)
	}

	const projectDir = process.cwd()
	const aclPath = join(
		projectDir,
		".hybrid",
		"credentials",
		"xmtp-allowFrom.json"
	)

	if (!existsSync(aclPath)) {
		console.error("Error: No ACL file found. Run 'hybrid register' first.")
		process.exit(1)
	}

	// Read existing ACL
	let acl: { version: number; allowFrom: string[] }
	try {
		acl = JSON.parse(readFileSync(aclPath, "utf-8"))
	} catch {
		console.error("Error: Failed to read ACL file")
		process.exit(1)
	}

	const normalizedAddress = address.toLowerCase().trim()
	const index = acl.allowFrom.indexOf(normalizedAddress)

	if (index === -1) {
		console.log(`\n⚠️  Not an owner: ${normalizedAddress}`)
		process.exit(1)
	}

	acl.allowFrom.splice(index, 1)
	writeFileSync(aclPath, JSON.stringify(acl, null, "\t"))
	console.log(`\n✅ Removed owner: ${normalizedAddress}`)

	if (acl.allowFrom.length > 0) {
		console.log(`\n📋 Remaining owners (${acl.allowFrom.length}):`)
		for (const owner of acl.allowFrom) {
			console.log(`  - ${owner}`)
		}
	} else {
		console.log(`\n⚠️  No owners remaining. Agent will be open to all users.`)
	}
}

async function ownerList() {
	const { join } = await import("node:path")
	const { existsSync, readFileSync } = await import("node:fs")

	const projectDir = process.cwd()
	const aclPath = join(
		projectDir,
		".hybrid",
		"credentials",
		"xmtp-allowFrom.json"
	)

	if (!existsSync(aclPath)) {
		console.log("\n⚠️  No ACL file found. Run 'hybrid register' first.")
		console.log("\n  No owners configured. Agent is open to all users.")
		return
	}

	// Read existing ACL
	let acl: { version: number; allowFrom: string[] }
	try {
		acl = JSON.parse(readFileSync(aclPath, "utf-8"))
	} catch {
		console.error("Error: Failed to read ACL file")
		process.exit(1)
	}

	if (acl.allowFrom.length === 0) {
		console.log("\n📋 No owners configured. Agent is open to all users.")
		return
	}

	console.log(`\n📋 Owners (${acl.allowFrom.length}):`)
	for (const owner of acl.allowFrom) {
		console.log(`  - ${owner}`)
	}
}

async function revoke(inboxId?: string) {
	const { execSync } = await import("node:child_process")
	const { resolve, dirname } = await import("node:path")
	const { fileURLToPath } = await import("node:url")

	const __dirname = dirname(fileURLToPath(import.meta.url))
	const rootDir = resolve(__dirname, "../../..")

	if (!inboxId) {
		console.log("\nUsage: hybrid revoke <inboxId>")
		console.log("\nExample:")
		console.log(
			"  hybrid revoke 02bd1166fa37db6aeda14c49ff9c3cba1bdf89513fbb3ee27a2cfc47af153e6e"
		)
		console.log("\nOr use 'hybrid revoke-all' to auto-detect your inbox ID.")
		process.exit(1)
	}

	console.log("\n🔄 Revoking XMTP installations...\n")

	try {
		execSync(`npx pnpm --filter @hybrd/xmtp revoke ${inboxId}`, {
			cwd: rootDir,
			stdio: "inherit"
		})
	} catch {
		console.log("\n❌ Revoke failed. Make sure AGENT_WALLET_KEY is set")
		process.exit(1)
	}
}

async function revokeAll() {
	const { execSync } = await import("node:child_process")
	const { resolve, dirname } = await import("node:path")
	const { fileURLToPath } = await import("node:url")

	const __dirname = dirname(fileURLToPath(import.meta.url))
	const rootDir = resolve(__dirname, "../../..")

	console.log("\n🔄 Revoking all XMTP installations...\n")

	try {
		execSync("npx pnpm --filter @hybrd/xmtp revoke-all", {
			cwd: rootDir,
			stdio: "inherit"
		})
	} catch {
		console.log("\n❌ Revoke failed. Make sure AGENT_WALLET_KEY is set")
		process.exit(1)
	}
}

main().catch((error) => {
	console.error("CLI error:", error)
	process.exit(1)
})
