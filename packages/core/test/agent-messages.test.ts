import type { LanguageModel, UIMessage } from "ai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Agent } from "../src/index"

// Mock the 'ai' module
vi.mock("ai", async (importOriginal) => {
	const actual = await importOriginal<typeof import("ai")>()
	return {
		...actual,
		generateText: vi.fn(),
		streamText: vi.fn(),
		convertToModelMessages: vi.fn((messages) => messages),
		smoothStream: vi.fn(() => (stream: unknown) => stream),
		stepCountIs: vi.fn((count: number) => ({ type: "stepCount", count }))
	}
})

import { convertToModelMessages, generateText } from "ai"

const mockGenerateText = vi.mocked(generateText)
const mockConvertToModelMessages = vi.mocked(convertToModelMessages)

const mockModel: LanguageModel = {
	modelId: "test-model",
	provider: "test-provider"
} as LanguageModel

const mockRuntime = {
	conversation: { id: "conv-1" },
	message: { id: "msg-1", content: "test", senderInboxId: "inbox-1" },
	xmtpClient: { sendMessage: vi.fn() }
} as unknown as Parameters<typeof Agent.prototype.generate>[1]["runtime"]

describe("Agent Message Preparation", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockGenerateText.mockResolvedValue({
			text: "response",
			toolCalls: [],
			toolResults: [],
			finishReason: "stop",
			usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
			warnings: [],
			steps: [],
			response: { id: "resp-1", modelId: "test-model" },
			request: {},
			responseMessages: []
		} as unknown as Awaited<ReturnType<typeof generateText>>)
	})

	describe("System Message Handling", () => {
		it("should add system message when no system message exists", async () => {
			const agent = new Agent({
				name: "Test Agent",
				model: mockModel,
				instructions: "You are a helpful assistant."
			})

			const messages: UIMessage[] = [
				{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
			]

			await agent.generate(messages, { runtime: mockRuntime })

			const preparedMessages = mockConvertToModelMessages.mock
				.calls[0][0] as UIMessage[]

			expect(preparedMessages).toHaveLength(2)
			expect(preparedMessages[0].role).toBe("system")
			expect(preparedMessages[0].parts[0]).toEqual({
				type: "text",
				text: "You are a helpful assistant."
			})
			expect(preparedMessages[1].role).toBe("user")
		})

		it("should replace existing system message content with instructions", async () => {
			const agent = new Agent({
				name: "Test Agent",
				model: mockModel,
				instructions: "New instructions"
			})

			const messages: UIMessage[] = [
				{
					role: "system",
					id: "sys-1",
					parts: [{ type: "text", text: "Old system message" }]
				},
				{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
			]

			await agent.generate(messages, { runtime: mockRuntime })

			const preparedMessages = mockConvertToModelMessages.mock
				.calls[0][0] as UIMessage[]

			expect(preparedMessages).toHaveLength(2)
			expect(preparedMessages[0].role).toBe("system")
			expect(preparedMessages[0].parts[0]).toEqual({
				type: "text",
				text: "New instructions"
			})
		})

		it("should preserve system message id when replacing content", async () => {
			const agent = new Agent({
				name: "Test Agent",
				model: mockModel,
				instructions: "New instructions"
			})

			const messages: UIMessage[] = [
				{
					role: "system",
					id: "original-sys-id",
					parts: [{ type: "text", text: "Old instructions" }]
				},
				{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
			]

			await agent.generate(messages, { runtime: mockRuntime })

			const preparedMessages = mockConvertToModelMessages.mock
				.calls[0][0] as UIMessage[]

			expect(preparedMessages[0].id).toBe("original-sys-id")
		})

		it("should not modify messages when no instructions provided", async () => {
			const agent = new Agent({
				name: "Test Agent",
				model: mockModel,
				instructions: ""
			})

			const messages: UIMessage[] = [
				{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
			]

			await agent.generate(messages, { runtime: mockRuntime })

			const preparedMessages = mockConvertToModelMessages.mock
				.calls[0][0] as UIMessage[]

			expect(preparedMessages).toHaveLength(1)
			expect(preparedMessages[0].role).toBe("user")
		})

		it("should generate unique id for new system messages", async () => {
			const agent = new Agent({
				name: "Test Agent",
				model: mockModel,
				instructions: "Instructions"
			})

			const messages: UIMessage[] = [
				{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
			]

			await agent.generate(messages, { runtime: mockRuntime })

			const preparedMessages = mockConvertToModelMessages.mock
				.calls[0][0] as UIMessage[]

			expect(preparedMessages[0].id).toBeDefined()
			expect(typeof preparedMessages[0].id).toBe("string")
			expect(preparedMessages[0].id.length).toBeGreaterThan(0)
		})
	})

	describe("Message Order Preservation", () => {
		it("should preserve order of non-system messages", async () => {
			const agent = new Agent({
				name: "Test Agent",
				model: mockModel,
				instructions: "Instructions"
			})

			const messages: UIMessage[] = [
				{ role: "user", id: "msg-1", parts: [{ type: "text", text: "First" }] },
				{
					role: "assistant",
					id: "msg-2",
					parts: [{ type: "text", text: "Response" }]
				},
				{ role: "user", id: "msg-3", parts: [{ type: "text", text: "Second" }] }
			]

			await agent.generate(messages, { runtime: mockRuntime })

			const preparedMessages = mockConvertToModelMessages.mock
				.calls[0][0] as UIMessage[]

			expect(preparedMessages).toHaveLength(4)
			expect(preparedMessages[0].role).toBe("system")
			expect(preparedMessages[1].id).toBe("msg-1")
			expect(preparedMessages[2].id).toBe("msg-2")
			expect(preparedMessages[3].id).toBe("msg-3")
		})

		it("should handle empty messages array", async () => {
			const agent = new Agent({
				name: "Test Agent",
				model: mockModel,
				instructions: "Instructions"
			})

			const messages: UIMessage[] = []

			await agent.generate(messages, { runtime: mockRuntime })

			const preparedMessages = mockConvertToModelMessages.mock
				.calls[0][0] as UIMessage[]

			expect(preparedMessages).toHaveLength(1)
			expect(preparedMessages[0].role).toBe("system")
		})
	})

	describe("Dynamic Instructions", () => {
		it("should resolve dynamic instructions with messages", async () => {
			const agent = new Agent({
				name: "Test Agent",
				model: mockModel,
				instructions: ({ messages }) =>
					`You have ${messages.length} messages in context.`
			})

			const messages: UIMessage[] = [
				{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] },
				{ role: "user", id: "msg-2", parts: [{ type: "text", text: "World" }] }
			]

			await agent.generate(messages, { runtime: mockRuntime })

			const preparedMessages = mockConvertToModelMessages.mock
				.calls[0][0] as UIMessage[]

			expect(preparedMessages[0].parts[0]).toEqual({
				type: "text",
				text: "You have 2 messages in context."
			})
		})

		it("should resolve dynamic instructions with runtime", async () => {
			const agent = new Agent({
				name: "Test Agent",
				model: mockModel,
				instructions: ({ runtime }) =>
					`Current conversation: ${runtime.conversation.id}`
			})

			const messages: UIMessage[] = [
				{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
			]

			await agent.generate(messages, { runtime: mockRuntime })

			const preparedMessages = mockConvertToModelMessages.mock
				.calls[0][0] as UIMessage[]

			expect(preparedMessages[0].parts[0]).toEqual({
				type: "text",
				text: "Current conversation: conv-1"
			})
		})

		it("should handle async dynamic instructions", async () => {
			const agent = new Agent({
				name: "Test Agent",
				model: mockModel,
				instructions: async () => {
					await new Promise((resolve) => setTimeout(resolve, 10))
					return "Async instructions loaded"
				}
			})

			const messages: UIMessage[] = [
				{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
			]

			await agent.generate(messages, { runtime: mockRuntime })

			const preparedMessages = mockConvertToModelMessages.mock
				.calls[0][0] as UIMessage[]

			expect(preparedMessages[0].parts[0]).toEqual({
				type: "text",
				text: "Async instructions loaded"
			})
		})
	})

	describe("Template Rendering (Eta)", () => {
		it("should render template variables in instructions using Eta syntax", async () => {
			const agent = new Agent({
				name: "Test Agent",
				model: mockModel,
				instructions: "Conversation ID: <%= it.conversation.id %>"
			})

			const messages: UIMessage[] = [
				{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
			]

			await agent.generate(messages, { runtime: mockRuntime })

			const preparedMessages = mockConvertToModelMessages.mock
				.calls[0][0] as UIMessage[]

			expect(preparedMessages[0].parts[0]).toEqual({
				type: "text",
				text: "Conversation ID: conv-1"
			})
		})

		it("should render nested template variables using Eta syntax", async () => {
			const agent = new Agent({
				name: "Test Agent",
				model: mockModel,
				instructions: "Message ID: <%= it.message.id %>"
			})

			const messages: UIMessage[] = [
				{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
			]

			await agent.generate(messages, { runtime: mockRuntime })

			const preparedMessages = mockConvertToModelMessages.mock
				.calls[0][0] as UIMessage[]

			expect(preparedMessages[0].parts[0]).toEqual({
				type: "text",
				text: "Message ID: msg-1"
			})
		})
	})
})

describe("Agent Runtime Context", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockGenerateText.mockResolvedValue({
			text: "response",
			toolCalls: [],
			toolResults: [],
			finishReason: "stop",
			usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
			warnings: [],
			steps: [],
			response: { id: "resp-1", modelId: "test-model" },
			request: {},
			responseMessages: []
		} as unknown as Awaited<ReturnType<typeof generateText>>)
	})

	it("should create runtime context with base runtime", async () => {
		const agent = new Agent({
			name: "Test Agent",
			model: mockModel,
			instructions: "Test"
		})

		const context = await agent.createRuntimeContext(mockRuntime)

		expect(context.conversation.id).toBe("conv-1")
		expect(context.message.id).toBe("msg-1")
	})

	it("should extend runtime with createRuntime function", async () => {
		interface CustomExtension {
			customValue: string
			customMethod: () => string
		}

		const agent = new Agent<CustomExtension>({
			name: "Test Agent",
			model: mockModel,
			instructions: "Test",
			createRuntime: () => ({
				customValue: "extended",
				customMethod: () => "custom result"
			})
		})

		const context = await agent.createRuntimeContext(mockRuntime)

		expect(context.conversation.id).toBe("conv-1")
		expect(context.customValue).toBe("extended")
		expect(context.customMethod()).toBe("custom result")
	})

	it("should handle async createRuntime function", async () => {
		interface AsyncExtension {
			asyncData: string
		}

		const agent = new Agent<AsyncExtension>({
			name: "Test Agent",
			model: mockModel,
			instructions: "Test",
			createRuntime: async () => {
				await new Promise((resolve) => setTimeout(resolve, 10))
				return { asyncData: "loaded" }
			}
		})

		const context = await agent.createRuntimeContext(mockRuntime)

		expect(context.asyncData).toBe("loaded")
	})

	it("should pass base runtime to createRuntime function", async () => {
		const createRuntimeMock = vi.fn().mockReturnValue({ extended: true })

		const agent = new Agent({
			name: "Test Agent",
			model: mockModel,
			instructions: "Test",
			createRuntime: createRuntimeMock
		})

		await agent.createRuntimeContext(mockRuntime)

		expect(createRuntimeMock).toHaveBeenCalledWith(
			expect.objectContaining({
				conversation: expect.objectContaining({ id: "conv-1" }),
				message: expect.objectContaining({ id: "msg-1" })
			})
		)
	})

	it("should merge extension with base runtime without overwriting", async () => {
		const agent = new Agent({
			name: "Test Agent",
			model: mockModel,
			instructions: "Test",
			createRuntime: () => ({
				newProperty: "new value"
			})
		})

		const context = await agent.createRuntimeContext(mockRuntime)

		expect(context.conversation.id).toBe("conv-1")
		expect((context as unknown as Record<string, unknown>).newProperty).toBe(
			"new value"
		)
	})
})

describe("Agent getInstructions", () => {
	it("should return static instructions", async () => {
		const agent = new Agent({
			name: "Test Agent",
			model: mockModel,
			instructions: "Static instructions"
		})

		const instructions = await agent.getInstructions({ runtime: mockRuntime })

		expect(instructions).toBe("Static instructions")
	})

	it("should resolve dynamic instructions", async () => {
		const agent = new Agent({
			name: "Test Agent",
			model: mockModel,
			instructions: ({ runtime }) => `Conversation: ${runtime.conversation.id}`
		})

		const instructions = await agent.getInstructions({ runtime: mockRuntime })

		expect(instructions).toBe("Conversation: conv-1")
	})

	it("should resolve instructions with messages", async () => {
		const agent = new Agent({
			name: "Test Agent",
			model: mockModel,
			instructions: ({ messages }) => `Messages: ${messages.length}`
		})

		const testMessages: UIMessage[] = [
			{ role: "user", id: "1", parts: [{ type: "text", text: "Hi" }] },
			{ role: "user", id: "2", parts: [{ type: "text", text: "Hello" }] }
		]

		const instructions = await agent.getInstructions({
			runtime: mockRuntime,
			messages: testMessages
		})

		expect(instructions).toBe("Messages: 2")
	})
})

describe("Agent getTools", () => {
	it("should return static tools", async () => {
		const staticTools = {
			testTool: {
				description: "Test tool",
				inputSchema: {} as never,
				execute: async () => ({})
			}
		}

		const agent = new Agent({
			name: "Test Agent",
			model: mockModel,
			instructions: "Test",
			tools: staticTools
		})

		const tools = await agent.getTools({ runtime: mockRuntime })

		expect(tools).toBe(staticTools)
	})

	it("should resolve dynamic tools", async () => {
		const dynamicTools = {
			dynamicTool: {
				description: "Dynamic tool",
				inputSchema: {} as never,
				execute: async () => ({})
			}
		}

		const agent = new Agent({
			name: "Test Agent",
			model: mockModel,
			instructions: "Test",
			tools: () => dynamicTools
		})

		const tools = await agent.getTools({ runtime: mockRuntime })

		expect(tools).toEqual(dynamicTools)
	})

	it("should return undefined when no tools configured", async () => {
		const agent = new Agent({
			name: "Test Agent",
			model: mockModel,
			instructions: "Test"
		})

		const tools = await agent.getTools({ runtime: mockRuntime })

		expect(tools).toBeUndefined()
	})
})

describe("Agent getConfig", () => {
	it("should return config status", () => {
		const agent = new Agent({
			name: "Config Test Agent",
			model: mockModel,
			instructions: "Test instructions",
			tools: {}
		})

		const config = agent.getConfig()

		expect(config.name).toBe("Config Test Agent")
		expect(config.hasModel).toBe(true)
		expect(config.hasInstructions).toBe(true)
		expect(config.hasTools).toBe(true)
	})

	it("should report hasTools as false when no tools", () => {
		const agent = new Agent({
			name: "No Tools Agent",
			model: mockModel,
			instructions: "Test"
		})

		const config = agent.getConfig()

		expect(config.hasTools).toBe(false)
	})
})
