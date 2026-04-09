import { randomInt } from "node:crypto"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { getCredentialsPath } from "./paths.js"
import { isValidWalletAddress, normalizeWalletAddress } from "./validate.js"

export type Role = "owner" | "guest"

export interface ACL {
	version: 1
	allowFrom: string[]
}

export interface PairingRequest {
	id: string
	code: string
	createdAt: string
	lastSeenAt: string
	meta?: Record<string, string>
}

export interface PairingStore {
	version: 1
	requests: PairingRequest[]
}

const CHANNEL = "default"
const PAIRING_CODE_LENGTH = 8
const PAIRING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const PAIRING_PENDING_TTL_MS = 60 * 60 * 1000
const PAIRING_PENDING_MAX = 3

function getAllowFromPath(workspaceDir: string): string {
	return join(getCredentialsPath(workspaceDir), `${CHANNEL}-allowFrom.json`)
}

function getPairingPath(workspaceDir: string): string {
	return join(getCredentialsPath(workspaceDir), `${CHANNEL}-pairing.json`)
}

function randomCode(): string {
	let out = ""
	for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
		const idx = randomInt(0, PAIRING_CODE_ALPHABET.length)
		out += PAIRING_CODE_ALPHABET[idx]
	}
	return out
}

function generateUniqueCode(existing: Set<string>): string {
	for (let attempt = 0; attempt < 500; attempt++) {
		const code = randomCode()
		if (!existing.has(code)) {
			return code
		}
	}
	throw new Error("Failed to generate unique pairing code")
}

function normalizeAllowEntry(entry: string): string {
	const trimmed = entry.trim()
	if (!trimmed || trimmed === "*") {
		return ""
	}
	return trimmed.toLowerCase()
}

function dedupePreserveOrder(entries: string[]): string[] {
	const seen = new Set<string>()
	const out: string[] = []
	for (const entry of entries) {
		const normalized = normalizeAllowEntry(entry)
		if (!normalized || seen.has(normalized)) {
			continue
		}
		seen.add(normalized)
		out.push(normalized)
	}
	return out
}

function parseTimestamp(value: string | undefined): number | null {
	if (!value) {
		return null
	}
	const parsed = Date.parse(value)
	if (!Number.isFinite(parsed)) {
		return null
	}
	return parsed
}

function isExpired(entry: PairingRequest, nowMs: number): boolean {
	const createdAt = parseTimestamp(entry.createdAt)
	if (!createdAt) {
		return true
	}
	return nowMs - createdAt > PAIRING_PENDING_TTL_MS
}

function pruneExpiredRequests(
	reqs: PairingRequest[],
	nowMs: number
): {
	requests: PairingRequest[]
	removed: boolean
} {
	const kept: PairingRequest[] = []
	let removed = false
	for (const req of reqs) {
		if (isExpired(req, nowMs)) {
			removed = true
			continue
		}
		kept.push(req)
	}
	return { requests: kept, removed }
}

function resolveLastSeenAt(entry: PairingRequest): number {
	return (
		parseTimestamp(entry.lastSeenAt) ?? parseTimestamp(entry.createdAt) ?? 0
	)
}

function pruneExcessRequests(
	reqs: PairingRequest[],
	maxPending: number
): { requests: PairingRequest[]; removed: boolean } {
	if (maxPending <= 0 || reqs.length <= maxPending) {
		return { requests: reqs, removed: false }
	}
	const sorted = reqs
		.slice()
		.sort((a, b) => resolveLastSeenAt(a) - resolveLastSeenAt(b))
	return { requests: sorted.slice(-maxPending), removed: true }
}

async function ensureDir(dir: string): Promise<void> {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true })
	}
}

async function readJsonFile<T>(
	filePath: string,
	fallback: T
): Promise<{ value: T; exists: boolean }> {
	try {
		const raw = await readFile(filePath, "utf-8")
		const parsed = JSON.parse(raw)
		return { value: parsed, exists: true }
	} catch (err) {
		const code = (err as { code?: string }).code
		if (code === "ENOENT") {
			return { value: fallback, exists: false }
		}
		return { value: fallback, exists: true }
	}
}

async function writeJsonFileAtomic(
	filePath: string,
	value: unknown
): Promise<void> {
	const tempPath = `${filePath}.tmp`
	await writeFile(tempPath, JSON.stringify(value, null, 2), "utf-8")
	await import("node:fs/promises").then((fs) => fs.rename(tempPath, filePath))
}

export function parseACL(workspaceDir: string): ACL | null {
	const aclPath = getAllowFromPath(workspaceDir)

	if (!existsSync(aclPath)) {
		return null
	}

	try {
		const content = readFileSync(aclPath, "utf-8")
		const parsed = JSON.parse(content) as ACL
		if (parsed.version !== 1 || !Array.isArray(parsed.allowFrom)) {
			return null
		}
		return {
			version: 1,
			allowFrom: dedupePreserveOrder(parsed.allowFrom)
		}
	} catch {
		return null
	}
}

export function getRole(acl: ACL | null, userId: string): Role {
	// If no ACL is configured (null), allow access for initial onboarding
	// Once ACL is set up, only allowFrom addresses become owners
	if (!acl) {
		return "owner"
	}

	if (!userId) {
		return "guest"
	}

	// Validate that userId is a wallet address format
	// Non-wallet identifiers are not allowed in ACL
	const normalizedUserId = normalizeWalletAddress(userId)
	if (!isValidWalletAddress(normalizedUserId)) {
		return "guest"
	}

	if (acl.allowFrom.includes(normalizedUserId)) {
		return "owner"
	}

	return "guest"
}

export function listOwners(acl: ACL | null): string[] {
	return acl?.allowFrom || []
}

export async function readACLAllowFrom(
	workspaceDir: string
): Promise<string[]> {
	const filePath = getAllowFromPath(workspaceDir)
	const { value } = await readJsonFile<ACL>(filePath, {
		version: 1,
		allowFrom: []
	})
	return dedupePreserveOrder(value.allowFrom || [])
}

export async function addACLAllowFromEntry(
	workspaceDir: string,
	entry: string
): Promise<{ changed: boolean; allowFrom: string[] }> {
	await ensureDir(getCredentialsPath(workspaceDir))
	const filePath = getAllowFromPath(workspaceDir)
	const normalized = normalizeAllowEntry(entry)

	if (!normalized) {
		const current = await readACLAllowFrom(workspaceDir)
		return { changed: false, allowFrom: current }
	}

	const { value } = await readJsonFile<ACL>(filePath, {
		version: 1,
		allowFrom: []
	})
	const current = dedupePreserveOrder(value.allowFrom || [])

	if (current.includes(normalized)) {
		return { changed: false, allowFrom: current }
	}

	const next = [...current, normalized]
	await writeJsonFileAtomic(filePath, { version: 1, allowFrom: next })
	return { changed: true, allowFrom: next }
}

export async function removeACLAllowFromEntry(
	workspaceDir: string,
	entry: string
): Promise<{ changed: boolean; allowFrom: string[] }> {
	const filePath = getAllowFromPath(workspaceDir)
	const normalized = normalizeAllowEntry(entry)

	if (!normalized) {
		const current = await readACLAllowFrom(workspaceDir)
		return { changed: false, allowFrom: current }
	}

	const { value } = await readJsonFile<ACL>(filePath, {
		version: 1,
		allowFrom: []
	})
	const current = dedupePreserveOrder(value.allowFrom || [])
	const next = current.filter((e) => e !== normalized)

	if (next.length === current.length) {
		return { changed: false, allowFrom: current }
	}

	await writeJsonFileAtomic(filePath, { version: 1, allowFrom: next })
	return { changed: true, allowFrom: next }
}

export async function listACLPendingRequests(
	workspaceDir: string
): Promise<PairingRequest[]> {
	const filePath = getPairingPath(workspaceDir)

	if (!existsSync(filePath)) {
		return []
	}

	const { value } = await readJsonFile<PairingStore>(filePath, {
		version: 1,
		requests: []
	})

	const nowMs = Date.now()
	const { requests: prunedExpired, removed: expiredRemoved } =
		pruneExpiredRequests(value.requests || [], nowMs)
	const { requests: pruned, removed: cappedRemoved } = pruneExcessRequests(
		prunedExpired,
		PAIRING_PENDING_MAX
	)

	if (expiredRemoved || cappedRemoved) {
		await ensureDir(getCredentialsPath(workspaceDir))
		await writeJsonFileAtomic(filePath, { version: 1, requests: pruned })
	}

	return pruned
		.filter(
			(r) =>
				r &&
				typeof r.id === "string" &&
				typeof r.code === "string" &&
				typeof r.createdAt === "string"
		)
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function upsertACLPendingRequest(
	workspaceDir: string,
	id: string,
	meta?: Record<string, string>
): Promise<{ code: string; created: boolean }> {
	await ensureDir(getCredentialsPath(workspaceDir))
	const filePath = getPairingPath(workspaceDir)
	const now = new Date().toISOString()
	const nowMs = Date.now()
	const normalizedId = normalizeAllowEntry(id) || id

	const { value } = await readJsonFile<PairingStore>(filePath, {
		version: 1,
		requests: []
	})

	let reqs = value.requests || []
	const { requests: prunedExpired, removed: expiredRemoved } =
		pruneExpiredRequests(reqs, nowMs)
	reqs = prunedExpired

	const existingIdx = reqs.findIndex((r) => r.id === normalizedId)
	const existingCodes = new Set(
		reqs.map((req) => (req.code || "").trim().toUpperCase())
	)

	if (existingIdx >= 0) {
		const existing = reqs[existingIdx]
		const existingCode = existing?.code?.trim() || ""
		const code = existingCode || generateUniqueCode(existingCodes)
		const next: PairingRequest = {
			id: normalizedId,
			code,
			createdAt: existing?.createdAt ?? now,
			lastSeenAt: now,
			meta: meta ?? existing?.meta
		}
		reqs[existingIdx] = next
		const { requests: capped } = pruneExcessRequests(reqs, PAIRING_PENDING_MAX)
		await writeJsonFileAtomic(filePath, { version: 1, requests: capped })
		return { code, created: false }
	}

	const { requests: capped, removed: cappedRemoved } = pruneExcessRequests(
		reqs,
		PAIRING_PENDING_MAX
	)
	reqs = capped

	if (PAIRING_PENDING_MAX > 0 && reqs.length >= PAIRING_PENDING_MAX) {
		if (expiredRemoved || cappedRemoved) {
			await writeJsonFileAtomic(filePath, { version: 1, requests: reqs })
		}
		return { code: "", created: false }
	}

	const code = generateUniqueCode(existingCodes)
	const next: PairingRequest = {
		id: normalizedId,
		code,
		createdAt: now,
		lastSeenAt: now,
		...(meta ? { meta } : {})
	}
	await writeJsonFileAtomic(filePath, { version: 1, requests: [...reqs, next] })
	return { code, created: true }
}

export async function approveACLPairingCode(
	workspaceDir: string,
	code: string
): Promise<{ id: string; entry?: PairingRequest } | null> {
	await ensureDir(getCredentialsPath(workspaceDir))
	const codeUpper = code.trim().toUpperCase()

	if (!codeUpper) {
		return null
	}

	const filePath = getPairingPath(workspaceDir)
	const { value } = await readJsonFile<PairingStore>(filePath, {
		version: 1,
		requests: []
	})

	const nowMs = Date.now()
	const { requests: pruned, removed } = pruneExpiredRequests(
		value.requests || [],
		nowMs
	)

	const idx = pruned.findIndex(
		(r) => (r.code || "").toUpperCase() === codeUpper
	)

	if (idx < 0) {
		if (removed) {
			await writeJsonFileAtomic(filePath, { version: 1, requests: pruned })
		}
		return null
	}

	const entry = pruned[idx]
	if (!entry) {
		return null
	}

	pruned.splice(idx, 1)
	await writeJsonFileAtomic(filePath, { version: 1, requests: pruned })

	await addACLAllowFromEntry(workspaceDir, entry.id)

	return { id: entry.id, entry }
}

export async function rejectACLPairingCode(
	workspaceDir: string,
	code: string
): Promise<{ id: string } | null> {
	await ensureDir(getCredentialsPath(workspaceDir))
	const codeUpper = code.trim().toUpperCase()

	if (!codeUpper) {
		return null
	}

	const filePath = getPairingPath(workspaceDir)
	const { value } = await readJsonFile<PairingStore>(filePath, {
		version: 1,
		requests: []
	})

	const nowMs = Date.now()
	const { requests: pruned, removed } = pruneExpiredRequests(
		value.requests || [],
		nowMs
	)

	const idx = pruned.findIndex(
		(r) => (r.code || "").toUpperCase() === codeUpper
	)

	if (idx < 0) {
		if (removed) {
			await writeJsonFileAtomic(filePath, { version: 1, requests: pruned })
		}
		return null
	}

	const entry = pruned[idx]
	if (!entry) {
		return null
	}

	pruned.splice(idx, 1)
	await writeJsonFileAtomic(filePath, { version: 1, requests: pruned })

	return { id: entry.id }
}

// Legacy API compatibility (deprecated)
export async function addOwner(
	workspaceDir: string,
	userId: string
): Promise<{ success: boolean; message: string }> {
	try {
		const { changed } = await addACLAllowFromEntry(workspaceDir, userId)
		if (changed) {
			return { success: true, message: `Added ${userId} as owner` }
		}
		return { success: false, message: "Address is already an owner" }
	} catch (err) {
		return { success: false, message: String(err) }
	}
}

export async function removeOwner(
	workspaceDir: string,
	userId: string
): Promise<{ success: boolean; message: string }> {
	try {
		const { changed } = await removeACLAllowFromEntry(workspaceDir, userId)
		if (changed) {
			return { success: true, message: `Removed ${userId} from owners` }
		}
		return { success: false, message: "Address is not an owner" }
	} catch (err) {
		return { success: false, message: String(err) }
	}
}
