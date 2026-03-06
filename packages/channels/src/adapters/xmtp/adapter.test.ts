import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const TEST_DIR = join("/tmp", "hybrid-xmtp-acl-test", Date.now().toString())

beforeEach(() => {
	if (existsSync(TEST_DIR)) {
		rmSync(TEST_DIR, { recursive: true })
	}
	mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
	if (existsSync(TEST_DIR)) {
		rmSync(TEST_DIR, { recursive: true })
	}
})

describe("ACL Filtering Logic", () => {
	describe("allowlist reading", () => {
		it("returns empty array when file doesn't exist", async () => {
			const { readACLAllowFrom } = await import("@hybrid/memory")
			const allowFrom = await readACLAllowFrom(TEST_DIR)
			expect(allowFrom).toEqual([])
		})

		it("returns allowlist from file", async () => {
			const credentialsDir = join(TEST_DIR, ".hybrid", "credentials")
			mkdirSync(credentialsDir, { recursive: true })

			writeFileSync(
				join(credentialsDir, "xmtp-allowFrom.json"),
				JSON.stringify({
					version: 1,
					allowFrom: ["0xallowed1", "0xallowed2"]
				})
			)

			const { readACLAllowFrom } = await import("@hybrid/memory")
			const allowFrom = await readACLAllowFrom(TEST_DIR)
			expect(allowFrom).toEqual(["0xallowed1", "0xallowed2"])
		})
	})

	describe("allowlist checking", () => {
		it("allows all when allowlist is empty", async () => {
			const credentialsDir = join(TEST_DIR, ".hybrid", "credentials")
			mkdirSync(credentialsDir, { recursive: true })

			writeFileSync(
				join(credentialsDir, "xmtp-allowFrom.json"),
				JSON.stringify({ version: 1, allowFrom: [] })
			)

			const { readACLAllowFrom } = await import("@hybrid/memory")
			const allowFrom = await readACLAllowFrom(TEST_DIR)

			// Empty allowlist = open to all
			expect(allowFrom.length).toBe(0)
		})

		it("allows addresses on the list", async () => {
			const credentialsDir = join(TEST_DIR, ".hybrid", "credentials")
			mkdirSync(credentialsDir, { recursive: true })

			writeFileSync(
				join(credentialsDir, "xmtp-allowFrom.json"),
				JSON.stringify({
					version: 1,
					allowFrom: ["0xabc", "0xdef"]
				})
			)

			const { readACLAllowFrom } = await import("@hybrid/memory")
			const allowFrom = await readACLAllowFrom(TEST_DIR)

			// Check membership
			expect(allowFrom.includes("0xabc")).toBe(true)
			expect(allowFrom.includes("0xdef")).toBe(true)
			expect(allowFrom.includes("0xxyz")).toBe(false)
		})

		it("normalizes addresses to lowercase", async () => {
			const credentialsDir = join(TEST_DIR, ".hybrid", "credentials")
			mkdirSync(credentialsDir, { recursive: true })

			writeFileSync(
				join(credentialsDir, "xmtp-allowFrom.json"),
				JSON.stringify({
					version: 1,
					allowFrom: ["0xABC123"]
				})
			)

			const { readACLAllowFrom } = await import("@hybrid/memory")
			const allowFrom = await readACLAllowFrom(TEST_DIR)

			// Should be normalized to lowercase
			expect(allowFrom).toContain("0xabc123")
			expect(allowFrom).not.toContain("0xABC123")
		})
	})
})

describe("XMTP Adapter Integration", () => {
	it("blocks message from non-allowed sender", async () => {
		const credentialsDir = join(TEST_DIR, ".hybrid", "credentials")
		mkdirSync(credentialsDir, { recursive: true })

		writeFileSync(
			join(credentialsDir, "xmtp-allowFrom.json"),
			JSON.stringify({
				version: 1,
				allowFrom: ["0xallowed"]
			})
		)

		const { readACLAllowFrom } = await import("@hybrid/memory")
		const allowFrom = await readACLAllowFrom(TEST_DIR)

		// Simulate the check the adapter would do
		const senderAddress = "0xblocked"
		const isAllowed =
			allowFrom.length === 0 || allowFrom.includes(senderAddress.toLowerCase())

		expect(isAllowed).toBe(false)
	})

	it("allows message from allowed sender", async () => {
		const credentialsDir = join(TEST_DIR, ".hybrid", "credentials")
		mkdirSync(credentialsDir, { recursive: true })

		writeFileSync(
			join(credentialsDir, "xmtp-allowFrom.json"),
			JSON.stringify({
				version: 1,
				allowFrom: ["0xallowed"]
			})
		)

		const { readACLAllowFrom } = await import("@hybrid/memory")
		const allowFrom = await readACLAllowFrom(TEST_DIR)

		// Simulate the check the adapter would do
		const senderAddress = "0xallowed"
		const isAllowed =
			allowFrom.length === 0 || allowFrom.includes(senderAddress.toLowerCase())

		expect(isAllowed).toBe(true)
	})

	it("allows all messages when no allowlist configured", async () => {
		const { readACLAllowFrom } = await import("@hybrid/memory")
		const allowFrom = await readACLAllowFrom(TEST_DIR)

		// No allowlist file = open
		expect(allowFrom.length).toBe(0)

		// Any sender should be allowed
		const senderAddress = "0xanyone"
		const isAllowed =
			allowFrom.length === 0 || allowFrom.includes(senderAddress.toLowerCase())

		expect(isAllowed).toBe(true)
	})
})
