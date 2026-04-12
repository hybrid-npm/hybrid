import { execFileSync } from "node:child_process"
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from "node:fs"
import { join, resolve } from "node:path"
import type { Context } from "hono"
import { SKILLS_REGISTRY, type SkillInfo } from "../../skills/registry.js"
import { isOwner } from "./auth.js"

const PROJECT_ROOT = process.env.AGENT_PROJECT_ROOT || process.cwd()

interface InstalledSkill {
	name: string
	source: string
	installedAt: string
}

interface SkillsListResponse {
	skills: SkillInfo[]
	registry: SkillInfo[]
}

export async function handleListSkills(c: Context) {
	const skills = getSkills()

	const response: SkillsListResponse = {
		skills,
		registry: SKILLS_REGISTRY
	}

	return c.json(response)
}

interface AddSkillRequest {
	source: string
	fid: string
}

export async function handleAddSkill(c: Context) {
	try {
		const body = await c.req.json<AddSkillRequest>()
		const { source, fid } = body

		if (!source) {
			return c.json({ error: "Source required" }, 400)
		}

		if (!fid) {
			return c.json({ error: "FID required" }, 400)
		}

		if (!await isOwner(fid)) {
			return c.json({ error: "Only owners can add skills" }, 403)
		}

		const result = await installSkill(source)
		return c.json(result)
	} catch (error) {
		console.error("[skills] Error adding skill:", error)
		return c.json({ error: String(error) }, 500)
	}
}

interface RemoveSkillRequest {
	name: string
	fid: string
}

export async function handleRemoveSkill(c: Context) {
	try {
		const body = await c.req.json<RemoveSkillRequest>()
		const { name, fid } = body

		if (!name) {
			return c.json({ error: "Skill name required" }, 400)
		}

		if (!fid) {
			return c.json({ error: "FID required" }, 400)
		}

		if (!await isOwner(fid)) {
			return c.json({ error: "Only owners can remove skills" }, 403)
		}

		const result = await uninstallSkill(name)
		return c.json(result)
	} catch (error) {
		console.error("[skills] Error removing skill:", error)
		return c.json({ error: String(error) }, 500)
	}
}

export function getSkills(): SkillInfo[] {
	const skillsDir = resolve(PROJECT_ROOT, "skills")
	if (!existsSync(skillsDir)) return []

	const skills: SkillInfo[] = []
	const lockfile = loadLockfile()

	const entries = readdirSync(skillsDir, { withFileTypes: true })

	for (const entry of entries) {
		if (!entry.isDirectory()) continue
		if (entry.name.startsWith(".")) continue

		const skillMdPath = join(skillsDir, entry.name, "SKILL.md")
		if (!existsSync(skillMdPath)) continue

		const skillInfo = parseSkillMd(skillMdPath, entry.name)
		if (skillInfo) {
			const lockEntry = lockfile[entry.name]
			skills.push({
				...skillInfo,
				source: lockEntry?.source || "unknown"
			})
		}
	}

	return skills
}

function loadLockfile(): Record<
	string,
	{ source: string; installedAt: string }
> {
	const lockfilePath = resolve(PROJECT_ROOT, "skills-lock.json")
	if (!existsSync(lockfilePath)) return {}

	try {
		const content = readFileSync(lockfilePath, "utf-8")
		return JSON.parse(content)
	} catch {
		return {}
	}
}

function parseSkillMd(filePath: string, defaultName: string): SkillInfo | null {
	try {
		const content = readFileSync(filePath, "utf-8")
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)

		if (!frontmatterMatch) return null

		const frontmatter = frontmatterMatch[1]
		const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
		const descMatch = frontmatter.match(/^description:\s*(.+)$/m)

		return {
			name: nameMatch?.[1]?.trim() || defaultName,
			source: "",
			description: descMatch?.[1]?.trim() || ""
		}
	} catch {
		return null
	}
}

const GITHUB_REPO_RE = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/
const NPM_PACKAGE_RE = /^(@[a-zA-Z0-9._-]+\/)?[a-zA-Z0-9._-]+$/

export async function installSkill(
	source: string
): Promise<{ success: boolean; skill?: string; error?: string }> {
	const projectSkillsDir = resolve(PROJECT_ROOT, "skills")
	const lockfilePath = resolve(PROJECT_ROOT, "skills-lock.json")

	if (!existsSync(projectSkillsDir)) {
		mkdirSync(projectSkillsDir, { recursive: true })
	}

	let skillName: string
	let skillDir: string | null = null

	if (source.startsWith("github:") || source.includes("/")) {
		const parts = source.replace("github:", "").split("/")
		if (parts.length < 2) {
			return { success: false, error: "Invalid GitHub source" }
		}

		const repo = parts.slice(0, 2).join("/")
		if (!GITHUB_REPO_RE.test(repo)) {
			return { success: false, error: "Invalid GitHub repository name" }
		}
		skillName = parts[2] || parts[1]

		const tempDir = resolve(projectSkillsDir, ".temp", "install")
		rmSync(tempDir, { recursive: true, force: true })

		try {
			execFileSync(
				"git",
				["clone", "--depth", "1", `https://github.com/${repo}.git`, tempDir],
				{
					stdio: "pipe",
					env: { ...process.env, DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1" }
				}
			)
		} catch {
			return { success: false, error: "Failed to clone repository" }
		}

		skillDir = findSkillDir(tempDir, skillName)
		if (!skillDir || !existsSync(resolve(skillDir, "SKILL.md"))) {
			rmSync(tempDir, { recursive: true, force: true })
			return { success: false, error: "No SKILL.md found in repository" }
		}

		const destPath = resolve(projectSkillsDir, skillName)
		cpSync(skillDir, destPath, { recursive: true })
		rmSync(tempDir, { recursive: true, force: true })
	} else if (source.startsWith("./") || source.startsWith("../")) {
		const localPath = resolve(PROJECT_ROOT, source)
		if (!existsSync(resolve(localPath, "SKILL.md"))) {
			return { success: false, error: "No SKILL.md found at local path" }
		}

		skillName = source.split("/").pop() || source
		const destPath = resolve(projectSkillsDir, skillName)
		cpSync(localPath, destPath, { recursive: true })
	} else {
		if (!NPM_PACKAGE_RE.test(source)) {
			return { success: false, error: "Invalid npm package name" }
		}
		skillName = source.split("/").pop() || source
		const tempDir = resolve(projectSkillsDir, ".temp", "npm-install")

		try {
			execFileSync("npm", ["install", source, "--prefix", tempDir], {
				stdio: "pipe",
				env: { ...process.env, DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1" }
			})
		} catch {
			return { success: false, error: "Failed to install npm package" }
		}

		const installedDir = resolve(tempDir, "node_modules", source)
		if (!existsSync(resolve(installedDir, "SKILL.md"))) {
			rmSync(tempDir, { recursive: true, force: true })
			return { success: false, error: "No SKILL.md found in npm package" }
		}

		const destPath = resolve(projectSkillsDir, skillName)
		cpSync(installedDir, destPath, { recursive: true })
		rmSync(tempDir, { recursive: true, force: true })
	}

	const lockfile = loadLockfile()
	lockfile[skillName] = {
		source,
		installedAt: new Date().toISOString()
	}
	writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2))

	return { success: true, skill: skillName }
}

export async function uninstallSkill(
	name: string
): Promise<{ success: boolean; error?: string }> {
	const projectSkillsDir = resolve(PROJECT_ROOT, "skills")
	const lockfilePath = resolve(PROJECT_ROOT, "skills-lock.json")
	const skillPath = resolve(projectSkillsDir, name)

	if (!existsSync(skillPath)) {
		return { success: false, error: `Skill '${name}' not found` }
	}

	rmSync(skillPath, { recursive: true, force: true })

	if (existsSync(lockfilePath)) {
		try {
			const parsed = JSON.parse(readFileSync(lockfilePath, "utf-8"))
			delete parsed[name]
			writeFileSync(lockfilePath, JSON.stringify(parsed, null, 2))
		} catch {
			// Ignore errors
		}
	}

	return { success: true }
}

function findSkillDir(baseDir: string, skillName: string): string | null {
	const searchPaths = [
		baseDir,
		resolve(baseDir, "skills", skillName),
		resolve(baseDir, skillName),
		resolve(baseDir, ".agents", "skills", skillName)
	]

	for (const path of searchPaths) {
		if (existsSync(resolve(path, "SKILL.md"))) {
			return path
		}
	}

	return null
}
