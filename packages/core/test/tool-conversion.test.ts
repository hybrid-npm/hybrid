import type { AgentRuntime, DefaultRuntimeExtension, Tool } from "@hybrd/types"
import type { ToolExecutionOptions, UIMessage } from "ai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { createTool, toAISDKTool, toAISDKTools } from "../src/core/tool"

// Mock runtime for testing - cast through unknown to satisfy type requirements
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
		sendMessage: vi.fn()
	}
} as unknown as AgentRuntime & DefaultRuntimeExtension

const mockMessages: UIMessage[] = [
	{
		role: "user",
		id: "msg-1",
		parts: [{ type: "text", text: "Hello" }]
	}
]

const mockToolOptions: ToolExecutionOptions = {
	toolCallId: "test-tool-call-id",
	messages: []
}

describe("toAISDKTool", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should convert tool with correct description", () => {
		const tool = createTool({
			description: "A test tool that does something",
			inputSchema: z.object({ value: z.string() }),
			execute: async () => ({ result: "done" })
		})

		const aiSdkTool = toAISDKTool(tool, mockRuntime, mockMessages)

		expect(aiSdkTool.description).toBe("A test tool that does something")
	})

	it("should preserve inputSchema", () => {
		const inputSchema = z.object({
			name: z.string().describe("User name"),
			age: z.number().optional()
		})

		const tool = createTool({
			description: "Test tool",
			inputSchema,
			execute: async () => ({})
		})

		const aiSdkTool = toAISDKTool(tool, mockRuntime, mockMessages)

		expect(aiSdkTool.inputSchema).toBe(inputSchema)
	})

	it("should wrap execute function with runtime context", async () => {
		const executeMock = vi.fn().mockResolvedValue({ result: "success" })

		const tool = createTool({
			description: "Test tool",
			inputSchema: z.object({ input: z.string() }),
			execute: executeMock
		})

		const aiSdkTool = toAISDKTool(tool, mockRuntime, mockMessages)

		await aiSdkTool.execute?.({ input: "test-value" }, mockToolOptions)

		expect(executeMock).toHaveBeenCalledWith({
			input: { input: "test-value" },
			runtime: mockRuntime,
			messages: mockMessages
		})
	})

	it("should return execute result", async () => {
		const expectedResult = { data: "test", success: true }

		const tool = createTool({
			description: "Test tool",
			inputSchema: z.object({}),
			execute: async () => expectedResult
		})

		const aiSdkTool = toAISDKTool(tool, mockRuntime, mockMessages)

		const result = await aiSdkTool.execute?.({}, mockToolOptions)

		expect(result).toEqual(expectedResult)
	})

	it("should handle complex input schemas", async () => {
		const executeMock = vi.fn().mockResolvedValue({ calculated: 42 })

		const tool = createTool({
			description: "Complex calculation tool",
			inputSchema: z.object({
				numbers: z.array(z.number()),
				operation: z.enum(["sum", "average", "max", "min"]),
				options: z
					.object({
						precision: z.number().optional(),
						roundUp: z.boolean().default(false)
					})
					.optional()
			}),
			execute: executeMock
		})

		const aiSdkTool = toAISDKTool(tool, mockRuntime, mockMessages)

		const input = {
			numbers: [1, 2, 3],
			operation: "sum" as const,
			options: { precision: 2 }
		}

		await aiSdkTool.execute?.(input, mockToolOptions)

		expect(executeMock).toHaveBeenCalledWith({
			input: {
				...input,
				options: { precision: 2, roundUp: false }
			},
			runtime: mockRuntime,
			messages: mockMessages
		})
	})

	it("should handle async execute functions", async () => {
		const tool = createTool({
			description: "Async tool",
			inputSchema: z.object({}),
			execute: async () => {
				await new Promise((resolve) => setTimeout(resolve, 10))
				return { delayed: true }
			}
		})

		const aiSdkTool = toAISDKTool(tool, mockRuntime, mockMessages)

		const result = await aiSdkTool.execute?.({}, mockToolOptions)

		expect(result).toEqual({ delayed: true })
	})

	it("should propagate errors from execute", async () => {
		const tool = createTool({
			description: "Error tool",
			inputSchema: z.object({}),
			execute: async () => {
				throw new Error("Tool execution failed")
			}
		})

		const aiSdkTool = toAISDKTool(tool, mockRuntime, mockMessages)

		await expect(aiSdkTool.execute?.({}, mockToolOptions)).rejects.toThrow(
			"Tool execution failed"
		)
	})
})

describe("toAISDKTools", () => {
	it("should convert multiple tools", () => {
		const tools = {
			tool1: createTool({
				description: "First tool",
				inputSchema: z.object({ a: z.string() }),
				execute: async () => ({ first: true })
			}),
			tool2: createTool({
				description: "Second tool",
				inputSchema: z.object({ b: z.number() }),
				execute: async () => ({ second: true })
			})
		}

		const aiSdkTools = toAISDKTools(tools, mockRuntime, mockMessages)

		expect(Object.keys(aiSdkTools)).toHaveLength(2)
		expect(aiSdkTools.tool1).toBeDefined()
		expect(aiSdkTools.tool2).toBeDefined()
	})

	it("should preserve tool names as keys", () => {
		const tools = {
			sendMessage: createTool({
				description: "Send a message",
				inputSchema: z.object({ content: z.string() }),
				execute: async () => ({})
			}),
			fetchData: createTool({
				description: "Fetch data",
				inputSchema: z.object({ url: z.string() }),
				execute: async () => ({})
			})
		}

		const aiSdkTools = toAISDKTools(tools, mockRuntime, mockMessages)

		expect(aiSdkTools).toHaveProperty("sendMessage")
		expect(aiSdkTools).toHaveProperty("fetchData")
	})

	it("should convert each tool with correct runtime context", async () => {
		const execute1 = vi.fn().mockResolvedValue({ tool: 1 })
		const execute2 = vi.fn().mockResolvedValue({ tool: 2 })

		const tools = {
			tool1: createTool({
				description: "Tool 1",
				inputSchema: z.object({ x: z.string() }),
				execute: execute1
			}),
			tool2: createTool({
				description: "Tool 2",
				inputSchema: z.object({ y: z.number() }),
				execute: execute2
			})
		}

		const aiSdkTools = toAISDKTools(tools, mockRuntime, mockMessages)

		await aiSdkTools.tool1.execute?.({ x: "test" }, mockToolOptions)
		await aiSdkTools.tool2.execute?.({ y: 42 }, mockToolOptions)

		expect(execute1).toHaveBeenCalledWith({
			input: { x: "test" },
			runtime: mockRuntime,
			messages: mockMessages
		})
		expect(execute2).toHaveBeenCalledWith({
			input: { y: 42 },
			runtime: mockRuntime,
			messages: mockMessages
		})
	})

	it("should handle empty tools object", () => {
		const aiSdkTools = toAISDKTools({}, mockRuntime, mockMessages)

		expect(aiSdkTools).toEqual({})
		expect(Object.keys(aiSdkTools)).toHaveLength(0)
	})

	it("should convert tools with ZodEffects (refined schemas)", () => {
		const refinedSchema = z
			.object({
				recipientAddress: z.string().optional(),
				conversationId: z.string().optional(),
				content: z.string()
			})
			.refine(
				(data) => data.recipientAddress || data.conversationId,
				"Either recipientAddress or conversationId is required"
			)

		const tool: Tool<
			typeof refinedSchema,
			z.ZodTypeAny,
			DefaultRuntimeExtension
		> = {
			description: "Tool with refined schema",
			inputSchema: refinedSchema,
			execute: async () => ({ sent: true })
		}

		const tools = { refinedTool: tool }
		const aiSdkTools = toAISDKTools(tools, mockRuntime, mockMessages)

		expect(aiSdkTools.refinedTool).toBeDefined()
		expect(aiSdkTools.refinedTool.inputSchema).toBe(refinedSchema)
	})
})

describe("createTool (toolFactory)", () => {
	it("should create a tool with all required properties", () => {
		const tool = createTool({
			description: "Test tool",
			inputSchema: z.object({ value: z.string() }),
			execute: async () => ({ result: "done" })
		})

		expect(tool.description).toBe("Test tool")
		expect(tool.inputSchema).toBeDefined()
		expect(typeof tool.execute).toBe("function")
	})

	it("should validate input with inputSchema before execute", async () => {
		const executeMock = vi.fn().mockResolvedValue({ result: "success" })

		const tool = createTool({
			description: "Validated tool",
			inputSchema: z.object({
				name: z.string().min(1),
				count: z.number().positive()
			}),
			execute: executeMock
		})

		await tool.execute({
			input: { name: "test", count: 5 },
			runtime: mockRuntime,
			messages: mockMessages
		})

		expect(executeMock).toHaveBeenCalledWith({
			input: { name: "test", count: 5 },
			runtime: mockRuntime,
			messages: mockMessages
		})
	})

	it("should throw on invalid input", async () => {
		const tool = createTool({
			description: "Strict tool",
			inputSchema: z.object({
				email: z.string().email()
			}),
			execute: async () => ({})
		})

		await expect(
			tool.execute({
				input: { email: "invalid-email" },
				runtime: mockRuntime,
				messages: mockMessages
			})
		).rejects.toThrow()
	})

	it("should validate output with outputSchema when provided", async () => {
		const tool = createTool({
			description: "Output validated tool",
			inputSchema: z.object({}),
			outputSchema: z.object({
				success: z.boolean(),
				data: z.string()
			}),
			execute: async () => ({ success: true, data: "result" })
		})

		const result = await tool.execute({
			input: {},
			runtime: mockRuntime,
			messages: mockMessages
		})

		expect(result).toEqual({ success: true, data: "result" })
	})

	it("should support optional outputSchema", async () => {
		const tool = createTool({
			description: "No output schema tool",
			inputSchema: z.object({}),
			execute: async () => ({ anything: "goes", nested: { value: 123 } })
		})

		const result = await tool.execute({
			input: {},
			runtime: mockRuntime,
			messages: mockMessages
		})

		expect(result).toEqual({ anything: "goes", nested: { value: 123 } })
	})
})

describe("Tool Runtime Extension Support", () => {
	interface CustomRuntime {
		customService: {
			doSomething: () => Promise<string>
		}
	}

	it("should pass extended runtime to tool execute", async () => {
		const customService = {
			doSomething: vi.fn().mockResolvedValue("custom result")
		}

		const extendedRuntime = {
			...mockRuntime,
			customService
		} as unknown as AgentRuntime & CustomRuntime

		const tool = createTool({
			description: "Extended runtime tool",
			inputSchema: z.object({}),
			execute: async ({ runtime }) => {
				const typedRuntime =
					runtime as unknown as AgentRuntime & CustomRuntime
				const result = await typedRuntime.customService.doSomething()
				return { result }
			}
		})

		const aiSdkTool = toAISDKTool(
			tool,
			extendedRuntime as unknown as AgentRuntime & DefaultRuntimeExtension,
			mockMessages
		)
		const result = await aiSdkTool.execute?.({}, mockToolOptions)

		expect(customService.doSomething).toHaveBeenCalled()
		expect(result).toEqual({ result: "custom result" })
	})
})
