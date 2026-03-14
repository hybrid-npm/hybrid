import { symlinkSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getUserWorkspacePath, validatePathInWorkspace } from "./workspace"

describe("workspace validation", () => {
	let tempDir: string
	let workspaceRoot: string

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "workspace-test-"))
		workspaceRoot = tempDir
	})

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true })
	})

	describe("validatePathInWorkspace", () => {
		it("should allow paths within workspace", async () => {
			const userId = "0xalice"
			const userWorkspace = join(workspaceRoot, "workspace", userId)
			await mkdir(userWorkspace, { recursive: true })

			const result = validatePathInWorkspace({
				workspaceRoot,
				userId,
				requestedPath: "file.txt"
			})

			expect(result.valid).toBe(true)
			expect(result.resolvedPath).toBe(join(userWorkspace, "file.txt"))
		})

		it("should allow nested paths within workspace", async () => {
			const userId = "0xalice"
			const userWorkspace = join(workspaceRoot, "workspace", userId)
			await mkdir(join(userWorkspace, "src", "lib"), { recursive: true })

			const result = validatePathInWorkspace({
				workspaceRoot,
				userId,
				requestedPath: "src/lib/utils.ts"
			})

			expect(result.valid).toBe(true)
			expect(result.resolvedPath).toBe(join(userWorkspace, "src/lib/utils.ts"))
		})

		it("should reject directory traversal attempts", () => {
			const result = validatePathInWorkspace({
				workspaceRoot,
				userId: "0xalice",
				requestedPath: "../other-user/secret.txt"
			})

			expect(result.valid).toBe(false)
			expect(result.error).toBe("Directory traversal not allowed")
		})

		it("should reject multiple directory traversal attempts", () => {
			const result = validatePathInWorkspace({
				workspaceRoot,
				userId: "0xalice",
				requestedPath: "foo/../../bar/../../../etc/passwd"
			})

			expect(result.valid).toBe(false)
			expect(result.error).toBe("Directory traversal not allowed")
		})

		it("should reject absolute paths", () => {
			const result = validatePathInWorkspace({
				workspaceRoot,
				userId: "0xalice",
				requestedPath: "/etc/passwd"
			})

			expect(result.valid).toBe(false)
			expect(result.error).toBe("Only relative paths allowed")
		})

		it("should resolve symlinks and prevent escapes", async () => {
			const userId = "0xalice"
			const userWorkspace = join(workspaceRoot, "workspace", userId)
			const outsideDir = join(workspaceRoot, "outside")

			await mkdir(userWorkspace, { recursive: true })
			await mkdir(outsideDir, { recursive: true })
			await writeFile(join(outsideDir, "secret.txt"), "secret")

			// Create a symlink inside workspace pointing outside
			symlinkSync(
				join(outsideDir, "secret.txt"),
				join(userWorkspace, "link.txt")
			)

			const result = validatePathInWorkspace({
				workspaceRoot,
				userId,
				requestedPath: "link.txt"
			})

			expect(result.valid).toBe(false)
			expect(result.error).toBe("Symlink escapes workspace")
		})
	})

	describe("getUserWorkspacePath", () => {
		it("should return correct path for user", () => {
			const userId = "0xalice"
			const path = getUserWorkspacePath(userId)
			expect(path).toBe(join(process.cwd(), "workspace", userId))
		})

		it("should sanitize user ID", () => {
			const userId = "0xalice!@#$%"
			const path = getUserWorkspacePath(userId)
			expect(path).toBe(join(process.cwd(), "workspace", "0xalice_____"))
		})
	})
})
