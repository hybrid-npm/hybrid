import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import {
	type ACL,
	type Role,
	addOwner,
	appendToMemory,
	getRole,
	listOwners,
	parseACL,
	readMemorySection,
	removeOwner
} from "@hybrid/memory"
import { z } from "zod"

export function createMemoryMcpServer(
	workspaceDir: string,
	userId: string,
	role: Role,
	acl: ACL | null
) {
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
			const result = await appendToMemory(
				workspaceDir,
				{
					category: args.category,
					content: args.content
				},
				userId,
				role
			)
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
			const entries = await readMemorySection(
				workspaceDir,
				args.category,
				userId,
				role
			)
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

	const aclAddOwnerTool = tool(
		"ACLAddOwner",
		`Add a wallet address as an owner. Owners have full access to all memory sources.
Only current owners can use this tool.
Wallet address must be a full Ethereum address (0x + 40 hex characters).`,
		{
			walletAddress: z.string().describe("Full Ethereum wallet address (0x...)")
		},
		async (args) => {
			if (role !== "owner") {
				return {
					content: [
						{
							type: "text",
							text: "Permission denied: Only owners can add new owners"
						}
					],
					isError: true
				}
			}

			try {
				const result = await addOwner(workspaceDir, args.walletAddress)
				return {
					content: [{ type: "text", text: result.message }]
				}
			} catch (err) {
				return {
					content: [
						{
							type: "text",
							text: `Error: ${(err as Error).message}`
						}
					],
					isError: true
				}
			}
		}
	)

	const aclRemoveOwnerTool = tool(
		"ACLRemoveOwner",
		`Remove a wallet address from owners.
Only current owners can use this tool.
Wallet address must be a full Ethereum address (0x + 40 hex characters).`,
		{
			walletAddress: z.string().describe("Full Ethereum wallet address (0x...)")
		},
		async (args) => {
			if (role !== "owner") {
				return {
					content: [
						{
							type: "text",
							text: "Permission denied: Only owners can remove owners"
						}
					],
					isError: true
				}
			}

			try {
				const result = await removeOwner(workspaceDir, args.walletAddress)
				return {
					content: [{ type: "text", text: result.message }]
				}
			} catch (err) {
				return {
					content: [
						{
							type: "text",
							text: `Error: ${(err as Error).message}`
						}
					],
					isError: true
				}
			}
		}
	)

	const aclListOwnersTool = tool(
		"ACLListOwners",
		"List all wallet addresses that have owner role.",
		{},
		async () => {
			const owners = listOwners(acl)
			if (owners.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: "No owners configured. Everyone is a guest."
						}
					]
				}
			}
			return {
				content: [
					{
						type: "text",
						text: `Owners:\n${owners.map((o) => `- ${o}`).join("\n")}`
					}
				]
			}
		}
	)

	return createSdkMcpServer({
		name: "memory",
		version: "1.0.0",
		tools: [
			memorySaveTool,
			memoryReadTool,
			aclAddOwnerTool,
			aclRemoveOwnerTool,
			aclListOwnersTool
		]
	})
}

export function resolveUserRole(
	workspaceDir: string,
	userId: string | undefined
): { role: Role; acl: ACL | null } {
	const acl = parseACL(workspaceDir)

	if (!userId) {
		return { role: "guest", acl }
	}

	const role = getRole(acl, userId)
	return { role, acl }
}
