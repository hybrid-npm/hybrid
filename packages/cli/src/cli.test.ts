import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockExecSync = vi.fn()
vi.mock("node:child_process", () => ({
	execSync: mockExecSync
}))

vi.mock("node:url", () => ({
	fileURLToPath: (url: string) => url.replace("file://", "")
}))

const mockRlQuestion = vi.fn()
vi.mock("node:readline", () => ({
	createInterface: () => ({
		question: mockRlQuestion,
		close: vi.fn()
	})
}))

const mockPrompts = vi.fn()
vi.mock("prompts", () => ({
	default: mockPrompts
}))

vi.mock("node:crypto", () => ({
	randomBytes: vi.fn(() => Buffer.from("a".repeat(64), "hex"))
}))

describe("CLI", () => {
	describe("findSkillDir", () => {
		const tempDir = resolve(process.cwd(), ".test-temp")

		beforeEach(() => {
			vi.clearAllMocks()
			if (!existsSync(tempDir)) {
				mkdirSync(tempDir, { recursive: true })
			}
		})

		afterEach(() => {
			if (existsSync(tempDir)) {
				rmSync(tempDir, { recursive: true, force: true })
			}
		})

		it("should find SKILL.md in root directory", async () => {
			const skillDir = resolve(tempDir, "test-skill")
			mkdirSync(skillDir, { recursive: true })
			writeFileSync(resolve(skillDir, "SKILL.md"), "description: Test skill\n")

			const { execSync } = await import("node:child_process")

			expect(existsSync(resolve(skillDir, "SKILL.md"))).toBe(true)
		})

		it("should find SKILL.md in skills/skillName directory", async () => {
			const skillDir = resolve(tempDir, "skills", "another-skill")
			mkdirSync(skillDir, { recursive: true })
			writeFileSync(
				resolve(skillDir, "SKILL.md"),
				"description: Another skill\n"
			)

			expect(existsSync(resolve(skillDir, "SKILL.md"))).toBe(true)
		})

		it("should find SKILL.md in .agents/skills/skillName directory", async () => {
			const skillDir = resolve(tempDir, ".agents", "skills", "agent-skill")
			mkdirSync(skillDir, { recursive: true })
			writeFileSync(resolve(skillDir, "SKILL.md"), "description: Agent skill\n")

			expect(existsSync(resolve(skillDir, "SKILL.md"))).toBe(true)
		})

		it("should NOT search in .claude directory", () => {
			const claudeSkillDir = resolve(
				tempDir,
				".claude",
				"skills",
				"claude-skill"
			)
			mkdirSync(claudeSkillDir, { recursive: true })
			writeFileSync(
				resolve(claudeSkillDir, "SKILL.md"),
				"description: Claude skill\n"
			)

			const searchPaths = [
				tempDir,
				resolve(tempDir, "skills", "claude-skill"),
				resolve(tempDir, "claude-skill"),
				resolve(tempDir, ".agents", "skills", "claude-skill")
			]

			const found = searchPaths.some((p) => existsSync(resolve(p, "SKILL.md")))
			expect(found).toBe(false)
		})
	})

	describe("skills lockfile", () => {
		it("should have correct structure", () => {
			const lockfile = {
				version: 2,
				extensions: {
					"my-skill": {
						source: "github:owner/repo",
						installedAt: new Date().toISOString()
					}
				}
			}

			expect(lockfile.version).toBe(2)
			expect(lockfile.extensions).toHaveProperty("my-skill")
			expect(lockfile.extensions["my-skill"]).toHaveProperty("source")
			expect(lockfile.extensions["my-skill"]).toHaveProperty("installedAt")
		})
	})

	describe("skill override behavior", () => {
		const tempDir = resolve(process.cwd(), ".test-override")

		beforeEach(() => {
			if (!existsSync(tempDir)) {
				mkdirSync(tempDir, { recursive: true })
			}
		})

		afterEach(() => {
			if (existsSync(tempDir)) {
				rmSync(tempDir, { recursive: true, force: true })
			}
		})

		it("should allow user skills to override core skills", () => {
			const coreSkillDir = resolve(tempDir, "core", "wrangler")
			mkdirSync(coreSkillDir, { recursive: true })
			writeFileSync(
				resolve(coreSkillDir, "SKILL.md"),
				"description: Core wrangler\n"
			)

			const userSkillDir = resolve(tempDir, "ext", "wrangler")
			mkdirSync(userSkillDir, { recursive: true })
			writeFileSync(
				resolve(userSkillDir, "SKILL.md"),
				"description: Custom wrangler\n"
			)

			expect(existsSync(resolve(coreSkillDir, "SKILL.md"))).toBe(true)
			expect(existsSync(resolve(userSkillDir, "SKILL.md"))).toBe(true)
		})
	})

	describe("Dockerfile generation", () => {
		it("should generate correct fly Dockerfile", async () => {
			const flyDockerfile = `FROM node:20

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

ENV AGENT_PORT=8454
ENV NODE_ENV=production
EXPOSE 8454

CMD ["node", "server/index.cjs"]
`

			expect(flyDockerfile).toContain("COPY skills/ ./skills/")
			expect(flyDockerfile).toContain("COPY SOUL.md ./SOUL.md")
			expect(flyDockerfile).toContain("EXPOSE 8454")
		})

		it("should generate correct cloudflare Dockerfile", async () => {
			const cfDockerfile = `# Cloudflare Workers deployment
# Build the gateway and deploy with wrangler
FROM node:20
WORKDIR /app
COPY . ./
RUN npm install
`

			expect(cfDockerfile).toContain("FROM node:20")
			expect(cfDockerfile).toContain("npm install")
		})
	})

	describe("fly.toml generation", () => {
		it("should generate valid fly.toml", () => {
			const flyToml = `# Generated by hybrid build
app = "hybrid-agent"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"
  context = "."

[deployment]
  min_machines = 1
  max_machines = 1

[env]
  NODE_ENV = "production"

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

			expect(flyToml).toContain('app = "hybrid-agent"')
			expect(flyToml).toContain('primary_region = "iad"')
			expect(flyToml).toContain("internal_port = 8454")
		})
	})

	describe("build skill copying", () => {
		const tempDir = resolve(process.cwd(), ".test-build")

		beforeEach(() => {
			if (!existsSync(tempDir)) {
				mkdirSync(tempDir, { recursive: true })
			}
		})

		afterEach(() => {
			if (existsSync(tempDir)) {
				rmSync(tempDir, { recursive: true, force: true })
			}
		})

		it("should copy core skills to .hybrid/skills/core", () => {
			const coreDir = resolve(tempDir, "core")
			const hybridDir = resolve(tempDir, ".hybrid", "skills", "core")
			mkdirSync(resolve(coreDir, "wrangler"), { recursive: true })
			mkdirSync(hybridDir, { recursive: true })

			writeFileSync(
				resolve(coreDir, "wrangler", "SKILL.md"),
				"description: Core skill\n"
			)

			const { cpSync } = require("node:fs")
			cpSync(resolve(coreDir, "wrangler"), resolve(hybridDir, "wrangler"), {
				recursive: true
			})

			expect(existsSync(resolve(hybridDir, "wrangler", "SKILL.md"))).toBe(true)
		})

		it("should copy user skills to .hybrid/skills/ext", () => {
			const userDir = resolve(tempDir, "skills")
			const hybridDir = resolve(tempDir, ".hybrid", "skills", "ext")
			mkdirSync(resolve(userDir, "my-skill"), { recursive: true })
			mkdirSync(hybridDir, { recursive: true })

			writeFileSync(
				resolve(userDir, "my-skill", "SKILL.md"),
				"description: User skill\n"
			)

			const { cpSync } = require("node:fs")
			cpSync(resolve(userDir, "my-skill"), resolve(hybridDir, "my-skill"), {
				recursive: true
			})

			expect(existsSync(resolve(hybridDir, "my-skill", "SKILL.md"))).toBe(true)
		})

		it("should generate correct skills_lock.json", () => {
			const lockfile = {
				core: ["wrangler", "web-design"],
				ext: ["custom-skill"]
			}

			expect(lockfile.core).toContain("wrangler")
			expect(lockfile.ext).toContain("custom-skill")
			expect(lockfile.core).not.toContain("custom-skill")
		})
	})

	describe("ensureSkills function", () => {
		const tempDir = resolve(process.cwd(), `.test-ensure-${Date.now()}`)

		beforeEach(() => {
			if (existsSync(tempDir)) {
				rmSync(tempDir, { recursive: true, force: true })
			}
			mkdirSync(tempDir, { recursive: true })
		})

		afterEach(() => {
			if (existsSync(tempDir)) {
				rmSync(tempDir, { recursive: true, force: true })
			}
		})

		it("should not overwrite existing skills in .hybrid", () => {
			const hybridCore = resolve(
				tempDir,
				".hybrid",
				"skills",
				"core",
				"existing-skill"
			)
			mkdirSync(hybridCore, { recursive: true })
			writeFileSync(
				resolve(hybridCore, "SKILL.md"),
				"description: Existing skill\n"
			)

			expect(existsSync(resolve(hybridCore, "SKILL.md"))).toBe(true)
		})

		it("should create skills directories if they don't exist", () => {
			const hybridSkillsCore = resolve(tempDir, ".hybrid", "skills", "core")
			const hybridSkillsExt = resolve(tempDir, ".hybrid", "skills", "ext")

			expect(existsSync(hybridSkillsCore)).toBe(false)
			expect(existsSync(hybridSkillsExt)).toBe(false)

			mkdirSync(hybridSkillsCore, { recursive: true })
			mkdirSync(hybridSkillsExt, { recursive: true })

			expect(existsSync(hybridSkillsCore)).toBe(true)
			expect(existsSync(hybridSkillsExt)).toBe(true)
		})
	})

	describe("skill installation sources", () => {
		it("should parse github shorthand correctly", () => {
			const source = "owner/repo"
			const parts = source.split("/")

			expect(parts.length).toBe(2)
			expect(parts[0]).toBe("owner")
			expect(parts[1]).toBe("repo")
		})

		it("should parse github with skill path correctly", () => {
			const source = "owner/repo/skill-name"
			const parts = source.split("/")

			expect(parts.length).toBe(3)
			expect(parts[0]).toBe("owner")
			expect(parts[1]).toBe("repo")
			expect(parts[2]).toBe("skill-name")
		})

		it("should parse github explicit correctly", () => {
			const source = "github:owner/repo"
			expect(source.startsWith("github:")).toBe(true)

			const parts = source.slice(7).split("/")
			expect(parts.length).toBe(2)
			expect(parts[0]).toBe("owner")
			expect(parts[1]).toBe("repo")
		})

		it("should parse npm scoped package correctly", () => {
			const source = "@scope/package"
			expect(source.startsWith("@")).toBe(true)

			const skillName = source.split("/").pop()
			expect(skillName).toBe("package")
		})

		it("should parse local path correctly", () => {
			const source = "./local-path"
			expect(source.startsWith("./") || source.startsWith("../")).toBe(true)
		})
	})

	describe("skill search paths", () => {
		it("should search in correct order for skill directory", () => {
			const baseDir = "/project"
			const skillName = "my-skill"

			const expectedPaths = [
				baseDir,
				resolve(baseDir, "skills", skillName),
				resolve(baseDir, skillName),
				resolve(baseDir, ".agents", "skills", skillName)
			]

			const claudePath = resolve(baseDir, ".claude", "skills", skillName)
			expect(expectedPaths).not.toContain(claudePath)
		})
	})

	describe("hybrid init", () => {
		const writtenFiles: Map<string, string> = new Map()
		const copiedDirs: Array<{ src: string; dest: string }> = []
		const createdDirs: string[] = []

		beforeEach(() => {
			vi.clearAllMocks()
			writtenFiles.clear()
			copiedDirs.length = 0
			createdDirs.length = 0

			mockRlQuestion.mockImplementation(
				(_prompt: string, callback: (answer: string) => void) => {
					callback("0xABC12345678901234567890123456789012345678")
				}
			)

			// Default: OpenRouter selected
			mockPrompts.mockImplementation(async (config: { name: string }) => {
				if (config.name === "provider") {
					return { provider: "openrouter" }
				}
				if (config.name === "key") {
					return { key: "sk-or-test123" }
				}
				return {}
			})

			vi.doMock("node:fs", () => ({
				existsSync: vi.fn((path: string) => {
					if (path.includes("my-agent") && !path.includes(".env.example"))
						return false
					if (path.includes("existing-agent")) return true
					if (path.includes("skills")) return true
					if (path.includes(".env.example")) return true
					return true
				}),
				cpSync: vi.fn((src: string, dest: string) => {
					copiedDirs.push({ src, dest })
				}),
				mkdirSync: vi.fn((path: string) => {
					createdDirs.push(path)
				}),
				writeFileSync: vi.fn((path: string, content: string) => {
					writtenFiles.set(path, content)
				}),
				readFileSync: vi.fn((path: string) => {
					if (path.includes("package.json")) {
						return JSON.stringify({ name: "{{name}}", private: true })
					}
					if (path.includes(".env") && !path.includes(".example")) {
						return `# Anthropic API (or use OpenRouter below)
ANTHROPIC_API_KEY=your_api_key_here

# OpenRouter proxy (optional)
# ANTHROPIC_BASE_URL=https://openrouter.ai/api
# ANTHROPIC_AUTH_TOKEN=your_openrouter_key
`
					}
					return ""
				}),
				readdirSync: vi.fn(() => [
					{ name: "memory", isDirectory: () => true },
					{ name: "skills-manager", isDirectory: () => true }
				])
			}))
		})

		afterEach(() => {
			vi.restoreAllMocks()
			vi.doUnmock("node:fs")
		})

		it("should exit with error when no name provided", async () => {
			vi.spyOn(process, "exit").mockImplementation(((code: number) => {
				throw new Error(`process.exit(${code})`)
			}) as never)

			const mod = await import("./cli")
			await expect(mod.init()).rejects.toThrow("process.exit(1)")
		})

		it("should exit with error when directory already exists", async () => {
			vi.spyOn(process, "exit").mockImplementation(((code: number) => {
				throw new Error(`process.exit(${code})`)
			}) as never)

			const mod = await import("./cli")
			await expect(mod.init("existing-agent")).rejects.toThrow(
				"process.exit(1)"
			)
		})

		it("should copy template directory to target", async () => {
			const mod = await import("./cli")
			await mod.init("my-agent")

			expect(copiedDirs.some((c) => c.dest.includes("my-agent"))).toBe(true)
		})

		it("should update package.json with agent name", async () => {
			const mod = await import("./cli")
			await mod.init("my-agent")

			const pkgWrite = Array.from(writtenFiles.entries()).find(
				([p]) => p.includes("my-agent") && p.includes("package.json")
			)
			expect(pkgWrite).toBeDefined()
			if (pkgWrite) {
				const pkg = JSON.parse(pkgWrite[1])
				expect(pkg.name).toBe("my-agent")
			}
		})

		it("should copy core skills to target skills directory", async () => {
			const mod = await import("./cli")
			await mod.init("my-agent")

			const skillCopies = copiedDirs.filter(
				(c) => c.dest.includes("my-agent") && c.dest.includes("skills")
			)
			expect(skillCopies.length).toBeGreaterThanOrEqual(2)
		})

		it("should create skills-lock.json with core skills", async () => {
			const mod = await import("./cli")
			await mod.init("my-agent")

			const lockWrite = Array.from(writtenFiles.entries()).find(
				([p]) => p.includes("my-agent") && p.includes("skills-lock.json")
			)
			expect(lockWrite).toBeDefined()
			if (lockWrite) {
				const lockfile = JSON.parse(lockWrite[1])
				expect(lockfile).toHaveProperty("memory")
				expect(lockfile).toHaveProperty("skills-manager")
				expect(lockfile.memory.source).toBe("core")
				expect(lockfile.memory).toHaveProperty("installedAt")
			}
		})

		it("should create credentials/allowFrom.json with owner address", async () => {
			const mod = await import("./cli")
			await mod.init("my-agent")

			const aclWrite = Array.from(writtenFiles.entries()).find(
				([p]) => p.includes("my-agent") && p.includes("allowFrom.json")
			)
			expect(aclWrite).toBeDefined()
			if (aclWrite) {
				const acl = JSON.parse(aclWrite[1])
				expect(acl.version).toBe(1)
				expect(Array.isArray(acl.allowFrom)).toBe(true)
			}
		})

		it("should normalize owner address to lowercase", async () => {
			const mod = await import("./cli")
			await mod.init("my-agent")

			const aclWrite = Array.from(writtenFiles.entries()).find(
				([p]) => p.includes("my-agent") && p.includes("allowFrom.json")
			)
			if (aclWrite) {
				const acl = JSON.parse(aclWrite[1])
				if (acl.allowFrom.length > 0) {
					expect(acl.allowFrom[0]).toBe(acl.allowFrom[0].toLowerCase())
				}
			}
		})

		it("should create .env file with API keys", async () => {
			const mod = await import("./cli")
			await mod.init("my-agent")

			const envWrite = Array.from(writtenFiles.entries()).find(
				([p]) => p.includes("my-agent") && p.endsWith(".env")
			)
			expect(envWrite).toBeDefined()
			if (envWrite) {
				const content = envWrite[1]
				expect(content).toContain("ANTHROPIC_AUTH_TOKEN=sk-or-test123")
				expect(content).toContain(
					"ANTHROPIC_BASE_URL=https://openrouter.ai/api"
				)
			}
		})

		it("should set Anthropic key when provider 1 selected", async () => {
			mockPrompts.mockImplementation(async (config: { name: string }) => {
				if (config.name === "provider") {
					return { provider: "anthropic" }
				}
				if (config.name === "key") {
					return { key: "sk-ant-test456" }
				}
				return {}
			})

			const mod = await import("./cli")
			await mod.init("my-agent")

			const envWrite = Array.from(writtenFiles.entries()).find(
				([p]) => p.includes("my-agent") && p.endsWith(".env")
			)
			expect(envWrite).toBeDefined()
			if (envWrite) {
				const content = envWrite[1]
				expect(content).toContain("ANTHROPIC_API_KEY=sk-ant-test456")
				// OpenRouter should remain commented
				expect(content).toContain(
					"# ANTHROPIC_BASE_URL=https://openrouter.ai/api"
				)
			}
		})
	})
})
