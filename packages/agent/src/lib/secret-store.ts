/**
 * Secret Store - Memory-Only Secret Management
 *
 * Secrets are loaded from files at startup and stored only in memory.
 * They are NEVER stored in process.env or written to disk after load.
 *
 * Security guarantees:
 * - Secrets loaded from /secrets/* files (0400 permissions, app:app)
 * - Files are optionally deleted after load (configurable)
 * - Secrets stored in Map (memory only, not in process.env)
 * - Claude processes receive filtered environment
 */

import { existsSync, readFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"

export type SecretName = "WALLET_KEY" | "AGENT_SECRET"

const secrets = new Map<SecretName, string>()

const SECRET_PATHS: Record<SecretName, string> = {
	WALLET_KEY: process.env.SECRETS_PATH
		? join(process.env.SECRETS_PATH, "wallet.key")
		: "/secrets/wallet.key",
	AGENT_SECRET: process.env.SECRETS_PATH
		? join(process.env.SECRETS_PATH, "agent.key")
		: "/secrets/agent.key"
}

const DELETE_AFTER_LOAD = process.env.DELETE_SECRETS_AFTER_LOAD !== "false"

/**
 * Load all secrets from files into memory.
 * Call this ONCE at application startup, before any other initialization.
 *
 * After loading, secrets are stored only in memory and can be accessed
 * via getSecret(). They are never stored in process.env.
 */
export function loadSecrets(): void {
	for (const [name, path] of Object.entries(SECRET_PATHS) as [
		SecretName,
		string
	][]) {
		if (existsSync(path)) {
			const content = readFileSync(path, "utf-8").trim()
			secrets.set(name, content)

			if (DELETE_AFTER_LOAD) {
				try {
					unlinkSync(path)
				} catch (err) {
					console.warn(`[secret-store] Could not delete ${path}:`, err)
				}
			}
		}
	}
}

/**
 * Get a secret by name.
 * Returns undefined if the secret was not loaded.
 */
export function getSecret(name: SecretName): string | undefined {
	return secrets.get(name)
}

/**
 * Get the wallet private key.
 * Throws if not loaded.
 */
export function getWalletKey(): string {
	const key = secrets.get("WALLET_KEY")
	if (!key) {
		throw new Error("WALLET_KEY not loaded. Call loadSecrets() at startup.")
	}
	return key
}

/**
 * Get the derived agent secret.
 * Throws if not loaded.
 */
export function getAgentSecret(): string {
	const secret = secrets.get("AGENT_SECRET")
	if (!secret) {
		throw new Error("AGENT_SECRET not loaded. Call loadSecrets() at startup.")
	}
	return secret
}

/**
 * Check if a secret is loaded.
 */
export function hasSecret(name: SecretName): boolean {
	return secrets.has(name)
}

/**
 * Clear all secrets from memory.
 * Use with caution - only call during shutdown.
 */
export function clearSecrets(): void {
	secrets.clear()
}
