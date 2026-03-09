import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import {
	type ACL,
	type FactCategory,
	type ParaBucket,
	type Role,
	addFact,
	addOwner,
	appendToMemory,
	approveACLPairingCode,
	createEntity,
	getRole,
	listACLPendingRequests,
	listOwners,
	logDecision,
	logFact,
	parseACL,
	readMemorySection,
	rejectACLPairingCode,
	removeOwner,
	searchFacts,
	upsertACLPendingRequest
} from "@hybrid/memory"
import { z } from "zod"
import { createFileTools } from "./tools/file.js"

export function createMemoryMcpServer(
	workspaceDir: string,
	userId: string,
	role: Role,
	acl: ACL | null,
	projectRoot: string
) {
	const memorySaveTool = tool(
		"MemorySave",
		`Save information to THIS USER's persistent memory. Use this when the user asks you to remember something.

This writes to memory/users/{userId}/MEMORY.md - each user has their own private memory.

Use for:
- User preferences ("I prefer dark mode")
- Personal facts ("My birthday is June 15")
- Anything user says to "remember this" or "remember that"
- Notes specific to this user

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

	const aclRequestPairingTool = tool(
		"ACLRequestPairing",
		`Request pairing to become an owner. Generates a pairing code that must be approved by an existing owner.

Use this when:
- You want to request owner access
- You're a guest and need elevated permissions

The pairing code expires in 1 hour. Share it with an owner for approval.`,
		{},
		async () => {
			if (!userId) {
				return {
					content: [
						{
							type: "text",
							text: "Cannot request pairing: no user identity available"
						}
					],
					isError: true
				}
			}

			if (role === "owner") {
				return {
					content: [
						{
							type: "text",
							text: "You are already an owner"
						}
					]
				}
			}

			try {
				const result = await upsertACLPendingRequest(workspaceDir, userId)
				if (!result.code) {
					return {
						content: [
							{
								type: "text",
								text: "Too many pending requests. Wait for one to expire or be processed."
							}
						],
						isError: true
					}
				}
				return {
					content: [
						{
							type: "text",
							text: `Pairing requested.\n\nYour code: \`${result.code}\`\n\nShare this code with an owner for approval. Code expires in 1 hour.`
						}
					]
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

	const aclListPendingTool = tool(
		"ACLListPending",
		"List pending pairing requests. Only owners can use this tool.",
		{},
		async () => {
			if (role !== "owner") {
				return {
					content: [
						{
							type: "text",
							text: "Permission denied: Only owners can list pending requests"
						}
					],
					isError: true
				}
			}

			try {
				const requests = await listACLPendingRequests(workspaceDir)
				if (requests.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "No pending pairing requests"
							}
						]
					}
				}

				const lines = requests.map(
					(r) => `- Code: ${r.code} | ID: ${r.id} | Requested: ${r.createdAt}`
				)
				return {
					content: [
						{
							type: "text",
							text: `Pending Requests:\n${lines.join("\n")}`
						}
					]
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

	const aclApprovePairingTool = tool(
		"ACLApprovePairing",
		`Approve a pairing request by code. Only owners can use this tool.

Use this when:
- A user has shared their pairing code with you
- You want to grant owner access to someone`,
		{
			code: z.string().describe("8-character pairing code (e.g., ABCD1234)")
		},
		async (args) => {
			if (role !== "owner") {
				return {
					content: [
						{
							type: "text",
							text: "Permission denied: Only owners can approve pairing requests"
						}
					],
					isError: true
				}
			}

			try {
				const result = await approveACLPairingCode(
					workspaceDir,
					args.code.toUpperCase()
				)
				if (!result) {
					return {
						content: [
							{
								type: "text",
								text: "Invalid or expired pairing code"
							}
						],
						isError: true
					}
				}
				return {
					content: [
						{
							type: "text",
							text: `Approved! ${result.id} is now an owner.`
						}
					]
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

	const aclRejectPairingTool = tool(
		"ACLRejectPairing",
		`Reject a pairing request by code. Only owners can use this tool.

Use this when:
- A pairing request should be denied
- You want to remove a pending request without approving it`,
		{
			code: z.string().describe("8-character pairing code (e.g., ABCD1234)")
		},
		async (args) => {
			if (role !== "owner") {
				return {
					content: [
						{
							type: "text",
							text: "Permission denied: Only owners can reject pairing requests"
						}
					],
					isError: true
				}
			}

			try {
				const result = await rejectACLPairingCode(
					workspaceDir,
					args.code.toUpperCase()
				)
				if (!result) {
					return {
						content: [
							{
								type: "text",
								text: "Invalid or expired pairing code"
							}
						],
						isError: true
					}
				}
				return {
					content: [
						{
							type: "text",
							text: `Rejected pairing request from ${result.id}`
						}
					]
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

	// PARA Tools (Layer 1 - Knowledge Graph)

	const paraCreateEntityTool = tool(
		"PARACreateEntity",
		`Create a new entity in the PARA knowledge graph.

PARA Buckets:
- projects: Active work with defined goal + deadline
- areas: Ongoing responsibilities (people, companies) with no end date
- resources: Reference material, topics worth tracking
- archives: Inactive items from any category

Categories (for areas):
- people: Individuals the operator has relationship with
- companies: Organizations the operator works with
- topics: Subject areas worth tracking

Create entity when: mentioned 3+ times, has direct relationship to operator, or represents significant project/milestone/risk.`,
		{
			name: z
				.string()
				.describe("Entity name (e.g., 'acme-corp', 'jane-smith')"),
			bucket: z.enum(["projects", "areas", "resources", "archives"]),
			category: z.enum(["people", "companies", "topics"]).optional()
		},
		async (args) => {
			if (role !== "owner") {
				return {
					content: [
						{
							type: "text",
							text: "Permission denied: Only owners can create entities"
						}
					],
					isError: true
				}
			}

			try {
				const result = await createEntity(
					workspaceDir,
					args.name,
					args.bucket as ParaBucket,
					args.category
				)
				return {
					content: [{ type: "text", text: result.message }]
				}
			} catch (err) {
				return {
					content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
					isError: true
				}
			}
		}
	)

	const paraAddFactTool = tool(
		"PARAAddFact",
		`Add an atomic fact to an entity in the PARA knowledge graph.

One fact per record. No compound statements.

Fact Categories:
- relationship: How entity relates to operator or others
- milestone: Significant events or achievements
- status: Current state of something
- preference: Entity's preferences or tendencies
- user-signal: Signal from the user about this entity`,
		{
			entityName: z.string().describe("Name of the entity"),
			bucket: z.enum(["projects", "areas", "resources", "archives"]),
			category: z.enum(["people", "companies", "topics"]).optional(),
			fact: z.string().describe("Single atomic fact (one claim)"),
			factCategory: z.enum([
				"relationship",
				"milestone",
				"status",
				"preference",
				"user-signal"
			]),
			relatedEntities: z.array(z.string()).optional()
		},
		async (args) => {
			if (role !== "owner") {
				return {
					content: [
						{
							type: "text",
							text: "Permission denied: Only owners can add facts"
						}
					],
					isError: true
				}
			}

			try {
				const { join } = await import("node:path")
				const {
					getProjectsPath,
					getAreasPath,
					getResourcesPath,
					getArchivesPath
				} = await import("@hybrid/memory")

				let entityPath: string
				if (args.bucket === "projects") {
					entityPath = join(getProjectsPath(workspaceDir), args.entityName)
				} else if (args.bucket === "areas" && args.category) {
					entityPath = join(
						getAreasPath(workspaceDir),
						args.category,
						args.entityName
					)
				} else if (args.bucket === "areas") {
					entityPath = join(getAreasPath(workspaceDir), args.entityName)
				} else if (args.bucket === "resources") {
					entityPath = join(getResourcesPath(workspaceDir), args.entityName)
				} else {
					entityPath = join(getArchivesPath(workspaceDir), args.entityName)
				}

				const result = await addFact(
					workspaceDir,
					entityPath,
					args.fact,
					args.factCategory as FactCategory,
					args.relatedEntities
				)
				return {
					content: [{ type: "text", text: result.message }]
				}
			} catch (err) {
				return {
					content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
					isError: true
				}
			}
		}
	)

	const paraSearchTool = tool(
		"PARASearch",
		`Search for facts across all PARA entities.

Returns facts matching the query, sorted by decay tier (hot > warm > cold excluded by default).

Decay Tiers:
- Hot: accessed within 7 days (always surfaced)
- Warm: accessed 8-30 days ago (lower priority)
- Cold: not accessed in 30+ days (excluded by default)`,
		{
			query: z.string().describe("Search query"),
			bucket: z.enum(["projects", "areas", "resources", "archives"]).optional(),
			includeCold: z.boolean().optional()
		},
		async (args) => {
			if (role !== "owner") {
				return {
					content: [
						{
							type: "text",
							text: "Permission denied: Only owners can search PARA"
						}
					],
					isError: true
				}
			}

			try {
				const results = await searchFacts(workspaceDir, args.query, {
					bucket: args.bucket as ParaBucket | undefined,
					includeCold: args.includeCold
				})

				if (results.length === 0) {
					return {
						content: [{ type: "text", text: "No matching facts found" }]
					}
				}

				const text = results
					.map(
						(r) => `**${r.entityName}** (${r.fact.category})\n${r.fact.fact}`
					)
					.join("\n\n")

				return {
					content: [{ type: "text", text }]
				}
			} catch (err) {
				return {
					content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
					isError: true
				}
			}
		}
	)

	// Daily Log Tools (Layer 2)

	const logFactTool = tool(
		"LogFact",
		"Log a fact to the GLOBAL session log (not user-specific). This is a daily log file visible to all users. For user-specific memories, use MemorySave instead.",
		{
			content: z.string().describe("The fact learned")
		},
		async (args) => {
			await logFact(workspaceDir, args.content)
			return {
				content: [{ type: "text", text: "Fact logged to global session log" }]
			}
		}
	)

	const logDecisionTool = tool(
		"LogDecision",
		"Log a decision to the GLOBAL session log (not user-specific). This is a daily log file visible to all users. For user-specific memories, use MemorySave instead.",
		{
			content: z.string().describe("The decision made")
		},
		async (args) => {
			await logDecision(workspaceDir, args.content)
			return {
				content: [
					{ type: "text", text: "Decision logged to global session log" }
				]
			}
		}
	)

	return createSdkMcpServer({
		name: "hybrid",
		version: "1.0.0",
		tools: [
			memorySaveTool,
			memoryReadTool,
			aclAddOwnerTool,
			aclRemoveOwnerTool,
			aclListOwnersTool,
			aclRequestPairingTool,
			aclListPendingTool,
			aclApprovePairingTool,
			aclRejectPairingTool,
			paraCreateEntityTool,
			paraAddFactTool,
			paraSearchTool,
			logFactTool,
			logDecisionTool,
			...createFileTools({
				workspaceDir,
				userId,
				role,
				projectRoot
			})
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
