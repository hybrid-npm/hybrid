import { Type } from "@sinclair/typebox"
import { defineTool, type ToolDefinition } from "@mariozechner/pi-coding-agent"
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
} from "@hybrd/memory"
import type { IdentityProvider } from "@hybrd/types"
import { createFileTools } from "./tools/file.js"

// ── Helpers ────────────────────────────────────────────────

function errorText(text: string) {
	return { content: [{ type: "text" as const, text }], details: {} as unknown }
}

function okText(text: string) {
	return { content: [{ type: "text" as const, text }], details: {} as unknown }
}

// ── TypeBox schemas ────────────────────────────────────────

const memoryCategoryEnum = Type.Union([
	Type.Literal("preferences"),
	Type.Literal("learnings"),
	Type.Literal("decisions"),
	Type.Literal("context"),
	Type.Literal("notes")
])

const memorySaveSchema = Type.Object({
	category: memoryCategoryEnum,
	content: Type.String()
})

const memoryReadSchema = Type.Object({
	category: memoryCategoryEnum
})

const aclIdentitySchema = Type.Object({
	identity: Type.String()
})

const aclPairingCodeSchema = Type.Object({
	code: Type.String()
})

const paraCreateEntitySchema = Type.Object({
	name: Type.String(),
	bucket: Type.Union([
		Type.Literal("projects"),
		Type.Literal("areas"),
		Type.Literal("resources"),
		Type.Literal("archives")
	]),
	category: Type.Optional(
		Type.Union([
			Type.Literal("people"),
			Type.Literal("companies"),
			Type.Literal("topics")
		])
	)
})

const paraAddFactSchema = Type.Object({
	entityName: Type.String(),
	bucket: Type.Union([
		Type.Literal("projects"),
		Type.Literal("areas"),
		Type.Literal("resources"),
		Type.Literal("archives")
	]),
	category: Type.Optional(
		Type.Union([
			Type.Literal("people"),
			Type.Literal("companies"),
			Type.Literal("topics")
		])
	),
	fact: Type.String(),
	factCategory: Type.Union([
		Type.Literal("relationship"),
		Type.Literal("milestone"),
		Type.Literal("status"),
		Type.Literal("preference"),
		Type.Literal("user-signal")
	]),
	relatedEntities: Type.Optional(Type.Array(Type.String()))
})

const paraSearchSchema = Type.Object({
	query: Type.String(),
	bucket: Type.Optional(
		Type.Union([
			Type.Literal("projects"),
			Type.Literal("areas"),
			Type.Literal("resources"),
			Type.Literal("archives")
		])
	),
	includeCold: Type.Optional(Type.Boolean())
})

const logSchema = Type.Object({
	content: Type.String()
})

// ── Tool factory ───────────────────────────────────────────

interface ToolCtx {
	workspaceDir: string
	userId: string
	role: Role
	acl: ACL | null
	projectRoot: string
	identityProvider?: IdentityProvider
}

export function createMemoryTools(
	ctx: ToolCtx
): ToolDefinition<any, unknown, unknown>[] {
	const { workspaceDir, userId, role, acl, projectRoot, identityProvider } = ctx

	const memorySaveTool = defineTool({
		name: "MemorySave",
		label: "Memory Save",
		description: `Save information to THIS USER's persistent memory. Use this when the user asks you to remember something.

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
		parameters: memorySaveSchema,
		execute: async (_toolCallId, args) => {
			const result = await appendToMemory(
				workspaceDir,
				{
					category: args.category,
					content: args.content
				},
				userId,
				role
			)
			return okText(result.message)
		}
	})

	const memoryReadTool = defineTool({
		name: "MemoryRead",
		label: "Memory Read",
		description: `Read entries from a memory category. Use this to recall:
- User preferences
- Past learnings
- Previous decisions
- Project context`,
		parameters: memoryReadSchema,
		execute: async (_toolCallId, args) => {
			const entries = await readMemorySection(
				workspaceDir,
				args.category,
				userId,
				role
			)
			if (entries.length === 0) {
				return okText(`No entries found in ${args.category}`)
			}
			return okText(entries.map((e) => `- ${e}`).join("\n"))
		}
	})

	const aclAddOwnerTool = defineTool({
		name: "ACLAddOwner",
		label: "ACL Add Owner",
		description: `Add an identity as an owner. Owners have full access to all memory sources.
Only current owners can use this tool.
${identityProvider ? `Identity format: ${identityProvider.name}` : "Identity must be a valid identifier."}`,
		parameters: aclIdentitySchema,
		execute: async (_toolCallId, args) => {
			if (role !== "owner") {
				return errorText(`Permission denied: Only owners can add new owners`)
			}
			try {
				let identityToAdd = args.identity
				if (identityProvider) {
					const identity = await identityProvider.validate(args.identity)
					if (!identity) {
						return errorText(`Invalid identity for ${identityProvider.name}`)
					}
					identityToAdd = identityProvider.format(identity)
				}
				const result = await addOwner(workspaceDir, identityToAdd)
				return okText(result.message)
			} catch (err) {
				return errorText(`Error: ${(err as Error).message}`)
			}
		}
	})

	const aclRemoveOwnerTool = defineTool({
		name: "ACLRemoveOwner",
		label: "ACL Remove Owner",
		description: `Remove an identity from owners.
Only current owners can use this tool.`,
		parameters: aclIdentitySchema,
		execute: async (_toolCallId, args) => {
			if (role !== "owner") {
				return errorText(`Permission denied: Only owners can remove owners`)
			}
			try {
				let identityToRemove = args.identity
				if (identityProvider) {
					const identity = await identityProvider.validate(args.identity)
					if (!identity) {
						return errorText(`Invalid identity for ${identityProvider.name}`)
					}
					identityToRemove = identityProvider.format(identity)
				}
				const result = await removeOwner(workspaceDir, identityToRemove)
				return okText(result.message)
			} catch (err) {
				return errorText(`Error: ${(err as Error).message}`)
			}
		}
	})

	const aclListOwnersTool = defineTool({
		name: "ACLListOwners",
		label: "ACL List Owners",
		description: "List all identities that have owner role.",
		parameters: Type.Object({}),
		execute: async () => {
			const owners = listOwners(acl)
			if (owners.length === 0) {
				return okText("No owners configured. Everyone is a guest.")
			}
			return okText(`Owners:\n${owners.map((o) => `- ${o}`).join("\n")}`)
		}
	})

	const aclRequestPairingTool = defineTool({
		name: "ACLRequestPairing",
		label: "ACL Request Pairing",
		description: `Request pairing to become an owner. Generates a pairing code that must be approved by an existing owner.

Use this when:
- You want to request owner access
- You're a guest and need elevated permissions

The pairing code expires in 1 hour. Share it with an owner for approval.`,
		parameters: Type.Object({}),
		execute: async () => {
			if (!userId) {
				return errorText(`Cannot request pairing: no user identity available`)
			}
			if (role === "owner") {
				return okText("You are already an owner")
			}
			try {
				const result = await upsertACLPendingRequest(workspaceDir, userId)
				if (!result.code) {
					return errorText("Too many pending requests. Wait for one to expire or be processed.")
				}
				return okText(`Pairing requested.\n\nYour code: \`${result.code}\`\n\nShare this code with an owner for approval. Code expires in 1 hour.`)
			} catch (err) {
				return errorText(`Error: ${(err as Error).message}`)
			}
		}
	})

	const aclListPendingTool = defineTool({
		name: "ACLListPending",
		label: "ACL List Pending",
		description: "List pending pairing requests. Only owners can use this tool.",
		parameters: Type.Object({}),
		execute: async () => {
			if (role !== "owner") {
				return errorText(`Permission denied: Only owners can list pending requests`)
			}
			try {
				const requests = await listACLPendingRequests(workspaceDir)
				if (requests.length === 0) {
					return okText("No pending pairing requests")
				}
				const lines = requests.map(
					(r) => `- Code: ${r.code} | ID: ${r.id} | Requested: ${r.createdAt}`
				)
				return okText(`Pending Requests:\n${lines.join("\n")}`)
			} catch (err) {
				return errorText(`Error: ${(err as Error).message}`)
			}
		}
	})

	const aclApprovePairingTool = defineTool({
		name: "ACLApprovePairing",
		label: "ACL Approve Pairing",
		description: `Approve a pairing request by code. Only owners can use this tool.

Use this when:
- A user has shared their pairing code with you
- You want to grant owner access to someone`,
		parameters: aclPairingCodeSchema,
		execute: async (_toolCallId, args) => {
			if (role !== "owner") {
				return errorText(`Permission denied: Only owners can approve pairing requests`)
			}
			try {
				const result = await approveACLPairingCode(
					workspaceDir,
					args.code.toUpperCase()
				)
				if (!result) {
					return errorText("Invalid or expired pairing code")
				}
				return okText(`Approved! ${result.id} is now an owner.`)
			} catch (err) {
				return errorText(`Error: ${(err as Error).message}`)
			}
		}
	})

	const aclRejectPairingTool = defineTool({
		name: "ACLRejectPairing",
		label: "ACL Reject Pairing",
		description: `Reject a pairing request by code. Only owners can use this tool.

Use this when:
- A pairing request should be denied
- You want to remove a pending request without approving it`,
		parameters: aclPairingCodeSchema,
		execute: async (_toolCallId, args) => {
			if (role !== "owner") {
				return errorText(`Permission denied: Only owners can reject pairing requests`)
			}
			try {
				const result = await rejectACLPairingCode(
					workspaceDir,
					args.code.toUpperCase()
				)
				if (!result) {
					return errorText("Invalid or expired pairing code")
				}
				return okText(`Rejected pairing request from ${result.id}`)
			} catch (err) {
				return errorText(`Error: ${(err as Error).message}`)
			}
		}
	})

	// PARA Tools (Layer 1 - Knowledge Graph)

	const paraCreateEntityTool = defineTool({
		name: "PARACreateEntity",
		label: "PARA Create Entity",
		description: `Create a new entity in the PARA knowledge graph.

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
		parameters: paraCreateEntitySchema,
		execute: async (_toolCallId, args) => {
			if (role !== "owner") {
				return errorText(`Permission denied: Only owners can create entities`)
			}
			try {
				const result = await createEntity(
					workspaceDir,
					args.name,
					args.bucket as ParaBucket,
					args.category
				)
				return okText(result.message)
			} catch (err) {
				return errorText(`Error: ${(err as Error).message}`)
			}
		}
	})

	const paraAddFactTool = defineTool({
		name: "PARAAddFact",
		label: "PARA Add Fact",
		description: `Add an atomic fact to an entity in the PARA knowledge graph.

One fact per record. No compound statements.

Fact Categories:
- relationship: How entity relates to operator or others
- milestone: Significant events or achievements
- status: Current state of something
- preference: Entity's preferences or tendencies
- user-signal: Signal from the user about this entity`,
		parameters: paraAddFactSchema,
		execute: async (_toolCallId, args) => {
			if (role !== "owner") {
				return errorText(`Permission denied: Only owners can add facts`)
			}
			try {
				const { join } = await import("node:path")
				const {
					getProjectsPath,
					getAreasPath,
					getResourcesPath,
					getArchivesPath
				} = await import("@hybrd/memory")

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
				return okText(result.message)
			} catch (err) {
				return errorText(`Error: ${(err as Error).message}`)
			}
		}
	})

	const paraSearchTool = defineTool({
		name: "PARASearch",
		label: "PARA Search",
		description: `Search for facts across all PARA entities.

Returns facts matching the query, sorted by decay tier (hot > warm > cold excluded by default).

Decay Tiers:
- Hot: accessed within 7 days (always surfaced)
- Warm: accessed 8-30 days ago (lower priority)
- Cold: not accessed in 30+ days (excluded by default)`,
		parameters: paraSearchSchema,
		execute: async (_toolCallId, args) => {
			if (role !== "owner") {
				return errorText(`Permission denied: Only owners can search PARA`)
			}
			try {
				const results = await searchFacts(workspaceDir, args.query, {
					bucket: args.bucket as ParaBucket | undefined,
					includeCold: args.includeCold
				})

				if (results.length === 0) {
					return okText("No matching facts found")
				}

				const text = results
					.map(
						(r) => `**${r.entityName}** (${r.fact.category})\n${r.fact.fact}`
					)
					.join("\n\n")

				return okText(text)
			} catch (err) {
				return errorText(`Error: ${(err as Error).message}`)
			}
		}
	})

	// Daily Log Tools (Layer 2)

	const logFactTool = defineTool({
		name: "LogFact",
		label: "Log Fact",
		description: "Log a fact to the GLOBAL session log (not user-specific). This is a daily log file visible to all users. For user-specific memories, use MemorySave instead.",
		parameters: logSchema,
		execute: async (_toolCallId, args) => {
			await logFact(workspaceDir, args.content)
			return okText("Fact logged to global session log")
		}
	})

	const logDecisionTool = defineTool({
		name: "LogDecision",
		label: "Log Decision",
		description: "Log a decision to the GLOBAL session log (not user-specific). This is a daily log file visible to all users. For user-specific memories, use MemorySave instead.",
		parameters: logSchema,
		execute: async (_toolCallId, args) => {
			await logDecision(workspaceDir, args.content)
			return okText("Decision logged to global session log")
		}
	})

	// Compose all tools: memory/ACL/PARA/log + file tools
	return [
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
}

export async function resolveUserRole(
	workspaceDir: string,
	userId: string | undefined,
	identityProvider?: IdentityProvider
): Promise<{ role: Role; acl: ACL | null }> {
	const acl = parseACL(workspaceDir)

	if (!userId) {
		return { role: "guest", acl }
	}

	const role = await getRole(acl, userId, identityProvider)
	return { role, acl }
}
