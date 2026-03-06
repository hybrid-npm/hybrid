import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { editFileInWorkspace } from "./edit"
import { applyPatchToWorkspace } from "./patch"
import { readFileFromWorkspace } from "./read"
import { writeFileToWorkspace } from "./write"

describe("file operations", () => {
	let tempWorkspace: string

	beforeEach(async () => {
		tempWorkspace = await mkdtemp(join(tmpdir(), "file-ops-test-"))
	})

	afterEach(async () => {
		await rm(tempWorkspace, { recursive: true, force: true })
	})

	describe("readFileFromWorkspace", () => {
		it("should read small files", async () => {
			await writeFile(join(tempWorkspace, "test.txt"), "Hello, World!")

			const result = await readFileFromWorkspace({
				workspacePath: tempWorkspace,
				path: "test.txt"
			})

			expect(result.content).toContain("Hello, World!")
			expect(result.lines).toBe(1)
			expect(result.truncated).toBeFalsy()
		})

		it("should read files with line numbers when paged", async () => {
			const content = "line1\nline2\nline3"
			await writeFile(join(tempWorkspace, "test.txt"), content)

			const result = await readFileFromWorkspace({
				workspacePath: tempWorkspace,
				path: "test.txt",
				offset: 1,
				limit: 2
			})

			expect(result.content).toContain("1: line1")
			expect(result.content).toContain("2: line2")
			expect(result.content).not.toContain("line3")
		})

		it("should show continuation hint for truncated files", async () => {
			// Create a file with many lines to trigger truncation
			const lines = Array(3000).fill("test line content")
			await writeFile(join(tempWorkspace, "big.txt"), lines.join("\n"))

			// Request with limit to trigger paging
			const result = await readFileFromWorkspace({
				workspacePath: tempWorkspace,
				path: "big.txt",
				limit: 100
			})

			expect(result.truncated).toBe(true)
			expect(result.continuationOffset).toBe(101)
			expect(result.content).toContain("more lines in file")
		})

		it("should throw for binary files", async () => {
			await writeFile(
				join(tempWorkspace, "image.png"),
				Buffer.from([0x89, 0x50, 0x4e, 0x47])
			)

			await expect(
				readFileFromWorkspace({
					workspacePath: tempWorkspace,
					path: "image.png"
				})
			).rejects.toThrow("binary file")
		})
	})

	describe("writeFileToWorkspace", () => {
		it("should create new files", async () => {
			const result = await writeFileToWorkspace({
				workspacePath: tempWorkspace,
				path: "new.txt",
				content: "Hello"
			})

			expect(result.success).toBe(true)
			expect(result.bytesWritten).toBe(5)

			const content = await readFile(join(tempWorkspace, "new.txt"), "utf-8")
			expect(content).toBe("Hello")
		})

		it("should overwrite existing files", async () => {
			await writeFile(join(tempWorkspace, "existing.txt"), "Old content")

			await writeFileToWorkspace({
				workspacePath: tempWorkspace,
				path: "existing.txt",
				content: "New content"
			})

			const content = await readFile(
				join(tempWorkspace, "existing.txt"),
				"utf-8"
			)
			expect(content).toBe("New content")
		})

		it("should create nested directories", async () => {
			await writeFileToWorkspace({
				workspacePath: tempWorkspace,
				path: "deep/nested/dir/file.txt",
				content: "Nested"
			})

			const content = await readFile(
				join(tempWorkspace, "deep/nested/dir/file.txt"),
				"utf-8"
			)
			expect(content).toBe("Nested")
		})
	})

	describe("editFileInWorkspace", () => {
		it("should apply single edit", async () => {
			await writeFile(join(tempWorkspace, "test.txt"), "Hello World")

			const result = await editFileInWorkspace({
				workspacePath: tempWorkspace,
				path: "test.txt",
				edits: [{ oldText: "World", newText: "Universe" }]
			})

			expect(result.success).toBe(true)
			expect(result.editsApplied).toBe(1)

			const content = await readFile(join(tempWorkspace, "test.txt"), "utf-8")
			expect(content).toBe("Hello Universe")
		})

		it("should apply multiple edits in sequence", async () => {
			await writeFile(join(tempWorkspace, "test.txt"), "foo bar foo")

			const result = await editFileInWorkspace({
				workspacePath: tempWorkspace,
				path: "test.txt",
				edits: [
					{ oldText: "foo", newText: "baz" },
					{ oldText: "bar", newText: "qux" }
				]
			})

			expect(result.success).toBe(true)
			expect(result.editsApplied).toBe(2)

			const content = await readFile(join(tempWorkspace, "test.txt"), "utf-8")
			// First edit changes "foo" to "baz", so file is "baz bar foo"
			// Second edit changes "bar" to "qux", so file is "baz qux foo"
			expect(content).toBe("baz qux foo")
		})

		it("should fail when oldText not found", async () => {
			await writeFile(join(tempWorkspace, "test.txt"), "Hello World")

			const result = await editFileInWorkspace({
				workspacePath: tempWorkspace,
				path: "test.txt",
				edits: [{ oldText: "NotFound", newText: "Replaced" }]
			})

			expect(result.success).toBe(false)
			expect(result.editsApplied).toBe(0)
			expect(result.editsFailed).toHaveLength(1)
			expect(result.editsFailed[0].reason).toBe("Text not found in file")
		})

		it("should fail for non-existent file", async () => {
			const result = await editFileInWorkspace({
				workspacePath: tempWorkspace,
				path: "nonexistent.txt",
				edits: [{ oldText: "foo", newText: "bar" }]
			})

			expect(result.success).toBe(false)
			expect(result.editsFailed[0].reason).toBe("File not found")
		})
	})

	describe("applyPatchToWorkspace", () => {
		it("should apply simple patch", async () => {
			await writeFile(join(tempWorkspace, "test.txt"), "Hello World")

			const patch = `--- a/test.txt\n+++ b/test.txt\n@@ -1 +1 @@\n-Hello World\n+Hello Universe\n`

			const result = await applyPatchToWorkspace({
				workspacePath: tempWorkspace,
				path: "test.txt",
				patch
			})

			expect(result.success).toBe(true)
			expect(result.hunksApplied).toBe(1)
		})

		it("should fail for non-existent file", async () => {
			const patch = `--- a/test.txt\n+++ b/test.txt\n@@ -1 +1 @@\n-old\n+new\n`

			const result = await applyPatchToWorkspace({
				workspacePath: tempWorkspace,
				path: "nonexistent.txt",
				patch
			})

			expect(result.success).toBe(false)
		})
	})
})
