import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { MemoryIndexManager, resolveMemoryConfig } from "./src/index.js"
import { listMemoryFiles } from "./src/internal.js"

const testDir = path.join(os.tmpdir(), "hybrid-memory-test")

function makeAgentId() {
	return "test-" + Date.now() + "-" + Math.random().toString(36).slice(2)
}

beforeEach(async () => {
	await fs.mkdir(testDir, { recursive: true })
	await fs.writeFile(
		path.join(testDir, "MEMORY.md"),
		"# Test Memory\n\nI love TypeScript and testing.",
		"utf-8"
	)
})

afterEach(async () => {
	await fs.rm(testDir, { recursive: true, force: true })
})

describe("memory", () => {
	it("resolves config", () => {
		const config = resolveMemoryConfig({ sources: ["memory"] }, "test")
		expect(config.sources).toContain("memory")
		expect(config.enabled).toBe(true)
	})

	it("creates manager", async () => {
		const id = makeAgentId()
		const config = resolveMemoryConfig(
			{ sources: ["memory"], fallback: "none" },
			id
		)
		const manager = await MemoryIndexManager.get({
			agentId: id,
			workspaceDir: testDir,
			config
		})
		expect(manager).not.toBeNull()
		await manager?.close()
	})

	it("syncs files", async () => {
		const id = makeAgentId()
		const config = resolveMemoryConfig(
			{ sources: ["memory"], fallback: "none" },
			id
		)
		const manager = await MemoryIndexManager.get({
			agentId: id,
			workspaceDir: testDir,
			config
		})
		await manager!.sync()
		const status = manager!.status()
		expect(status.files).toBe(1)
		await manager?.close()
	})

	it("searches with FTS", async () => {
		const id = makeAgentId()
		const config = resolveMemoryConfig(
			{
				sources: ["memory"],
				fallback: "none",
				query: {
					hybrid: { enabled: false, vectorWeight: 0.7, textWeight: 0.3 },
					maxResults: 10,
					minScore: 0
				}
			},
			id
		)
		const manager = await MemoryIndexManager.get({
			agentId: id,
			workspaceDir: testDir,
			config
		})
		await manager!.sync()
		const results = await manager!.search("TypeScript")
		expect(results.length).toBeGreaterThan(0)
		await manager?.close()
	})

	it("indexes .hybrid/memory directory", async () => {
		const hybridMemoryDir = path.join(testDir, ".hybrid", "memory")
		await fs.mkdir(hybridMemoryDir, { recursive: true })
		await fs.writeFile(
			path.join(hybridMemoryDir, "NOTES.md"),
			"# Notes\n\nThe weather today is sunny and warm.",
			"utf-8"
		)

		const files = await listMemoryFiles(testDir)
		const hybridFiles = files.filter((f) => f.includes(".hybrid"))
		expect(hybridFiles.length).toBeGreaterThan(0)
	})

	it("indexes user-specific memory in .hybrid/memory/users", async () => {
		const userId = "user-abc123"
		const userMemoryDir = path.join(
			testDir,
			".hybrid",
			"memory",
			"users",
			userId
		)
		await fs.mkdir(userMemoryDir, { recursive: true })
		await fs.writeFile(
			path.join(userMemoryDir, "MEMORY.md"),
			"# User Memory\n\nThis user prefers dark mode.",
			"utf-8"
		)

		const files = await listMemoryFiles(testDir)
		const userFiles = files.filter((f) => f.includes(userId))
		expect(userFiles.length).toBeGreaterThan(0)
	})

	it("isolates memory by userId", async () => {
		const user1 = "user-one"
		const user2 = "user-two"

		const user1Dir = path.join(testDir, ".hybrid", "memory", "users", user1)
		const user2Dir = path.join(testDir, ".hybrid", "memory", "users", user2)
		await fs.mkdir(user1Dir, { recursive: true })
		await fs.mkdir(user2Dir, { recursive: true })

		await fs.writeFile(
			path.join(user1Dir, "MEMORY.md"),
			"# User 1\n\nUser one loves coffee.",
			"utf-8"
		)
		await fs.writeFile(
			path.join(user2Dir, "MEMORY.md"),
			"# User 2\n\nUser two prefers tea.",
			"utf-8"
		)

		const id = makeAgentId()
		const config = resolveMemoryConfig(
			{
				sources: ["memory"],
				fallback: "none",
				query: {
					hybrid: { enabled: false, vectorWeight: 0.7, textWeight: 0.3 },
					maxResults: 10,
					minScore: 0
				}
			},
			id
		)

		// Create a single manager and sync all files
		const manager = await MemoryIndexManager.get({
			agentId: id,
			workspaceDir: testDir,
			config
		})
		await manager!.sync()

		// User 1 scope should find coffee but not tea
		const coffeeResults = await manager!.search("coffee", {
			scope: { type: "user", userId: user1 }
		})
		expect(coffeeResults.length).toBeGreaterThan(0)
		const teaResults = await manager!.search("tea", {
			scope: { type: "user", userId: user1 }
		})
		expect(teaResults.length).toBe(0)

		// User 2 scope should find tea but not coffee
		const teaResults2 = await manager!.search("tea", {
			scope: { type: "user", userId: user2 }
		})
		expect(teaResults2.length).toBeGreaterThan(0)
		const coffeeResults2 = await manager!.search("coffee", {
			scope: { type: "user", userId: user2 }
		})
		expect(coffeeResults2.length).toBe(0)

		await manager?.close()
	})

	it("syncs user memory files to index", async () => {
		const userId = "test-user-xyz"
		const userMemoryDir = path.join(
			testDir,
			".hybrid",
			"memory",
			"users",
			userId
		)
		await fs.mkdir(userMemoryDir, { recursive: true })
		await fs.writeFile(
			path.join(userMemoryDir, "MEMORY.md"),
			"# Memory\n\nOn 2026-03-01, the weather was great.",
			"utf-8"
		)

		const id = makeAgentId()
		const config = resolveMemoryConfig(
			{
				sources: ["memory"],
				fallback: "none",
				query: {
					hybrid: { enabled: false, vectorWeight: 0.7, textWeight: 0.3 },
					maxResults: 10,
					minScore: 0
				}
			},
			id
		)

		const manager = await MemoryIndexManager.get({
			agentId: id,
			workspaceDir: testDir,
			config
		})
		await manager!.sync()

		const results = await manager!.search("weather", {
			scope: { type: "user", userId }
		})
		expect(results.length).toBeGreaterThan(0)
		expect(results[0].snippet.toLowerCase()).toContain("weather")

		await manager?.close()
	})
})
