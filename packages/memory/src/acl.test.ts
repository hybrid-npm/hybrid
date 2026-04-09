import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
	addACLAllowFromEntry,
	approveACLPairingCode,
	getRole,
	listACLPendingRequests,
	listOwners,
	parseACL,
	readACLAllowFrom,
	rejectACLPairingCode,
	removeACLAllowFromEntry,
	upsertACLPendingRequest
} from "./acl.js"

const TEST_DIR = join("/tmp", "hybrid-acl-test", Date.now().toString())

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

describe("ACL JSON", () => {
	describe("parseACL", () => {
		it("returns null when no ACL file exists", () => {
			const acl = parseACL(TEST_DIR)
			expect(acl).toBeNull()
		})

		it("reads ACL from JSON file", async () => {
			const { writeFile } = await import("node:fs/promises")
			const { join } = await import("node:path")
			const credentialsDir = join(TEST_DIR, "credentials")
			mkdirSync(credentialsDir, { recursive: true })

			await writeFile(
				join(credentialsDir, "allowFrom.json"),
				JSON.stringify({
					version: 1,
					allowFrom: ["0x1234567890abcdef1234567890abcdef12345678"]
				})
			)

			const acl = parseACL(TEST_DIR)
			expect(acl).not.toBeNull()
			expect(acl?.allowFrom).toEqual([
				"0x1234567890abcdef1234567890abcdef12345678"
			])
		})
	})

	describe("getRole", () => {
		it("returns owner for null ACL (allows initial onboarding)", () => {
			expect(getRole(null, "0x1234")).toBe("owner")
		})

		it("returns guest for unknown user", () => {
			expect(getRole({ version: 1, allowFrom: ["0xaaa"] }, "0xbbb")).toBe(
				"guest"
			)
		})

		it("returns owner for known user", () => {
			expect(
				getRole(
					{
						version: 1,
						allowFrom: ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
					},
					"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
				)
			).toBe("owner")
		})

		it("normalizes addresses (case-insensitive)", () => {
			expect(
				getRole(
					{
						version: 1,
						allowFrom: ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
					},
					"0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
				)
			).toBe("owner")
		})
	})

	describe("listOwners", () => {
		it("returns empty array for null ACL", () => {
			expect(listOwners(null)).toEqual([])
		})

		it("returns owners from ACL", () => {
			expect(listOwners({ version: 1, allowFrom: ["0xa", "0xb"] })).toEqual([
				"0xa",
				"0xb"
			])
		})
	})

	describe("addACLAllowFromEntry", () => {
		it("creates ACL file if it doesn't exist", async () => {
			const result = await addACLAllowFromEntry(TEST_DIR, "0xnew")
			expect(result.changed).toBe(true)
			expect(result.allowFrom).toContain("0xnew")

			const acl = parseACL(TEST_DIR)
			expect(acl?.allowFrom).toContain("0xnew")
		})

		it("doesn't add duplicates", async () => {
			await addACLAllowFromEntry(TEST_DIR, "0xexisting")
			const result = await addACLAllowFromEntry(TEST_DIR, "0xexisting")
			expect(result.changed).toBe(false)
		})
	})

	describe("removeACLAllowFromEntry", () => {
		it("removes entry from ACL", async () => {
			await addACLAllowFromEntry(TEST_DIR, "0xremove")
			const result = await removeACLAllowFromEntry(TEST_DIR, "0xremove")
			expect(result.changed).toBe(true)

			const acl = parseACL(TEST_DIR)
			expect(acl?.allowFrom).not.toContain("0xremove")
		})

		it("returns false if entry doesn't exist", async () => {
			const result = await removeACLAllowFromEntry(TEST_DIR, "0xnotexist")
			expect(result.changed).toBe(false)
		})
	})
})

describe("Pairing", () => {
	describe("upsertACLPendingRequest", () => {
		it("creates a new pairing request", async () => {
			const result = await upsertACLPendingRequest(TEST_DIR, "0xrequester")
			expect(result.code).toHaveLength(8)
			expect(result.created).toBe(true)

			const requests = await listACLPendingRequests(TEST_DIR)
			expect(requests).toHaveLength(1)
			expect(requests[0].id).toBe("0xrequester")
			expect(requests[0].code).toBe(result.code)
		})

		it("updates existing request with same ID", async () => {
			const first = await upsertACLPendingRequest(TEST_DIR, "0xrequester")
			const second = await upsertACLPendingRequest(TEST_DIR, "0xrequester")

			expect(second.created).toBe(false)
			expect(second.code).toBe(first.code)
		})
	})

	describe("approveACLPairingCode", () => {
		it("approves a valid code and adds to allowFrom", async () => {
			const { code } = await upsertACLPendingRequest(TEST_DIR, "0xnewowner")
			const result = await approveACLPairingCode(TEST_DIR, code)

			expect(result).not.toBeNull()
			expect(result?.id).toBe("0xnewowner")

			const acl = parseACL(TEST_DIR)
			expect(acl?.allowFrom).toContain("0xnewowner")

			const requests = await listACLPendingRequests(TEST_DIR)
			expect(requests).toHaveLength(0)
		})

		it("returns null for invalid code", async () => {
			const result = await approveACLPairingCode(TEST_DIR, "INVALID")
			expect(result).toBeNull()
		})
	})

	describe("rejectACLPairingCode", () => {
		it("rejects a valid code without adding to allowFrom", async () => {
			const { code } = await upsertACLPendingRequest(TEST_DIR, "0xrejected")
			const result = await rejectACLPairingCode(TEST_DIR, code)

			expect(result).not.toBeNull()
			expect(result?.id).toBe("0xrejected")

			const acl = parseACL(TEST_DIR)
			expect(acl?.allowFrom ?? []).not.toContain("0xrejected")

			const requests = await listACLPendingRequests(TEST_DIR)
			expect(requests).toHaveLength(0)
		})
	})
})

describe("ACL Edge Cases", () => {
	it("handles multiple owners correctly", async () => {
		await addACLAllowFromEntry(TEST_DIR, "0xowner1")
		await addACLAllowFromEntry(TEST_DIR, "0xowner2")
		await addACLAllowFromEntry(TEST_DIR, "0xowner3")

		const acl = parseACL(TEST_DIR)
		expect(acl?.allowFrom).toHaveLength(3)
		expect(acl?.allowFrom).toContain("0xowner1")
		expect(acl?.allowFrom).toContain("0xowner2")
		expect(acl?.allowFrom).toContain("0xowner3")
	})

	it("handles removing non-existent owner gracefully", async () => {
		await addACLAllowFromEntry(TEST_DIR, "0xowner1")
		const result = await removeACLAllowFromEntry(TEST_DIR, "0xnotexist")

		expect(result.changed).toBe(false)
		expect(result.allowFrom).toHaveLength(1)
	})

	it("handles adding owner twice", async () => {
		await addACLAllowFromEntry(TEST_DIR, "0xowner1")
		const result = await addACLAllowFromEntry(TEST_DIR, "0xowner1")

		expect(result.changed).toBe(false)
		expect(result.allowFrom).toHaveLength(1)
	})

	it("handles concurrent pairing requests", async () => {
		const r1 = await upsertACLPendingRequest(TEST_DIR, "0xuser1")
		const r2 = await upsertACLPendingRequest(TEST_DIR, "0xuser2")
		const r3 = await upsertACLPendingRequest(TEST_DIR, "0xuser3")

		expect(r1.code).toHaveLength(8)
		expect(r2.code).toHaveLength(8)
		expect(r3.code).toHaveLength(8)

		// All codes should be different
		expect(new Set([r1.code, r2.code, r3.code]).size).toBe(3)

		const requests = await listACLPendingRequests(TEST_DIR)
		expect(requests).toHaveLength(3)
	})

	it("limits pending requests to 3", async () => {
		await upsertACLPendingRequest(TEST_DIR, "0xuser1")
		await upsertACLPendingRequest(TEST_DIR, "0xuser2")
		await upsertACLPendingRequest(TEST_DIR, "0xuser3")
		const r4 = await upsertACLPendingRequest(TEST_DIR, "0xuser4")

		// Fourth request should be rejected
		expect(r4.code).toBe("")
		expect(r4.created).toBe(false)

		const requests = await listACLPendingRequests(TEST_DIR)
		expect(requests).toHaveLength(3)
	})

	it("handles case-insensitive codes on approval", async () => {
		const { code } = await upsertACLPendingRequest(TEST_DIR, "0xuser1")

		// Try approving with lowercase
		const result = await approveACLPairingCode(TEST_DIR, code.toLowerCase())
		expect(result).not.toBeNull()
	})

	it("handles invalid JSON gracefully", async () => {
		const { writeFileSync } = await import("node:fs")
		const { join } = await import("node:path")
		const credentialsDir = join(TEST_DIR, ".hybrid", "credentials")
		mkdirSync(credentialsDir, { recursive: true })

		writeFileSync(join(credentialsDir, "allowFrom.json"), "not valid json")

		// Should not throw, return empty
		const result = await readACLAllowFrom(TEST_DIR)
		expect(result).toEqual([])
	})

	it("handles missing version field gracefully", async () => {
		const { writeFileSync } = await import("node:fs")
		const { join } = await import("node:path")
		const credentialsDir = join(TEST_DIR, ".hybrid", "credentials")
		mkdirSync(credentialsDir, { recursive: true })

		writeFileSync(
			join(credentialsDir, "allowFrom.json"),
			JSON.stringify({ allowFrom: ["0xowner1"] })
		)

		// Should handle missing version
		const acl = parseACL(TEST_DIR)
		expect(acl).toBeNull() // version is required
	})

	it("persists data across operations", async () => {
		// Add owners
		await addACLAllowFromEntry(TEST_DIR, "0xowner1")
		await addACLAllowFromEntry(TEST_DIR, "0xowner2")

		// Read back
		const allowFrom = await readACLAllowFrom(TEST_DIR)
		expect(allowFrom).toHaveLength(2)

		// Remove one
		await removeACLAllowFromEntry(TEST_DIR, "0xowner1")

		// Read back again
		const allowFrom2 = await readACLAllowFrom(TEST_DIR)
		expect(allowFrom2).toHaveLength(1)
		expect(allowFrom2).toContain("0xowner2")
	})
})
