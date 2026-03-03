import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import {
	addACLAllowFromEntry,
	approveACLPairingCode,
	getRole,
	listACLPendingRequests,
	listOwners,
	parseACL,
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
				join(credentialsDir, "xmtp-allowFrom.json"),
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
		it("returns guest for null ACL", () => {
			expect(getRole(null, "0x1234")).toBe("guest")
		})

		it("returns guest for unknown user", () => {
			expect(getRole({ version: 1, allowFrom: ["0xaaa"] }, "0xbbb")).toBe(
				"guest"
			)
		})

		it("returns owner for known user", () => {
			expect(getRole({ version: 1, allowFrom: ["0xaaa"] }, "0xaaa")).toBe(
				"owner"
			)
		})

		it("normalizes addresses (case-insensitive)", () => {
			expect(getRole({ version: 1, allowFrom: ["0xaaa"] }, "0xAAA")).toBe(
				"owner"
			)
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
