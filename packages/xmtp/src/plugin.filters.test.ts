import type { HonoVariables, PluginContext } from "@hybrd/types"
import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { XMTPPlugin } from "./plugin"

// Mock @xmtp/agent-sdk and ./client used by the plugin
vi.mock("@xmtp/agent-sdk", () => {
	const handlers: Record<string, Array<(payload: unknown) => unknown>> = {}
	const fakeXmtp = {
		on: (event: string, cb: (payload: unknown) => unknown) => {
			if (!handlers[event]) handlers[event] = []
			handlers[event].push(cb)
		},
		emit: async (event: string, payload: unknown) => {
			for (const cb of handlers[event] || []) {
				// eslint-disable-next-line @typescript-eslint/await-thenable
				await cb(payload)
			}
		},
		start: vi.fn(async () => {})
	}

	return {
		Agent: { create: vi.fn(async () => fakeXmtp) },
		createUser: vi.fn(() => ({ account: { address: "0xabc" } })),
		createSigner: vi.fn(() => ({})),
		getTestUrl: vi.fn(() => "http://test"),
		XmtpEnv: {},
		__fakeXmtp: fakeXmtp
	}
})

vi.mock("./client", () => {
	const fakeConversation = {
		id: "conv1",
		send: vi.fn(async (_text: string) => {})
	}

	const fakeClient = {
		inboxId: "inbox-1",
		accountIdentifier: { identifier: "0xabc" },
		conversations: {
			list: vi.fn(async () => [] as unknown[]),
			getConversationById: vi.fn(async (_id: string) => fakeConversation),
			streamAllMessages: vi.fn(async function* () {
				// Yield one message and finish
				yield {
					id: "msg1",
					senderInboxId: "other-inbox",
					content: "hello",
					contentType: { sameAs: () => true },
					conversationId: "conv1"
				}
			})
		}
	}

	async function getDbPath(_name: string): Promise<string> {
		return "/tmp/xmtp-test-db"
	}

	return {
		createXMTPClient: vi.fn(async () => fakeClient),
		getDbPath
	}
})

type MockAgentSdk = {
	__fakeXmtp: {
		emit: (event: string, payload: unknown) => Promise<void>
	}
}

function createTestAgent() {
	return {
		name: "test-agent",
		plugins: { applyAll: vi.fn(async () => {}) },
		createRuntimeContext: vi.fn(
			async (base: unknown) => base as Record<string, unknown>
		),
		generate: vi.fn(async () => ({ text: "ok" }))
	}
}

beforeEach(() => {
	vi.resetModules()
	vi.clearAllMocks()
	process.env.AGENT_WALLET_KEY = "0xabc"
	process.env.AGENT_SECRET = "secret"
	process.env.XMTP_ENV = "dev"
	process.env.XMTP_ENABLE_NODE_STREAM = undefined
})

afterEach(() => {
	process.env.AGENT_WALLET_KEY = undefined
	process.env.AGENT_SECRET = undefined
	process.env.XMTP_ENV = undefined
	process.env.XMTP_ENABLE_NODE_STREAM = undefined
})

describe("XMTPPlugin behaviors", () => {
	it("blocks node stream messages when behaviors filter out", async () => {
		const app = new Hono<{ Variables: HonoVariables }>()
		const agent = createTestAgent()

		// Mock behaviors to filter out messages
		const mockBehaviors = {
			executeBefore: vi.fn(async (context: any) => {
				context.sendOptions = { filtered: true }
			}),
			executeAfter: vi.fn(async () => {})
		}

		const context = {
			agent,
			behaviors: mockBehaviors
		} as unknown as PluginContext

		const plugin = XMTPPlugin()
		await plugin.apply(app, context)

		// Allow async stream to tick
		await new Promise((r) => setTimeout(r, 10))

		// No generation or sending should have occurred
		expect(agent.generate).not.toHaveBeenCalled()
	})

	it("allows text handler when behaviors don't filter", async () => {
		const app = new Hono<{ Variables: HonoVariables }>()
		const agent = createTestAgent()

		// Mock behaviors to not filter messages
		const mockBehaviors = {
			executeBefore: vi.fn(async () => {}),
			executeAfter: vi.fn(async () => {})
		}

		const context = {
			agent,
			behaviors: mockBehaviors
		} as unknown as PluginContext

		process.env.XMTP_ENABLE_NODE_STREAM = "false"
		const plugin = XMTPPlugin()
		await plugin.apply(app, context)

		const mocked = (await import("@xmtp/agent-sdk")) as unknown as MockAgentSdk

		// Emit a text event
		await mocked.__fakeXmtp.emit("text", {
			conversation: { id: "conv1", send: vi.fn(async () => {}) },
			message: { content: "hello" }
		})

		expect(agent.generate).toHaveBeenCalledTimes(1)
	})
})
