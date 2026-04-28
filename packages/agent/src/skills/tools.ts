import { execFileSync } from "node:child_process"
import { Type } from "@sinclair/typebox"
import { defineTool, type ToolDefinition } from "@mariozechner/pi-coding-agent"
import { getRole, parseACL } from "@hybrd/memory"
import { getSkills, uninstallSkill } from "../server/routes/skills.js"
import {
	getAvailableSkills,
	getInstalledSkills,
	searchClawHub
} from "./registry.js"

const PROJECT_ROOT = process.env.AGENT_PROJECT_ROOT || process.cwd()

async function addSkillFromClawHub(
	slug: string
): Promise<{ success: boolean; skill?: string; error?: string }> {
	try {
		execFileSync("npx", ["clawhub", "install", slug], {
			stdio: "pipe",
			env: { ...process.env, DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1" }
		})
		return { success: true, skill: slug }
	} catch (err) {
		return { success: false, error: (err as Error).message }
	}
}

function errorText(text: string) {
	return { content: [{ type: "text" as const, text }], details: {} as unknown, isError: true }
}

function okText(text: string) {
	return { content: [{ type: "text" as const, text }], details: {} as unknown }
}

export async function createSkillTools(
	userId: string
): Promise<ToolDefinition<any, unknown, unknown>[]> {
	const acl = parseACL(PROJECT_ROOT)
	const role = await getRole(acl, userId)

	const addSkillTool = defineTool({
		name: "AddSkill",
		label: "Add Skill",
		description: `Add a skill to the agent. Owner only.

Sources:
- Claw Hub slug: any skill from clawhub.com (e.g., "blog-writer-cn", "ws-agent-browser")
- GitHub: "github:owner/repo" or "github:owner/repo/skill-name"
- NPM: "package-name" or "@org/package"

Use when user asks to add/install a skill.

Tip: Use ListSkills to see available skills from Claw Hub first.`,
		parameters: Type.Object({
			source: Type.String()
		}),
		execute: async (_toolCallId, args) => {
			if (role !== "owner") {
				return errorText(`Permission denied: Only owners can add skills`)
			}
			try {
				const source = args.source

				// Try Claw Hub first (simple slug, no special characters)
				const isSimpleSlug =
					/^[a-zA-Z0-9_-]+$/.test(source) &&
					!source.includes(":") &&
					!source.startsWith(".")
				if (isSimpleSlug) {
					const result = await addSkillFromClawHub(source)
					if (result.success) {
						return okText(
							`Successfully added skill: ${result.skill} from Claw Hub. You can now use it!`
						)
					}
				}

				// Fall back to manual install (GitHub/npm)
				const { installSkill } = await import("../server/routes/skills.js")
				const result = await installSkill(source)

				if (result.success) {
					return okText(
						`Successfully added skill: ${result.skill}. You can now use it!`
					)
				} else {
					return errorText(`Failed to add skill: ${result.error}`)
				}
			} catch (err) {
				return errorText(
					`Error adding skill: ${(err as Error).message}`
				)
			}
		}
	})

	const removeSkillTool = defineTool({
		name: "RemoveSkill",
		label: "Remove Skill",
		description: `Remove a skill from the agent. Owner only.

Use when user asks to remove/uninstall a skill.

Note: Core skills cannot be removed.`,
		parameters: Type.Object({
			name: Type.String()
		}),
		execute: async (_toolCallId, args) => {
			if (role !== "owner") {
				return errorText(`Permission denied: Only owners can remove skills`)
			}
			try {
				const result = await uninstallSkill(args.name)

				if (result.success) {
					return okText(`Successfully removed skill: ${args.name}`)
				} else {
					return errorText(`Failed to remove skill: ${result.error}`)
				}
			} catch (err) {
				return errorText(
					`Error removing skill: ${(err as Error).message}`
				)
			}
		}
	})

	const listSkillsTool = defineTool({
		name: "ListSkills",
		label: "List Skills",
		description: `List installed and available skills.

Shows:
- Installed skills (in ./skills/ directory)
- Available skills from Claw Hub (browse, search)

Use when user asks "what skills do you have?", "list skills", or "what skills are available"?

Tip: Use SearchClawHub to find specific skills.`,
		parameters: Type.Object({}),
		execute: async () => {
			const installed = getSkills()
			const clawHubInstalled = getInstalledSkills()
			const clawHubAvailable = getAvailableSkills()

			const response = {
				installed: installed.map((s) => ({
					name: s.name,
					description: s.description,
					source: s.source
				})),
				clawHub: {
					installed: clawHubInstalled,
					available: clawHubAvailable
				}
			}

			return okText(JSON.stringify(response, null, 2))
		}
	})

	const searchClawHubTool = defineTool({
		name: "SearchClawHub",
		label: "Search Claw Hub",
		description: `Search for skills on Claw Hub.

Use this to discover skills when the user wants to find something specific or browse what's available.

Returns skills matching the query with descriptions.`,
		parameters: Type.Object({
			query: Type.String()
		}),
		execute: async (_toolCallId, args) => {
			try {
				const results = await searchClawHub(args.query)

				if (results.length === 0) {
					return okText("No skills found matching that query. Try a different search term.")
				}

				return okText(JSON.stringify(results, null, 2))
			} catch (err) {
				return errorText(
					`Error searching Claw Hub: ${(err as Error).message}`
				)
			}
		}
	})

	return [addSkillTool, removeSkillTool, listSkillsTool, searchClawHubTool]
}
