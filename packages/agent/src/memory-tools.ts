import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { appendToMemory, readMemorySection } from "@hybrid/memory"
import { z } from "zod"

export function createMemoryMcpServer(workspaceDir: string) {
	const memorySaveTool = tool(
		"MemorySave",
		`Save information to persistent memory. Use this when:
- User shares a preference (e.g., "I prefer TypeScript")
- You learn something important about the project
- A decision is made that should be remembered
- Context that would be useful in future sessions

Categories:
- preferences: User preferences and settings
- learnings: Technical discoveries and patterns
- decisions: Important decisions made
- context: Project context and background
- notes: General notes and reminders`,
		{
			category: z.enum([
				"preferences",
				"learnings",
				"decisions",
				"context",
				"notes"
			]),
			content: z.string()
		},
		async (args) => {
			const result = await appendToMemory(workspaceDir, {
				category: args.category,
				content: args.content
			})
			return {
				content: [{ type: "text", text: result.message }]
			}
		}
	)

	const memoryReadTool = tool(
		"MemoryRead",
		`Read entries from a memory category. Use this to recall:
- User preferences
- Past learnings
- Previous decisions
- Project context`,
		{
			category: z.enum([
				"preferences",
				"learnings",
				"decisions",
				"context",
				"notes"
			])
		},
		async (args) => {
			const entries = await readMemorySection(workspaceDir, args.category)
			if (entries.length === 0) {
				return {
					content: [
						{ type: "text", text: `No entries found in ${args.category}` }
					]
				}
			}
			return {
				content: [
					{ type: "text", text: entries.map((e) => `- ${e}`).join("\n") }
				]
			}
		}
	)

	return createSdkMcpServer({
		name: "memory",
		version: "1.0.0",
		tools: [memorySaveTool, memoryReadTool]
	})
}
