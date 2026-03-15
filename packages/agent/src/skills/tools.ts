import { execFileSync } from "node:child_process"
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { getRole, parseACL } from "@hybrd/memory"
import { z } from "zod"
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

export function createSkillMcpServer(userId: string) {
	const acl = parseACL(PROJECT_ROOT)
	const role = getRole(acl, userId)

	const addSkillTool = tool(
		"AddSkill",
		`Add a skill to the agent. Owner only.

Sources:
- Claw Hub slug: any skill from clawhub.com (e.g., "blog-writer-cn", "ws-agent-browser")
- GitHub: "github:owner/repo" or "github:owner/repo/skill-name"
- NPM: "package-name" or "@org/package"

Use when user asks to add/install a skill.

Tip: Use ListSkills to see available skills from Claw Hub first.`,
		{
			source: z
				.string()
				.describe("Skill source (Claw Hub slug, GitHub URL, or npm package)")
		},
		async (args) => {
			if (role !== "owner") {
				return {
					content: [
						{
							type: "text",
							text: "Permission denied: Only owners can add skills"
						}
					],
					isError: true
				}
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
						return {
							content: [
								{
									type: "text",
									text: `Successfully added skill: ${result.skill} from Claw Hub. You can now use it!`
								}
							]
						}
					}
				}

				// Fall back to manual install (GitHub/npm)
				const { installSkill } = await import("../server/routes/skills.js")
				const result = await installSkill(source)

				if (result.success) {
					return {
						content: [
							{
								type: "text",
								text: `Successfully added skill: ${result.skill}. You can now use it!`
							}
						]
					}
				} else {
					return {
						content: [
							{
								type: "text",
								text: `Failed to add skill: ${result.error}`
							}
						],
						isError: true
					}
				}
			} catch (err) {
				return {
					content: [
						{
							type: "text",
							text: `Error adding skill: ${(err as Error).message}`
						}
					],
					isError: true
				}
			}
		}
	)

	const removeSkillTool = tool(
		"RemoveSkill",
		`Remove a skill from the agent. Owner only.

Use when user asks to remove/uninstall a skill.

Note: Core skills cannot be removed.`,
		{
			name: z.string().describe("Name of skill to remove")
		},
		async (args) => {
			if (role !== "owner") {
				return {
					content: [
						{
							type: "text",
							text: "Permission denied: Only owners can remove skills"
						}
					],
					isError: true
				}
			}

			try {
				const result = await uninstallSkill(args.name)

				if (result.success) {
					return {
						content: [
							{
								type: "text",
								text: `Successfully removed skill: ${args.name}`
							}
						]
					}
				} else {
					return {
						content: [
							{
								type: "text",
								text: `Failed to remove skill: ${result.error}`
							}
						],
						isError: true
					}
				}
			} catch (err) {
				return {
					content: [
						{
							type: "text",
							text: `Error removing skill: ${(err as Error).message}`
						}
					],
					isError: true
				}
			}
		}
	)

	const listSkillsTool = tool(
		"ListSkills",
		`List installed and available skills.

Shows:
- Installed skills (in ./skills/ directory)
- Available skills from Claw Hub (browse, search)

Use when user asks "what skills do you have?", "list skills", or "what skills are available"?

Tip: Use SearchClawHub to find specific skills.`,
		{},
		async () => {
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

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(response, null, 2)
					}
				]
			}
		}
	)

	const searchClawHubTool = tool(
		"SearchClawHub",
		`Search for skills on Claw Hub.

Use this to discover skills when the user wants to find something specific or browse what's available.

Returns skills matching the query with descriptions.`,
		{
			query: z
				.string()
				.describe("Search query (e.g., 'browser', 'memory', 'twitter')")
		},
		async (args) => {
			try {
				const results = await searchClawHub(args.query)

				if (results.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "No skills found matching that query. Try a different search term."
							}
						]
					}
				}

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(results, null, 2)
						}
					]
				}
			} catch (err) {
				return {
					content: [
						{
							type: "text",
							text: `Error searching Claw Hub: ${(err as Error).message}`
						}
					],
					isError: true
				}
			}
		}
	)

	return createSdkMcpServer({
		name: "skills",
		version: "1.0.0",
		tools: [addSkillTool, removeSkillTool, listSkillsTool, searchClawHubTool]
	})
}
