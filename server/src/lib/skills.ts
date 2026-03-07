export interface SkillInfo {
	name: string
	source: string
	description: string
	category?: string
}

export interface InstalledSkill {
	name: string
	source: string
	installedAt: string
}

export interface SkillsListResponse {
	core: SkillInfo[]
	installed: InstalledSkill[]
	registry: SkillInfo[]
}

export interface AuthVerifyResponse {
	fid: string
	role: "owner" | "guest"
	authenticated: boolean
}

const API_BASE = "/api"

export async function verifyAuth(token: string): Promise<AuthVerifyResponse> {
	const res = await fetch(`${API_BASE}/auth/verify`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ token })
	})

	if (!res.ok) {
		throw new Error(`Auth failed: ${res.status}`)
	}

	return res.json()
}

export async function listSkills(): Promise<SkillsListResponse> {
	const res = await fetch(`${API_BASE}/skills`)

	if (!res.ok) {
		throw new Error(`Failed to list skills: ${res.status}`)
	}

	return res.json()
}

export async function addSkill(
	source: string,
	token: string
): Promise<{ success: boolean; skill?: string; error?: string }> {
	const res = await fetch(`${API_BASE}/skills/add`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ source, token })
	})

	return res.json()
}

export async function removeSkill(
	name: string,
	token: string
): Promise<{ success: boolean; error?: string }> {
	const res = await fetch(`${API_BASE}/skills/remove`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name, token })
	})

	return res.json()
}
