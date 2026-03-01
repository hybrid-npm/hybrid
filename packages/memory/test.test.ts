import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { beforeEach, describe, expect, it } from "vitest"
import { MemoryIndexManager, resolveMemoryConfig } from "./src/index.js"

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
})
