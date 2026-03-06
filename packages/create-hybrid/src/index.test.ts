import { execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMP_DIR = join(__dirname, "temp-test-projects")
const PROJECT_NAME = "test-agent"
const PROJECT_DIR = join(TEMP_DIR, PROJECT_NAME)
const CLI_PATH = join(__dirname, "index.ts")

describe("create-hybrid CLI", () => {
	beforeEach(() => {
		if (existsSync(PROJECT_DIR)) {
			rmSync(PROJECT_DIR, { recursive: true, force: true })
		}
		if (!existsSync(TEMP_DIR)) {
			mkdirSync(TEMP_DIR, { recursive: true })
		}
	})

	afterEach(() => {
		if (existsSync(PROJECT_DIR)) {
			rmSync(PROJECT_DIR, { recursive: true, force: true })
		}
	})

	it("should create all 8 OpenCode template files", () => {
		execSync(
			`npx tsx "${CLI_PATH}" --name ${PROJECT_NAME} --env dev --agent-name "Test Agent"`,
			{ cwd: TEMP_DIR, timeout: 15000 }
		)

		const templates = [
			"AGENTS.md",
			"SOUL.md",
			"IDENTITY.md",
			"USER.md",
			"TOOLS.md",
			"BOOT.md",
			"BOOTSTRAP.md",
			"HEARTBEAT.md"
		]

		for (const template of templates) {
			const filePath = join(PROJECT_DIR, template)
			expect(existsSync(filePath), `Missing template: ${template}`).toBe(true)

			const content = readFileSync(filePath, "utf-8")
			expect(content.length, `Empty template: ${template}`).toBeGreaterThan(0)
		}
	})

	it("should create users directory for multi-tenant profiles", () => {
		execSync(
			`npx tsx "${CLI_PATH}" --name ${PROJECT_NAME} --env dev --agent-name "Test Agent"`,
			{ cwd: TEMP_DIR, timeout: 15000 }
		)

		const usersDir = join(PROJECT_DIR, "users")
		expect(existsSync(usersDir)).toBe(true)
	})

	it("should create ACL.md for owner access control", () => {
		execSync(
			`npx tsx "${CLI_PATH}" --name ${PROJECT_NAME} --env dev --agent-name "Test Agent"`,
			{ cwd: TEMP_DIR, timeout: 15000 }
		)

		const aclPath = join(PROJECT_DIR, "ACL.md")
		expect(existsSync(aclPath)).toBe(true)

		const content = readFileSync(aclPath, "utf-8")
		expect(content).toContain("## Owners")
		expect(content).toContain("YOUR_WALLET_ADDRESS_HERE")
	})

	it("should create package.json with correct name", () => {
		execSync(
			`npx tsx "${CLI_PATH}" --name ${PROJECT_NAME} --env dev --agent-name "Test Agent"`,
			{ cwd: TEMP_DIR, timeout: 15000 }
		)

		const pkgPath = join(PROJECT_DIR, "package.json")
		expect(existsSync(pkgPath)).toBe(true)

		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
		expect(pkg.name).toBe(PROJECT_NAME)
	})

	it("should create required project structure", () => {
		execSync(
			`npx tsx "${CLI_PATH}" --name ${PROJECT_NAME} --env dev --agent-name "Test Agent"`,
			{ cwd: TEMP_DIR, timeout: 15000 }
		)

		expect(existsSync(join(PROJECT_DIR, "src", "gateway"))).toBe(true)
		expect(existsSync(join(PROJECT_DIR, "src", "server"))).toBe(true)
		expect(existsSync(join(PROJECT_DIR, "src", "dev-gateway.ts"))).toBe(true)
	})

	it("should create .env.example with correct XMTP_ENV", () => {
		execSync(
			`npx tsx "${CLI_PATH}" --name ${PROJECT_NAME} --env dev --agent-name "Test Agent"`,
			{ cwd: TEMP_DIR, timeout: 15000 }
		)

		const envPath = join(PROJECT_DIR, ".env.example")
		expect(existsSync(envPath)).toBe(true)

		const content = readFileSync(envPath, "utf-8")
		expect(content).toContain("XMTP_ENV=dev")
	})

	it("should create Dockerfile with all templates", () => {
		execSync(
			`npx tsx "${CLI_PATH}" --name ${PROJECT_NAME} --env dev --agent-name "Test Agent"`,
			{ cwd: TEMP_DIR, timeout: 15000 }
		)

		const dockerfilePath = join(PROJECT_DIR, "Dockerfile")
		expect(existsSync(dockerfilePath)).toBe(true)

		const content = readFileSync(dockerfilePath, "utf-8")

		const templates = [
			"AGENTS.md",
			"SOUL.md",
			"IDENTITY.md",
			"USER.md",
			"TOOLS.md",
			"BOOT.md",
			"BOOTSTRAP.md",
			"HEARTBEAT.md"
		]

		templates.forEach((template) => {
			expect(content, `Dockerfile missing: ${template}`).toContain(template)
		})
	})

	it("should create other required files", () => {
		execSync(
			`npx tsx "${CLI_PATH}" --name ${PROJECT_NAME} --env dev --agent-name "Test Agent"`,
			{ cwd: TEMP_DIR, timeout: 15000 }
		)

		expect(existsSync(join(PROJECT_DIR, ".gitignore"))).toBe(true)
		expect(existsSync(join(PROJECT_DIR, "tsconfig.json"))).toBe(true)
		expect(existsSync(join(PROJECT_DIR, "wrangler.jsonc"))).toBe(true)
		expect(existsSync(join(PROJECT_DIR, "build.mjs"))).toBe(true)
		expect(existsSync(join(PROJECT_DIR, "start.sh"))).toBe(true)
	})

	it("should create server with multi-tenant USER.md loading", () => {
		execSync(
			`npx tsx "${CLI_PATH}" --name ${PROJECT_NAME} --env dev --agent-name "Test Agent"`,
			{ cwd: TEMP_DIR, timeout: 15000 }
		)

		const serverPath = join(PROJECT_DIR, "src", "server", "index.ts")
		expect(existsSync(serverPath)).toBe(true)

		const content = readFileSync(serverPath, "utf-8")
		expect(content).toContain("loadUserMarkdown")
		expect(content).toContain("userId")
	})

	it("should use production environment when specified", () => {
		execSync(
			`npx tsx "${CLI_PATH}" --name ${PROJECT_NAME} --env production --agent-name "Test Agent"`,
			{ cwd: TEMP_DIR, timeout: 15000 }
		)

		const envPath = join(PROJECT_DIR, ".env.example")
		const content = readFileSync(envPath, "utf-8")
		expect(content).toContain("XMTP_ENV=production")
	})
})
