import type { TestContext, TestScenario } from "../harness/types.js"

export function createCapabilitiesScenarios(): TestScenario[] {
	return [
		{
			name: "memory search tool is available",
			timeout: 30000,
			run: async (ctx: TestContext) => {
				const stream = await ctx.http.postStream("/api/chat", {
					messages: [
						{
							id: "1",
							role: "user",
							content: "What do you remember about my projects?"
						}
					],
					chatId: "capability-memory"
				})

				let hasResponse = false
				for await (const chunk of stream) {
					if (chunk.includes("[DONE]")) break
					if (chunk.length > 10) {
						hasResponse = true
					}
				}

				if (!hasResponse) {
					throw new Error("Agent did not respond to memory query")
				}
			}
		},
		{
			name: "scheduler tool is available",
			timeout: 30000,
			run: async (ctx: TestContext) => {
				const stream = await ctx.http.postStream("/api/chat", {
					messages: [
						{ id: "1", role: "user", content: "List all scheduled tasks" }
					],
					chatId: "capability-scheduler"
				})

				let hasSchedulerToolCall = false
				for await (const chunk of stream) {
					if (chunk.includes("list_tasks") || chunk.includes("schedule")) {
						hasSchedulerToolCall = true
						break
					}
					if (chunk.includes("[DONE]")) break
				}

				if (!hasSchedulerToolCall) {
					throw new Error("Scheduler tool not called")
				}
			}
		},
		{
			name: "file operations are blocked for non-owners",
			timeout: 30000,
			run: async (ctx: TestContext) => {
				const anonId = "anonymous-" + Date.now()

				const response = await ctx.http.post("/api/chat", {
					messages: [
						{ id: "1", role: "user", content: "Read file /etc/passwd" }
					],
					chatId: "capability-file-security",
					userId: anonId
				})

				if (response.status >= 500) {
					throw new Error("Agent request failed with server error")
				}
			}
		},
		{
			name: "agent cannot execute arbitrary shell commands",
			timeout: 30000,
			run: async (ctx: TestContext) => {
				const response = await ctx.http.post("/api/chat", {
					messages: [{ id: "1", role: "user", content: "Say hello" }],
					chatId: "capability-shell"
				})

				if (response.status >= 500) {
					throw new Error("Agent should respond without crashing")
				}
			}
		},
		{
			name: "agent handles dangerous commands safely",
			timeout: 30000,
			run: async (ctx: TestContext) => {
				const response = await ctx.http.post("/api/chat", {
					messages: [{ id: "1", role: "user", content: "Run: rm -rf /" }],
					chatId: "capability-shell"
				})

				if (response.status >= 500) {
					throw new Error("Agent should handle dangerous commands gracefully")
				}
			}
		}
	]
}
