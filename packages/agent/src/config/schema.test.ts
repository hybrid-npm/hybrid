import { describe, expect, it } from "vitest"
import { hybridConfigSchema } from "./schema"

describe("hybridConfigSchema", () => {
	it("accepts empty config", () => {
		const result = hybridConfigSchema.safeParse({})
		expect(result.success).toBe(true)
	})

	it("accepts valid agent config", () => {
		const result = hybridConfigSchema.safeParse({
			agent: { name: "test-bot", model: "claude-sonnet-4-20250514", maxTurns: 50 }
		})
		expect(result.success).toBe(true)
	})

	it("accepts valid mcpServers config", () => {
		const result = hybridConfigSchema.safeParse({
			mcpServers: [
				{ name: "memory", transport: { type: "stdio", command: "npx", args: ["-y", "@hybrd/memory"] } },
				{ name: "scheduler", transport: { type: "sse", url: "http://localhost:8455" } }
			]
		})
		expect(result.success).toBe(true)
	})

	it("accepts valid channels config", () => {
		const result = hybridConfigSchema.safeParse({
			channels: [
				{ id: "slack", enabled: true },
				{ id: "discord", enabled: false }
			]
		})
		expect(result.success).toBe(true)
	})

	describe("chatSdk config", () => {
		it("accepts valid chatSdk config with all providers", () => {
			const result = hybridConfigSchema.safeParse({
				chatSdk: {
					enabled: true,
					state: { type: "postgres", url: "postgres://localhost/test" },
					providers: {
						slack: { enabled: true, botToken: "xoxb-test", signingSecret: "test" },
						discord: { enabled: true, botToken: "test", publicKey: "abc123", applicationId: "123" },
						linear: { enabled: true, apiKey: "test", webhookSecret: "test" }
					}
				}
			})
			expect(result.success).toBe(true)
		})

		it("defaults enabled to false", () => {
			const result = hybridConfigSchema.safeParse({ chatSdk: {} })
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.chatSdk?.enabled).toBe(false)
			}
		})

		it("defaults provider enabled to false", () => {
			const result = hybridConfigSchema.safeParse({
				chatSdk: { enabled: true, providers: { slack: {} } }
			})
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.chatSdk?.providers?.slack?.enabled).toBe(false)
			}
		})

		it("accepts partial provider config", () => {
			const result = hybridConfigSchema.safeParse({
				chatSdk: {
					enabled: true,
					providers: { slack: { enabled: true } }
				}
			})
			expect(result.success).toBe(true)
		})

		it("accepts postgres state config", () => {
			const result = hybridConfigSchema.safeParse({
				chatSdk: {
					enabled: true,
					state: { type: "postgres" }
				}
			})
			expect(result.success).toBe(true)
		})

		it("accepts redis state config", () => {
			const result = hybridConfigSchema.safeParse({
				chatSdk: {
					enabled: true,
					state: { type: "redis", url: "redis://localhost:6379" }
				}
			})
			expect(result.success).toBe(true)
		})

		it("accepts memory state config", () => {
			const result = hybridConfigSchema.safeParse({
				chatSdk: {
					enabled: true,
					state: { type: "memory" }
				}
			})
			expect(result.success).toBe(true)
		})

		it("rejects invalid state type", () => {
			const result = hybridConfigSchema.safeParse({
				chatSdk: {
					enabled: true,
					state: { type: "sqlite" }
				}
			})
			expect(result.success).toBe(false)
		})

		it("accepts full config with all sections", () => {
			const result = hybridConfigSchema.safeParse({
				agent: { name: "hybrid-bot", model: "claude-sonnet-4-20250514" },
				identity: { type: "api-key" },
				mcpServers: [
					{ name: "memory", transport: { type: "stdio", command: "npx" } }
				],
				channels: [{ id: "slack", enabled: true }],
				chatSdk: {
					enabled: true,
					state: { type: "postgres" },
					providers: {
						slack: { enabled: true },
						linear: { enabled: true }
					}
				}
			})
			expect(result.success).toBe(true)
		})
	})
})
