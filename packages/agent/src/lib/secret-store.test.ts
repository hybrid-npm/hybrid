import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("secret-store", () => {
	let secretsDir: string

	beforeEach(async () => {
		vi.resetModules()
		secretsDir = join(tmpdir(), `secrets-test-${Date.now()}`, "secrets")
		mkdirSync(secretsDir, { recursive: true })
		process.env.DATA_ROOT = join(secretsDir, "..")
	})

	afterEach(() => {
		rmSync(secretsDir, { recursive: true, force: true })
		process.env.DATA_ROOT = undefined
		vi.resetModules()
	})

	async function importFresh() {
		const mod = await import("./secret-store")
		return mod
	}

	describe("loadSecrets", () => {
		it("loads secrets from files", async () => {
			writeFileSync(join(secretsDir, "slack-bot-token"), "xoxb-test-token")
			writeFileSync(join(secretsDir, "linear-api-key"), "lin_test_key")

			const { loadSecrets, getSecret } = await importFresh()
			loadSecrets()

			expect(getSecret("slack-bot-token")).toBe("xoxb-test-token")
			expect(getSecret("linear-api-key")).toBe("lin_test_key")
		})

		it("trims whitespace from secret values", async () => {
			writeFileSync(join(secretsDir, "slack-bot-token"), "  xoxb-test-token  \n")

			const { loadSecrets, getSecret } = await importFresh()
			loadSecrets()

			expect(getSecret("slack-bot-token")).toBe("xoxb-test-token")
		})

		it("skips missing secret files", async () => {
			const { loadSecrets, getSecret } = await importFresh()
			loadSecrets()

			expect(getSecret("slack-bot-token")).toBeUndefined()
		})

		it("returns undefined for unknown secret names", async () => {
			const { loadSecrets, getSecret } = await importFresh()
			loadSecrets()

			expect(getSecret("slack-bot-token")).toBeUndefined()
		})
	})

	describe("hasSecret", () => {
		it("returns true when secret exists", async () => {
			writeFileSync(join(secretsDir, "slack-bot-token"), "test")

			const { loadSecrets, hasSecret } = await importFresh()
			loadSecrets()

			expect(hasSecret("slack-bot-token")).toBe(true)
		})

		it("returns false when secret does not exist", async () => {
			const { hasSecret } = await importFresh()

			expect(hasSecret("slack-bot-token")).toBe(false)
		})
	})

	describe("clearSecrets", () => {
		it("clears all loaded secrets", async () => {
			writeFileSync(join(secretsDir, "slack-bot-token"), "test")

			const { loadSecrets, hasSecret, clearSecrets } = await importFresh()
			loadSecrets()

			expect(hasSecret("slack-bot-token")).toBe(true)

			clearSecrets()

			expect(hasSecret("slack-bot-token")).toBe(false)
		})
	})

	describe("secret names", () => {
		it("supports all channel secret names", async () => {
			const secretNames = [
				"slack-bot-token",
				"slack-signing-secret",
				"discord-bot-token",
				"discord-public-key",
				"discord-application-id",
				"linear-api-key",
				"linear-webhook-secret",
				"relay-secret"
			]

			for (const name of secretNames) {
				writeFileSync(join(secretsDir, name), `value-${name}`)
			}

			const { loadSecrets, getSecret } = await importFresh()
			loadSecrets()

			for (const name of secretNames) {
				expect(getSecret(name as any)).toBe(`value-${name}`)
			}
		})
	})
})
