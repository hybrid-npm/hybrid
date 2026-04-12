import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ── Mock all external dependencies before importing our code ──────────────────

const mockInitialize = vi.fn().mockResolvedValue(undefined)
const mockShutdown = vi.fn().mockResolvedValue(undefined)
const mockSubscribe = vi.fn().mockResolvedValue(undefined)
const mockStartTyping = vi.fn().mockResolvedValue(undefined)
const mockPost = vi.fn().mockResolvedValue({ id: "msg-123" })

// Store registered handlers so the mock adapter can invoke them
const registeredMentionHandlers: Array<
	(thread: any, message: any) => Promise<void>
> = []
const registeredSubscribedHandlers: Array<
	(thread: any, message: any) => Promise<void>
> = []

// Mock Slack adapter with a handleWebhook that simulates message processing
const mockSlackHandleWebhook = vi.fn()

vi.mock("@chat-adapter/slack", () => ({
	createSlackAdapter: vi.fn(() => ({
		name: "slack",
		handleWebhook: mockSlackHandleWebhook,
		botUserId: "U_BOT_123",
	}))
}))

vi.mock("@chat-adapter/discord", () => ({
	createDiscordAdapter: vi.fn(() => ({ name: "discord" }))
}))

vi.mock("@chat-adapter/linear", () => ({
	createLinearAdapter: vi.fn(() => ({ name: "linear" }))
}))

vi.mock("@chat-adapter/state-pg", () => ({
	createPostgresState: vi.fn(() => ({
		connect: vi.fn(),
		disconnect: vi.fn(),
		subscribe: mockSubscribe,
		acquireLock: vi.fn().mockResolvedValue({
			threadId: "test",
			token: "test",
			expiresAt: Date.now() + 30_000,
		}),
		releaseLock: vi.fn().mockResolvedValue(undefined),
		isSubscribed: vi.fn().mockResolvedValue(false),
	}))
}))

vi.mock("chat", () => {
	const MockChat = class MockChat {
		initialize = mockInitialize
		shutdown = mockShutdown

		onNewMention(handler: (thread: any, message: any) => Promise<void>) {
			registeredMentionHandlers.push(handler)
		}

		onSubscribedMessage(handler: (thread: any, message: any) => Promise<void>) {
			registeredSubscribedHandlers.push(handler)
		}

		onReaction(_emoji: any, _handler: any) {}

		webhooks = {
			slack: mockSlackHandleWebhook,
			discord: vi.fn(),
			linear: vi.fn(),
		}
	}

	return {
		Chat: MockChat,
		toAiMessages: vi.fn().mockResolvedValue([]),
	}
})

vi.mock("picocolors", () => ({
	default: {
		yellow: (s: string) => s,
		green: (s: string) => s,
		cyan: (s: string) => s,
		bold: (s: string) => s,
		gray: (s: string) => s,
	},
}))

vi.mock("../lib/secret-store.js", () => ({
	getSecret: () => undefined,
	hasSecret: () => false,
	loadSecrets: () => {},
}))

// ── Import our modules under test ────────────────────────────────────────────

import { getChatInstance, initChatSdk, shutdownChatSdk } from "./chat-sdk"

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildFakeSlackWebhookRequest(messageText: string) {
	const payload = {
		token: "fake-verification-token",
		team_id: "T123456",
		api_app_id: "A123456",
		event: {
			type: "message",
			channel: "C123456",
			channel_type: "channel",
			user: "U789012",
			text: messageText,
			ts: "1700000000.000100",
			blocks: [
				{
					type: "rich_text",
					elements: [
						{
							type: "rich_text_section",
							elements: [{ type: "text", text: messageText }],
						},
					],
				},
			],
		},
		event_id: "Ev123456",
		event_time: 1700000000,
		authorizations: [
			{
				enterprise_id: null,
				team_id: "T123456",
				user_id: "U_BOT_123",
				is_bot: true,
			},
		],
	}

	return new Request("http://localhost/api/webhooks/slack", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-slack-signature": "v0=fake",
			"x-slack-request-timestamp": "1700000000",
		},
		body: JSON.stringify(payload),
	})
}

function buildMockThread(threadId = "slack:C123456:1700000000.000100") {
	return {
		id: threadId,
		channelId: "slack:C123456",
		isDM: false,
		subscribe: mockSubscribe,
		startTyping: mockStartTyping,
		post: mockPost,
		mentionUser: vi.fn((userId: string) => `<@${userId}>`),
		state: Promise.resolve(null),
		setState: vi.fn(),
		isSubscribed: vi.fn().mockResolvedValue(false),
		unsubscribe: vi.fn(),
		messages: (async function* () {})(),
		allMessages: (async function* () {})(),
		recentMessages: [],
		channel: {
			id: "slack:C123456",
			post: vi.fn(),
		},
		adapter: {
			name: "slack",
		},
	}
}

function buildMockMessage(text: string, userId = "U789012") {
	return {
		id: "msg-001",
		threadId: "slack:C123456:1700000000.000100",
		text,
		formatted: { type: "root", children: [] },
		raw: {},
		author: {
			userId,
			userName: "testuser",
			fullName: "Test User",
			isBot: false,
			isMe: false,
		},
		metadata: {
			dateSent: new Date(),
			edited: false,
		},
		attachments: [],
		links: [],
		isMention: true,
	}
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("chat-sdk webhook integration", () => {
	const AGENT_RESPONSE = "Hello from the agent! I processed your message."

	let mockRunAgentTurn: ReturnType<typeof vi.fn>

	beforeEach(() => {
		vi.clearAllMocks()
		registeredMentionHandlers.length = 0
		registeredSubscribedHandlers.length = 0

		process.env.POSTGRES_URL = "postgres://localhost/test"

		// Mock runAgentTurn that returns a known response as an async iterable
		mockRunAgentTurn = vi.fn().mockImplementation(async () => {
			return (async function* () {
				for (const chunk of AGENT_RESPONSE.split(" ")) {
					yield `${chunk} `
				}
			})()
		})

		// Default webhook handler: simulate what the real Slack adapter does
		// after signature verification — it calls processMessage which dispatches
		// to onNewMention handlers
		mockSlackHandleWebhook.mockImplementation(async (request: Request) => {
			const body = await request.json()
			const event = body.event

			if (event?.type === "message" && event.text) {
				const thread = buildMockThread(
					`slack:${event.channel}:${event.ts}`
				)
				const message = buildMockMessage(event.text, event.user)

				// Dispatch to all registered onNewMention handlers
				for (const handler of registeredMentionHandlers) {
					await handler(thread, message)
				}
			}

			return new Response(JSON.stringify({ ok: true }), { status: 200 })
		})
	})

	afterEach(async () => {
		await shutdownChatSdk()
		process.env.POSTGRES_URL = undefined
		process.env.DATABASE_URL = undefined
	})

	describe("full webhook flow", () => {
		it("processes a Slack webhook through to thread.post() with agent response", async () => {
			// 1. Initialize Chat SDK with mock agent
			await initChatSdk(
				{
					projectRoot: "/test",
					agentName: "test-agent",
					runAgentTurn: mockRunAgentTurn,
				},
				{
					enabled: true,
					providers: {
						slack: {
							enabled: true,
							botToken: "xoxb-test",
							signingSecret: "test-secret",
						},
					},
				}
			)

			const bot = getChatInstance()
			expect(bot).not.toBeNull()

			// 2. Construct a fake Slack webhook request
			const request = buildFakeSlackWebhookRequest("@test-agent what is the status?")

			// 3. Pass it through the webhook handler (simulating Hono route)
			const response = await (bot as NonNullable<typeof bot>).webhooks.slack(request)

			// 4. Verify the webhook returned 200
			expect(response.status).toBe(200)

			// 5. Verify onNewMention handler fired → runAgentTurn was called
			expect(mockRunAgentTurn).toHaveBeenCalledTimes(1)
			expect(mockRunAgentTurn).toHaveBeenCalledWith({
				messages: [
					{ role: "user", content: "@test-agent what is the status?" },
				],
				chatId: "slack:C123456:1700000000.000100",
				userId: "U789012",
				conversationId: "slack:C123456:1700000000.000100",
				channel: "slack",
			})

			// 6. Verify thread.subscribe() was called
			expect(mockSubscribe).toHaveBeenCalledTimes(1)

			// 7. Verify thread.startTyping() was called
			expect(mockStartTyping).toHaveBeenCalledTimes(1)

			// 8. Verify thread.post() was called with the agent's response stream
			expect(mockPost).toHaveBeenCalledTimes(1)
			const postedStream = mockPost.mock.calls[0][0]
			expect(typeof postedStream[Symbol.asyncIterator]).toBe("function")

			// 9. Consume the stream and verify it contains the agent's response
			const chunks: string[] = []
			for await (const chunk of postedStream) {
				chunks.push(chunk)
			}
			expect(chunks.join("")).toBe(`${AGENT_RESPONSE} `)
		})

		it("passes the correct channel extracted from thread ID", async () => {
			await initChatSdk(
				{
					projectRoot: "/test",
					agentName: "test-agent",
					runAgentTurn: mockRunAgentTurn,
				},
				{
					enabled: true,
					providers: {
						slack: {
							enabled: true,
							botToken: "xoxb-test",
							signingSecret: "test-secret",
						},
					},
				}
			)

			const bot = getChatInstance()
			if (!bot) throw new Error("bot not initialized")

			const request = buildFakeSlackWebhookRequest("@test-agent hi")
			await bot.webhooks.slack(request)

			const callArgs = mockRunAgentTurn.mock.calls[0][0]
			expect(callArgs.channel).toBe("slack")
		})

		it("handles multiple messages in sequence", async () => {
			await initChatSdk(
				{
					projectRoot: "/test",
					agentName: "test-agent",
					runAgentTurn: mockRunAgentTurn,
				},
				{
					enabled: true,
					providers: {
						slack: {
							enabled: true,
							botToken: "xoxb-test",
							signingSecret: "test-secret",
						},
					},
				}
			)

			const bot = getChatInstance()
			if (!bot) throw new Error("bot not initialized")

			const request1 = buildFakeSlackWebhookRequest("first message")
			const request2 = buildFakeSlackWebhookRequest("second message")

			await bot.webhooks.slack(request1)
			await bot.webhooks.slack(request2)

			expect(mockRunAgentTurn).toHaveBeenCalledTimes(2)
			expect(mockRunAgentTurn).toHaveBeenNthCalledWith(1, expect.objectContaining({
				messages: [{ role: "user", content: "first message" }],
			}))
			expect(mockRunAgentTurn).toHaveBeenNthCalledWith(2, expect.objectContaining({
				messages: [{ role: "user", content: "second message" }],
			}))
			expect(mockPost).toHaveBeenCalledTimes(2)
		})

		it("preserves user ID from the webhook payload", async () => {
			await initChatSdk(
				{
					projectRoot: "/test",
					agentName: "test-agent",
					runAgentTurn: mockRunAgentTurn,
				},
				{
					enabled: true,
					providers: {
						slack: {
							enabled: true,
							botToken: "xoxb-test",
							signingSecret: "test-secret",
						},
					},
				}
			)

			const bot = getChatInstance()
			if (!bot) throw new Error("bot not initialized")

			const request = buildFakeSlackWebhookRequest("test")
			await bot.webhooks.slack(request)

			expect(mockRunAgentTurn).toHaveBeenCalledWith(
				expect.objectContaining({ userId: "U789012" })
			)
		})
	})

	describe("Hono route integration", () => {
		it("returns 503 when chat-sdk is not initialized", async () => {
			// Don't initialize chat-sdk
			expect(getChatInstance()).toBeNull()

			// Import the app — it uses getChatInstance() which returns null
			const { default: app } = await import("./index.js")

			const res = await app.request("/api/webhooks/slack", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ type: "event_callback" }),
			})

			expect(res.status).toBe(503)
			const body = await res.json()
			expect(body.error).toBe("chat-sdk not initialized")
		})

		it("routes slack webhook through Hono to chat-sdk handler", async () => {
			// 1. Initialize Chat SDK
			await initChatSdk(
				{
					projectRoot: "/test",
					agentName: "test-agent",
					runAgentTurn: mockRunAgentTurn,
				},
				{
					enabled: true,
					providers: {
						slack: {
							enabled: true,
							botToken: "xoxb-test",
							signingSecret: "test-secret",
						},
					},
				}
			)

			// 2. Import the Hono app (will pick up the initialized bot)
			const { default: app } = await import("./index.js")

			// 3. Send a request through the Hono route
			const res = await app.request("/api/webhooks/slack", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					token: "fake",
					team_id: "T123",
					event: {
						type: "message",
						channel: "C123",
						channel_type: "channel",
						user: "U456",
						text: "hello via hono",
						ts: "1700000000.000200",
					},
					event_id: "Ev789",
					event_time: 1700000000,
				}),
			})

			// 4. Verify the route returned success
			expect(res.status).toBe(200)

			// 5. Verify the full flow executed
			expect(mockRunAgentTurn).toHaveBeenCalledTimes(1)
			expect(mockRunAgentTurn).toHaveBeenCalledWith(
				expect.objectContaining({
					messages: [{ role: "user", content: "hello via hono" }],
					chatId: "slack:C123:1700000000.000200",
					userId: "U456",
					channel: "slack",
				})
			)
			expect(mockPost).toHaveBeenCalledTimes(1)
		})
	})
})
