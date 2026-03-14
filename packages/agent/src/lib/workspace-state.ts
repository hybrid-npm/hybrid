import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export type WorkspaceState = {
	version: number
	bootstrapSeededAt?: string
	onboardingCompletedAt?: string
}

const WORKSPACE_STATE_VERSION = 1
const STATE_DIR = ".hybrid"
const STATE_FILE = "workspace-state.json"

export function resolveWorkspaceStatePath(workspaceDir: string): string {
	return join(workspaceDir, STATE_DIR, STATE_FILE)
}

export function readWorkspaceState(statePath: string): WorkspaceState {
	try {
		const raw = readFileSync(statePath, "utf-8")
		const parsed = JSON.parse(raw)
		return {
			version: parsed.version ?? WORKSPACE_STATE_VERSION,
			bootstrapSeededAt: parsed.bootstrapSeededAt,
			onboardingCompletedAt: parsed.onboardingCompletedAt
		}
	} catch {
		return { version: WORKSPACE_STATE_VERSION }
	}
}

export function writeWorkspaceState(
	statePath: string,
	state: WorkspaceState
): void {
	const dir = dirname(statePath)
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true })
	}
	writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8")
}

export function isOnboardingComplete(
	workspaceDir: string,
	bootstrapExists: boolean
): boolean {
	const statePath = resolveWorkspaceStatePath(workspaceDir)
	const state = readWorkspaceState(statePath)

	if (state.onboardingCompletedAt) {
		return true
	}

	if (state.bootstrapSeededAt && !bootstrapExists) {
		return true
	}

	return false
}

export function recordBootstrapSeeded(workspaceDir: string): void {
	const statePath = resolveWorkspaceStatePath(workspaceDir)
	const state = readWorkspaceState(statePath)

	if (!state.bootstrapSeededAt) {
		state.bootstrapSeededAt = new Date().toISOString()
		writeWorkspaceState(statePath, state)
	}
}

export function recordOnboardingCompleted(workspaceDir: string): void {
	const statePath = resolveWorkspaceStatePath(workspaceDir)
	const state = readWorkspaceState(statePath)

	if (!state.onboardingCompletedAt) {
		state.onboardingCompletedAt = new Date().toISOString()
		writeWorkspaceState(statePath, state)
	}
}
