import type { LanguageModel, UIMessage } from "ai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { Agent, createTool } from "../src/index"

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

// Import mocked functions
import {
	convertToModelMessages,
	generateText,
	smoothStream,
	stepCountIs,
	streamText
} from "ai"

const mockGenerateText = vi.mocked(generateText)
const mockStreamText = vi.mocked(streamText)
const mockConvertToModelMessages = vi.mocked(convertToModelMessages)
const mockSmoothStream = vi.mocked(smoothStream)
const mockStepCountIs = vi.mocked(stepCountIs)

// Mock language model
const mockModel: LanguageModel = {
	modelId: "test-model",
	provider: "test-provider",
	specificationVersion: "v1",
	defaultObjectGenerationMode: "json",
	supportsImageUrls: false,
	doGenerate: vi.fn(),
	doStream: vi.fn()
} as unknown as LanguageModel

// Mock runtime matching AgentRuntime interface
const mockRuntime = {
	conversation: {
		id: "test-conversation",
		topic: "test-topic"
	},
	message: {
		id: "test-message-id",
		content: "test content",
		senderInboxId: "test-inbox"
	},
	xmtpClient: {
		sendMessage: vi.fn(),
		conversations: { list: vi.fn() }
	}
} as unknown as Parameters<typeof Agent.prototype.generate>[1]["runtime"]

// Sample test tools
const testTools = {
	greet: createTool({
		description: "Greet a user by name",
		inputSchema: z.object({
			name: z.string().describe("The name to greet")
		}),
		execute: async ({ input }) => {
			return { greeting: `Hello, ${input.name}!` }
		}
	}),
	calculate: createTool({
		description: "Perform a calculation",
		inputSchema: z.object({
			a: z.number(),
			b: z.number(),
			operation: z.enum(["add", "subtract", "multiply", "divide"])
		}),
		execute: async ({ input }) => {
			const { a, b, operation } = input
			switch (operation) {
				case "add":
					return { result: a + b }
				case "subtract":
					return { result: a - b }
				case "multiply":
					return { result: a * b }
				case "divide":
					return { result: a / b }
			}
		}
	})
}

describe("Agent AISDK Integration - generate()", () => {
	let agent: Agent

	beforeEach(() => {
		vi.clearAllMocks()

		agent = new Agent({
			name: "Test Agent",
			model: mockModel,
			tools: testTools,
			instructions: "You are a helpful assistant."
		})

		// Default mock implementation for generateText
		mockGenerateText.mockResolvedValue({
			text: "Hello! How can I help you?",
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

	it("should call generateText with correct model", async () => {
		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await agent.generate(messages, { runtime: mockRuntime })

		expect(mockGenerateText).toHaveBeenCalledTimes(1)
		expect(mockGenerateText).toHaveBeenCalledWith(
			expect.objectContaining({
				model: mockModel
			})
		)
	})

	it("should convert messages using convertToModelMessages", async () => {
		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await agent.generate(messages, { runtime: mockRuntime })

		expect(mockConvertToModelMessages).toHaveBeenCalled()
	})

	it("should pass system instructions as first message", async () => {
		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await agent.generate(messages, { runtime: mockRuntime })

		// Verify convertToModelMessages was called with messages that include system message
		const callArg = mockConvertToModelMessages.mock.calls[0][0] as UIMessage[]
		expect(callArg[0].role).toBe("system")
		expect(callArg[0].parts[0]).toEqual({
			type: "text",
			text: "You are a helpful assistant."
		})
	})

	it("should configure step limiting with stopWhen", async () => {
		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await agent.generate(messages, { runtime: mockRuntime })

		expect(mockStepCountIs).toHaveBeenCalledWith(5) // default maxSteps
		expect(mockGenerateText).toHaveBeenCalledWith(
			expect.objectContaining({
				stopWhen: expect.arrayContaining([
					expect.objectContaining({ type: "stepCount", count: 5 })
				])
			})
		)
	})

	it("should use custom maxSteps when configured", async () => {
		const customAgent = new Agent({
			name: "Custom Steps Agent",
			model: mockModel,
			tools: testTools,
			instructions: "Test",
			maxSteps: 10
		})

		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await customAgent.generate(messages, { runtime: mockRuntime })

		expect(mockStepCountIs).toHaveBeenCalledWith(10)
	})

	it("should set toolChoice to auto when tools are provided", async () => {
		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await agent.generate(messages, { runtime: mockRuntime })

		expect(mockGenerateText).toHaveBeenCalledWith(
			expect.objectContaining({
				toolChoice: "auto"
			})
		)
	})

	it("should set toolChoice to undefined when no tools provided", async () => {
		const noToolsAgent = new Agent({
			name: "No Tools Agent",
			model: mockModel,
			instructions: "Test"
		})

		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await noToolsAgent.generate(messages, { runtime: mockRuntime })

		expect(mockGenerateText).toHaveBeenCalledWith(
			expect.objectContaining({
				toolChoice: undefined
			})
		)
	})

	it("should convert tools to AISDK format", async () => {
		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await agent.generate(messages, { runtime: mockRuntime })

		const callArgs = mockGenerateText.mock.calls[0][0]
		expect(callArgs.tools).toBeDefined()
		expect(Object.keys(callArgs.tools ?? {})).toContain("greet")
		expect(Object.keys(callArgs.tools ?? {})).toContain("calculate")
	})

	it("should return the generateText result", async () => {
		const expectedResult = {
			text: "Test response",
			toolCalls: [],
			toolResults: [],
			finishReason: "stop" as const,
			usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
			warnings: [],
			steps: [],
			response: { id: "resp-2", modelId: "test-model" },
			request: {},
			responseMessages: []
		}
		mockGenerateText.mockResolvedValue(
			expectedResult as unknown as Awaited<ReturnType<typeof generateText>>
		)

		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		const result = await agent.generate(messages, { runtime: mockRuntime })

		expect(result.text).toBe("Test response")
		expect(result.finishReason).toBe("stop")
	})

	it("should pass maxTokens from options", async () => {
		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await agent.generate(messages, { runtime: mockRuntime, maxTokens: 1000 })

		expect(mockGenerateText).toHaveBeenCalledWith(
			expect.objectContaining({
				maxOutputTokens: 1000
			})
		)
	})

	it("should use temperature from agent config", async () => {
		const tempAgent = new Agent({
			name: "Temp Agent",
			model: mockModel,
			instructions: "Test",
			temperature: 0.7
		})

		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await tempAgent.generate(messages, { runtime: mockRuntime })

		expect(mockGenerateText).toHaveBeenCalledWith(
			expect.objectContaining({
				temperature: 0.7
			})
		)
	})

	it("should handle dynamic model resolution", async () => {
		const dynamicModelAgent = new Agent({
			name: "Dynamic Model Agent",
			model: ({ runtime }) => {
				expect(runtime).toBeDefined()
				return mockModel
			},
			instructions: "Test"
		})

		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await dynamicModelAgent.generate(messages, { runtime: mockRuntime })

		expect(mockGenerateText).toHaveBeenCalledWith(
			expect.objectContaining({
				model: mockModel
			})
		)
	})

	it("should handle dynamic instructions resolution", async () => {
		const dynamicInstructionsAgent = new Agent({
			name: "Dynamic Instructions Agent",
			model: mockModel,
			instructions: ({ messages, runtime }) => {
				return `Dynamic instructions for conversation ${runtime.conversation.id} with ${messages.length} messages`
			}
		})

		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await dynamicInstructionsAgent.generate(messages, { runtime: mockRuntime })

		const callArg = mockConvertToModelMessages.mock.calls[0][0] as UIMessage[]
		expect(callArg[0].parts[0]).toEqual({
			type: "text",
			text: expect.stringContaining(
				"Dynamic instructions for conversation test-conversation"
			)
		})
	})

	it("should handle dynamic tools resolution", async () => {
		const dynamicToolsAgent = new Agent({
			name: "Dynamic Tools Agent",
			model: mockModel,
			instructions: "Test",
			tools: ({ runtime }) => {
				if (runtime.conversation.id === "test-conversation") {
					return testTools
				}
				return {}
			}
		})

		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await dynamicToolsAgent.generate(messages, { runtime: mockRuntime })

		const callArgs = mockGenerateText.mock.calls[0][0]
		expect(callArgs.tools).toBeDefined()
		expect(Object.keys(callArgs.tools ?? {})).toContain("greet")
	})

	it("should merge instructions with existing system message", async () => {
		const messages: UIMessage[] = [
			{
				role: "system",
				id: "sys-1",
				parts: [{ type: "text", text: "Existing system message" }]
			},
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await agent.generate(messages, { runtime: mockRuntime })

		const callArg = mockConvertToModelMessages.mock.calls[0][0] as UIMessage[]
		// Should replace the existing system message content with instructions
		expect(callArg[0].role).toBe("system")
		expect(callArg[0].parts[0]).toEqual({
			type: "text",
			text: "You are a helpful assistant."
		})
		// User message should still be present
		expect(callArg[1].role).toBe("user")
	})
})

describe("Agent AISDK Integration - stream()", () => {
	let agent: Agent

	beforeEach(() => {
		vi.clearAllMocks()

		agent = new Agent({
			name: "Test Agent",
			model: mockModel,
			tools: testTools,
			instructions: "You are a helpful assistant."
		})

		// Mock streamText to return a result with toUIMessageStreamResponse
		const mockStreamResult = {
			textStream: (async function* () {
				yield "Hello"
				yield " world"
			})(),
			toUIMessageStreamResponse: vi.fn().mockReturnValue(
				new Response("streaming response", {
					headers: { "Content-Type": "text/event-stream" }
				})
			)
		}
		mockStreamText.mockResolvedValue(
			mockStreamResult as unknown as Awaited<ReturnType<typeof streamText>>
		)
	})

	it("should call streamText with correct model", async () => {
		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await agent.stream(messages, { runtime: mockRuntime })

		expect(mockStreamText).toHaveBeenCalledTimes(1)
		expect(mockStreamText).toHaveBeenCalledWith(
			expect.objectContaining({
				model: mockModel
			})
		)
	})

	it("should use smoothStream transform", async () => {
		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await agent.stream(messages, { runtime: mockRuntime })

		expect(mockSmoothStream).toHaveBeenCalled()
		expect(mockStreamText).toHaveBeenCalledWith(
			expect.objectContaining({
				experimental_transform: expect.anything()
			})
		)
	})

	it("should configure step limiting for streaming", async () => {
		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await agent.stream(messages, { runtime: mockRuntime })

		expect(mockStepCountIs).toHaveBeenCalledWith(5)
		expect(mockStreamText).toHaveBeenCalledWith(
			expect.objectContaining({
				stopWhen: expect.arrayContaining([
					expect.objectContaining({ type: "stepCount", count: 5 })
				])
			})
		)
	})

	it("should call toUIMessageStreamResponse with original messages", async () => {
		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await agent.stream(messages, { runtime: mockRuntime })

		const streamResult = await mockStreamText.mock.results[0].value
		expect(streamResult.toUIMessageStreamResponse).toHaveBeenCalledWith(
			expect.objectContaining({
				originalMessages: messages
			})
		)
	})

	it("should pass onFinish callback to toUIMessageStreamResponse", async () => {
		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]
		const onFinish = vi.fn()

		await agent.stream(messages, { runtime: mockRuntime, onFinish })

		const streamResult = await mockStreamText.mock.results[0].value
		expect(streamResult.toUIMessageStreamResponse).toHaveBeenCalledWith(
			expect.objectContaining({
				onFinish
			})
		)
	})

	it("should return a Response object", async () => {
		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		const result = await agent.stream(messages, { runtime: mockRuntime })

		expect(result).toBeInstanceOf(Response)
	})

	it("should convert tools to AISDK format for streaming", async () => {
		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await agent.stream(messages, { runtime: mockRuntime })

		const callArgs = mockStreamText.mock.calls[0][0]
		expect(callArgs.tools).toBeDefined()
		expect(Object.keys(callArgs.tools ?? {})).toContain("greet")
		expect(Object.keys(callArgs.tools ?? {})).toContain("calculate")
	})

	it("should set toolChoice to auto when tools are provided", async () => {
		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await agent.stream(messages, { runtime: mockRuntime })

		expect(mockStreamText).toHaveBeenCalledWith(
			expect.objectContaining({
				toolChoice: "auto"
			})
		)
	})
})

describe("Agent AISDK Integration - Error Handling", () => {
	let agent: Agent
	let mockErrorHandler: ReturnType<typeof vi.fn>

	beforeEach(() => {
		vi.clearAllMocks()
		mockErrorHandler = vi.fn()

		agent = new Agent({
			name: "Test Agent",
			model: mockModel,
			instructions: "Test",
			onError: mockErrorHandler
		})
	})

	it("should call onError handler when generateText throws", async () => {
		const testError = new Error("AISDK Error")
		mockGenerateText.mockRejectedValue(testError)

		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await expect(
			agent.generate(messages, { runtime: mockRuntime })
		).rejects.toThrow("AISDK Error")

		expect(mockErrorHandler).toHaveBeenCalledWith(testError)
	})

	it("should call onError handler when streamText throws", async () => {
		const testError = new Error("Stream Error")
		mockStreamText.mockRejectedValue(testError)

		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await expect(
			agent.stream(messages, { runtime: mockRuntime })
		).rejects.toThrow("Stream Error")

		expect(mockErrorHandler).toHaveBeenCalledWith(testError)
	})

	it("should re-throw error after calling onError", async () => {
		const testError = new Error("Re-throw Test")
		mockGenerateText.mockRejectedValue(testError)

		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await expect(
			agent.generate(messages, { runtime: mockRuntime })
		).rejects.toThrow(testError)
	})

	it("should handle async onError handler", async () => {
		const asyncErrorHandler = vi.fn().mockResolvedValue(undefined)
		const asyncAgent = new Agent({
			name: "Async Error Agent",
			model: mockModel,
			instructions: "Test",
			onError: asyncErrorHandler
		})

		const testError = new Error("Async Error Test")
		mockGenerateText.mockRejectedValue(testError)

		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await expect(
			asyncAgent.generate(messages, { runtime: mockRuntime })
		).rejects.toThrow()

		expect(asyncErrorHandler).toHaveBeenCalledWith(testError)
	})

	it("should convert non-Error objects to Error", async () => {
		mockGenerateText.mockRejectedValue("string error")

		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		await expect(
			agent.generate(messages, { runtime: mockRuntime })
		).rejects.toThrow("string error")

		expect(mockErrorHandler).toHaveBeenCalledWith(expect.any(Error))
	})
})

describe("Agent AISDK Integration - Tool Execution", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should execute tools with correct runtime context", async () => {
		const executeSpy = vi.fn().mockResolvedValue({ greeting: "Hello!" })
		const spyTools = {
			greet: createTool({
				description: "Greet",
				inputSchema: z.object({ name: z.string() }),
				execute: executeSpy
			})
		}

		const agent = new Agent({
			name: "Tool Execution Agent",
			model: mockModel,
			tools: spyTools,
			instructions: "Test"
		})

		// Mock generateText to call the tool
		mockGenerateText.mockImplementation(async (options) => {
			// Simulate calling the tool with required AISDK options
			const toolOptions = { toolCallId: "tc-1", messages: [] }
			const toolResult = await options.tools?.greet.execute?.(
				{ name: "World" },
				toolOptions
			)
			return {
				text: "Greeted!",
				toolCalls: [{ toolName: "greet", args: { name: "World" } }],
				toolResults: [toolResult],
				finishReason: "stop",
				usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
				warnings: [],
				steps: [],
				response: { id: "resp-1", modelId: "test-model" },
				request: {},
				responseMessages: []
			} as unknown as Awaited<ReturnType<typeof generateText>>
		})

		const messages: UIMessage[] = [
			{
				role: "user",
				id: "msg-1",
				parts: [{ type: "text", text: "Greet World" }]
			}
		]

		await agent.generate(messages, { runtime: mockRuntime })

		expect(executeSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				input: { name: "World" },
				runtime: expect.objectContaining({
					conversation: expect.objectContaining({ id: "test-conversation" })
				}),
				messages: expect.any(Array)
			})
		)
	})

	it("should pass messages to tool execute function", async () => {
		const executeSpy = vi.fn().mockResolvedValue({ result: "done" })
		const spyTools = {
			contextTool: createTool({
				description: "Context aware tool",
				inputSchema: z.object({}),
				execute: executeSpy
			})
		}

		const agent = new Agent({
			name: "Context Tool Agent",
			model: mockModel,
			tools: spyTools,
			instructions: "Test"
		})

		mockGenerateText.mockImplementation(async (options) => {
			const toolOptions = { toolCallId: "tc-1", messages: [] }
			await options.tools?.contextTool.execute?.({}, toolOptions)
			return {
				text: "Done",
				toolCalls: [],
				toolResults: [],
				finishReason: "stop",
				usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
				warnings: [],
				steps: [],
				response: { id: "resp-1", modelId: "test-model" },
				request: {},
				responseMessages: []
			} as unknown as Awaited<ReturnType<typeof generateText>>
		})

		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Use tool" }] }
		]

		await agent.generate(messages, { runtime: mockRuntime })

		expect(executeSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				messages: expect.arrayContaining([
					expect.objectContaining({
						role: "system"
					}),
					expect.objectContaining({
						role: "user"
					})
				])
			})
		)
	})
})

describe("Agent AISDK Integration - Response Format", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should return complete AISDK response with all fields", async () => {
		const agent = new Agent({
			name: "Response Format Agent",
			model: mockModel,
			instructions: "Test"
		})

		const mockResponse = {
			text: "Hello!",
			toolCalls: [
				{ toolCallId: "tc-1", toolName: "greet", args: { name: "World" } }
			],
			toolResults: [{ toolCallId: "tc-1", result: { greeting: "Hello!" } }],
			finishReason: "stop" as const,
			usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
			warnings: [],
			steps: [
				{
					stepType: "initial" as const,
					text: "Hello!",
					toolCalls: [],
					toolResults: [],
					finishReason: "stop" as const,
					usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
				}
			],
			response: { id: "resp-1", modelId: "test-model", timestamp: new Date() },
			request: { body: "{}" },
			responseMessages: []
		}
		mockGenerateText.mockResolvedValue(
			mockResponse as unknown as Awaited<ReturnType<typeof generateText>>
		)

		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		const result = await agent.generate(messages, { runtime: mockRuntime })

		expect(result.text).toBe("Hello!")
		expect(result.finishReason).toBe("stop")
		expect(result.usage).toEqual({
			promptTokens: 10,
			completionTokens: 20,
			totalTokens: 30
		})
		expect(result.toolCalls).toHaveLength(1)
		expect(result.steps).toHaveLength(1)
	})

	it("should handle empty response text", async () => {
		const agent = new Agent({
			name: "Empty Response Agent",
			model: mockModel,
			instructions: "Test"
		})

		mockGenerateText.mockResolvedValue({
			text: "",
			toolCalls: [],
			toolResults: [],
			finishReason: "stop",
			usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 },
			warnings: [],
			steps: [],
			response: { id: "resp-1", modelId: "test-model" },
			request: {},
			responseMessages: []
		} as unknown as Awaited<ReturnType<typeof generateText>>)

		const messages: UIMessage[] = [
			{ role: "user", id: "msg-1", parts: [{ type: "text", text: "Hello" }] }
		]

		const result = await agent.generate(messages, { runtime: mockRuntime })

		expect(result.text).toBe("")
	})

	it("should handle tool-only responses", async () => {
		const agent = new Agent({
			name: "Tool Only Agent",
			model: mockModel,
			tools: testTools,
			instructions: "Test"
		})

		mockGenerateText.mockResolvedValue({
			text: "",
			toolCalls: [
				{ toolCallId: "tc-1", toolName: "greet", args: { name: "World" } }
			],
			toolResults: [
				{ toolCallId: "tc-1", result: { greeting: "Hello, World!" } }
			],
			finishReason: "tool-calls",
			usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
			warnings: [],
			steps: [],
			response: { id: "resp-1", modelId: "test-model" },
			request: {},
			responseMessages: []
		} as unknown as Awaited<ReturnType<typeof generateText>>)

		const messages: UIMessage[] = [
			{
				role: "user",
				id: "msg-1",
				parts: [{ type: "text", text: "Greet World" }]
			}
		]

		const result = await agent.generate(messages, { runtime: mockRuntime })

		expect(result.text).toBe("")
		expect(result.finishReason).toBe("tool-calls")
		expect(result.toolCalls).toHaveLength(1)
	})
})
