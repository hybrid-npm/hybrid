import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockInitialize = vi.fn().mockResolvedValue(undefined)
const mockShutdown = vi.fn().mockResolvedValue(undefined)
const mockOnNewMention = vi.fn()
const mockOnSubscribedMessage = vi.fn()
const mockOnReaction = vi.fn()

vi.mock("@chat-adapter/slack", () => ({
	createSlackAdapter: vi.fn(() => ({ name: "slack" }))
}))

vi.mock("@chat-adapter/discord", () => ({
	createDiscordAdapter: vi.fn(() => ({ name: "discord" }))
}))

vi.mock("@chat-adapter/linear", () => ({
	createLinearAdapter: vi.fn(() => ({ name: "linear" }))
}))

vi.mock("@chat-adapter/state-pg", () => ({
	createPostgresState: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }))
}))

vi.mock("chat", () => {
	const MockChat = class MockChat {
		initialize = mockInitialize
		shutdown = mockShutdown
		onNewMention = mockOnNewMention
		onSubscribedMessage = mockOnSubscribedMessage
		onReaction = mockOnReaction
	}
	return {
		Chat: MockChat,
		toAiMessages: vi.fn().mockResolvedValue([])
	}
})

vi.mock("picocolors", () => ({
	default: {
		yellow: (s: string) => s,
		green: (s: string) => s,
		cyan: (s: string) => s
	}
}))

vi.mock("../lib/secret-store.js", () => ({
	getSecret: () => undefined,
	hasSecret: () => false
}))

import { createSlackAdapter } from "@chat-adapter/slack"
import { createDiscordAdapter } from "@chat-adapter/discord"
import { createLinearAdapter } from "@chat-adapter/linear"
import { createPostgresState } from "@chat-adapter/state-pg"
import { getChatInstance, initChatSdk, shutdownChatSdk } from "./chat-sdk"

describe("chat-sdk", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		process.env.POSTGRES_URL = "postgres://localhost/test"
		delete process.env.LINEAR_API_KEY
		delete process.env.LINEAR_WEBHOOK_SECRET
		delete process.env.SLACK_BOT_TOKEN
		delete process.env.SLACK_SIGNING_SECRET
		delete process.env.DISCORD_BOT_TOKEN
		delete process.env.DISCORD_PUBLIC_KEY
		delete process.env.DISCORD_APPLICATION_ID
	})

	afterEach(async () => {
		await shutdownChatSdk()
		process.env.POSTGRES_URL = undefined
		process.env.DATABASE_URL = undefined
	})

	describe("initChatSdk", () => {
		it("does nothing when disabled", async () => {
			await initChatSdk(
				{ projectRoot: "/test", agentName: "test", runAgentTurn: vi.fn() },
				{ enabled: false }
			)
			expect(getChatInstance()).toBeNull()
		})

		it("does nothing when config is undefined", async () => {
			await initChatSdk(
				{ projectRoot: "/test", agentName: "test", runAgentTurn: vi.fn() },
				undefined
			)
			expect(getChatInstance()).toBeNull()
		})

		it("initializes slack adapter when enabled", async () => {
			await initChatSdk(
				{ projectRoot: "/test", agentName: "test", runAgentTurn: vi.fn() },
				{
					enabled: true,
					providers: {
						slack: { enabled: true, botToken: "xoxb-test", signingSecret: "test" }
					}
				}
			)
			expect(createSlackAdapter).toHaveBeenCalledWith({
				botToken: "xoxb-test",
				signingSecret: "test"
			})
			expect(getChatInstance()).not.toBeNull()
		})

		it("initializes discord adapter when enabled", async () => {
			await initChatSdk(
				{ projectRoot: "/test", agentName: "test", runAgentTurn: vi.fn() },
				{
					enabled: true,
					providers: {
						discord: {
							enabled: true,
							botToken: "test-token",
							publicKey: "abc123",
							applicationId: "123"
						}
					}
				}
			)
			expect(createDiscordAdapter).toHaveBeenCalledWith({
				botToken: "test-token",
				publicKey: "abc123",
				applicationId: "123"
			})
		})

		it("initializes linear adapter when enabled with both apiKey and webhookSecret", async () => {
			await initChatSdk(
				{ projectRoot: "/test", agentName: "test", runAgentTurn: vi.fn() },
				{
					enabled: true,
					providers: {
						linear: { enabled: true, apiKey: "lin_test", webhookSecret: "ws_test" }
					}
				}
			)
			expect(createLinearAdapter).toHaveBeenCalledWith({
				apiKey: "lin_test",
				webhookSecret: "ws_test"
			})
		})

		it("skips linear adapter if apiKey is missing", async () => {
			await initChatSdk(
				{ projectRoot: "/test", agentName: "test", runAgentTurn: vi.fn() },
				{
					enabled: true,
					providers: {
						linear: { enabled: true, webhookSecret: "ws_test" }
					}
				}
			)
			expect(createLinearAdapter).not.toHaveBeenCalled()
		})

		it("initializes multiple providers at once", async () => {
			await initChatSdk(
				{ projectRoot: "/test", agentName: "test", runAgentTurn: vi.fn() },
				{
					enabled: true,
					providers: {
						slack: { enabled: true, botToken: "xoxb-test", signingSecret: "test" },
						linear: { enabled: true, apiKey: "lin_test", webhookSecret: "ws_test" }
					}
				}
			)
			expect(createSlackAdapter).toHaveBeenCalled()
			expect(createLinearAdapter).toHaveBeenCalled()
			expect(createDiscordAdapter).not.toHaveBeenCalled()
		})

		it("calls bot.initialize() after setup", async () => {
			await initChatSdk(
				{ projectRoot: "/test", agentName: "test", runAgentTurn: vi.fn() },
				{
					enabled: true,
					providers: {
						slack: { enabled: true, botToken: "xoxb-test", signingSecret: "test" }
					}
				}
			)
			const bot = getChatInstance()
			expect(bot?.initialize).toHaveBeenCalled()
		})
	})

	describe("shutdownChatSdk", () => {
		it("shuts down bot if initialized", async () => {
			await initChatSdk(
				{ projectRoot: "/test", agentName: "test", runAgentTurn: vi.fn() },
				{
					enabled: true,
					providers: {
						slack: { enabled: true, botToken: "xoxb-test", signingSecret: "test" }
					}
				}
			)
			expect(getChatInstance()).not.toBeNull()
			await shutdownChatSdk()
			expect(getChatInstance()).toBeNull()
		})

		it("does nothing when not initialized", async () => {
			await shutdownChatSdk()
			expect(getChatInstance()).toBeNull()
		})
	})

	describe("state adapter", () => {
		it("uses postgres when POSTGRES_URL is set", async () => {
			const saved = process.env.POSTGRES_URL
			process.env.POSTGRES_URL = "postgres://localhost/mydb"
			await shutdownChatSdk()
			vi.clearAllMocks()
			await initChatSdk(
				{ projectRoot: "/test", agentName: "test", runAgentTurn: vi.fn() },
				{
					enabled: true,
					providers: {
						slack: { enabled: true, botToken: "xoxb-test", signingSecret: "test" }
					}
				}
			)
			expect(createPostgresState).toHaveBeenCalledWith({
				url: "postgres://localhost/mydb"
			})
			process.env.POSTGRES_URL = saved
		})
	})
})
