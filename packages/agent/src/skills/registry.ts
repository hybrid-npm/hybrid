export interface SkillInfo {
	name: string
	source: string
	description: string
	category?: string
}

export const SKILLS_REGISTRY: SkillInfo[] = [
	{
		name: "wrangler",
		source: "github:cloudflare/skills",
		description:
			"Cloudflare Workers CLI for deploying and managing Workers, KV, R2, D1, Vectorize, Hyperdrive, Workers AI, Containers, Queues, Workflows, Pipelines, and Secrets Store.",
		category: "infrastructure"
	},
	{
		name: "agent-browser",
		source: "github:anomaly/agent-browser",
		description:
			"Browser automation for navigating the web. Use when you need to browse websites, fill forms, click elements, or extract content from live web pages.",
		category: "automation"
	}
]
