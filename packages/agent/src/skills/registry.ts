import { execFileSync } from "node:child_process"

export interface SkillInfo {
	name: string
	source: string
	description: string
	category?: string
}

export interface ClawHubSkill {
	slug: string
	version?: string
	updatedAt?: string
	description: string
}

export function getInstalledSkills(): ClawHubSkill[] {
	try {
		const output = execFileSync("npx", ["clawhub", "list"], {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1" }
		})
		const skills: ClawHubSkill[] = []
		for (const line of output.split("\n")) {
			const match = line.match(/^(\S+)\s+v?(\S+)/)
			if (match) {
				skills.push({
					slug: match[1],
					version: match[2],
					description: line.replace(/^(\S+)\s+v?(\S+)\s*/, "").trim()
				})
			}
		}
		return skills
	} catch {
		return []
	}
}

export function getAvailableSkills(): ClawHubSkill[] {
	try {
		const output = execFileSync("npx", ["clawhub", "explore"], {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1" }
		})
		const skills: ClawHubSkill[] = []
		for (const line of output.split("\n")) {
			const match = line.match(/^(\S+)\s+v?(\S+)\s+(\S+)\s+(.*)$/)
			if (match) {
				skills.push({
					slug: match[1],
					version: match[2],
					updatedAt: match[3],
					description: match[4]
				})
			}
		}
		return skills
	} catch {
		return []
	}
}

export async function searchClawHub(query: string): Promise<ClawHubSkill[]> {
	try {
		const output = execFileSync("npx", ["clawhub", "search", query], {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1" }
		})
		const skills: ClawHubSkill[] = []
		for (const line of output.split("\n")) {
			const match = line.match(/^(\S+)\s+v?(\S+)\s+(.*)$/)
			if (match) {
				skills.push({
					slug: match[1],
					version: match[2],
					description: match[3]
				})
			}
		}
		return skills
	} catch {
		return []
	}
}

export const SKILLS_REGISTRY: SkillInfo[] = []
