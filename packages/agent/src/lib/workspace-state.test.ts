import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
	type WorkspaceState,
	isOnboardingComplete,
	readWorkspaceState,
	recordBootstrapSeeded,
	recordOnboardingCompleted,
	resolveWorkspaceStatePath,
	writeWorkspaceState
} from "./workspace-state"

describe("workspace-state", () => {
	let tempDir: string
	let statePath: string

	beforeEach(() => {
		tempDir = join(tmpdir(), `workspace-state-test-${Date.now()}`)
		mkdirSync(tempDir, { recursive: true })
		statePath = resolveWorkspaceStatePath(tempDir)
	})

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true })
	})

	describe("readWorkspaceState", () => {
		it("returns default state when file does not exist", () => {
			const state = readWorkspaceState(statePath)
			expect(state).toEqual({ version: 1 })
		})

		it("reads state from file", () => {
			const state: WorkspaceState = {
				version: 1,
				bootstrapSeededAt: "2026-03-06T10:00:00.000Z"
			}
			const dir = dirname(statePath)
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true })
			}
			writeFileSync(statePath, JSON.stringify(state))

			const read = readWorkspaceState(statePath)
			expect(read).toEqual(state)
		})

		it("handles malformed JSON", () => {
			const dir = dirname(statePath)
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true })
			}
			writeFileSync(statePath, "not valid json")

			const state = readWorkspaceState(statePath)
			expect(state).toEqual({ version: 1 })
		})
	})

	describe("writeWorkspaceState", () => {
		it("writes state to file", () => {
			const state: WorkspaceState = {
				version: 1,
				bootstrapSeededAt: "2026-03-06T10:00:00.000Z"
			}

			writeWorkspaceState(statePath, state)

			const read = readWorkspaceState(statePath)
			expect(read).toEqual(state)
		})

		it("creates state directory if missing", () => {
			const nestedDir = join(tempDir, "nested", "dir")
			const nestedStatePath = resolveWorkspaceStatePath(nestedDir)

			const state: WorkspaceState = { version: 1 }
			writeWorkspaceState(nestedStatePath, state)

			const read = readWorkspaceState(nestedStatePath)
			expect(read).toEqual(state)
		})
	})

	describe("isOnboardingComplete", () => {
		it("returns false when bootstrap exists and no state", () => {
			const result = isOnboardingComplete(tempDir, true)
			expect(result).toBe(false)
		})

		it("returns false when bootstrap exists and only seeded", () => {
			recordBootstrapSeeded(tempDir)

			const result = isOnboardingComplete(tempDir, true)
			expect(result).toBe(false)
		})

		it("returns true when bootstrap seeded but no longer exists", () => {
			recordBootstrapSeeded(tempDir)

			const result = isOnboardingComplete(tempDir, false)
			expect(result).toBe(true)
		})

		it("returns true when onboardingCompletedAt is set", () => {
			recordOnboardingCompleted(tempDir)

			const result = isOnboardingComplete(tempDir, false)
			expect(result).toBe(true)
		})

		it("returns true when onboardingCompletedAt is set even if bootstrap exists", () => {
			recordOnboardingCompleted(tempDir)

			const result = isOnboardingComplete(tempDir, true)
			expect(result).toBe(true)
		})
	})

	describe("recordBootstrapSeeded", () => {
		it("sets bootstrapSeededAt timestamp", () => {
			recordBootstrapSeeded(tempDir)

			const state = readWorkspaceState(statePath)
			expect(state.bootstrapSeededAt).toBeDefined()
			expect(state.bootstrapSeededAt).toBeTruthy()
		})

		it("does not overwrite existing timestamp", () => {
			const originalTime = "2026-01-01T00:00:00.000Z"
			writeWorkspaceState(statePath, {
				version: 1,
				bootstrapSeededAt: originalTime
			})

			recordBootstrapSeeded(tempDir)

			const state = readWorkspaceState(statePath)
			expect(state.bootstrapSeededAt).toBe(originalTime)
		})
	})

	describe("recordOnboardingCompleted", () => {
		it("sets onboardingCompletedAt timestamp", () => {
			recordOnboardingCompleted(tempDir)

			const state = readWorkspaceState(statePath)
			expect(state.onboardingCompletedAt).toBeDefined()
			expect(state.onboardingCompletedAt).toBeTruthy()
		})

		it("does not overwrite existing timestamp", () => {
			const originalTime = "2026-01-01T00:00:00.000Z"
			writeWorkspaceState(statePath, {
				version: 1,
				onboardingCompletedAt: originalTime
			})

			recordOnboardingCompleted(tempDir)

			const state = readWorkspaceState(statePath)
			expect(state.onboardingCompletedAt).toBe(originalTime)
		})
	})
})
