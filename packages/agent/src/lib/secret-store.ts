/**
 * Secret Store - Memory-Only Secret Management
 *
 * Secrets are loaded from files on the persistent volume at startup
 * and stored only in memory. They are NEVER stored in process.env.
 *
 * Security guarantees:
 * - Secrets loaded from /app/data/secrets/* files (0400 permissions, app:app)
 * - Files remain on persistent volume (owned by app, not readable by claude)
 * - Secrets stored in Map (memory only, not in process.env)
 * - Claude processes receive filtered environment (no secret keys)
 * - No environment variable dependencies for secrets
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

export type SecretName = "AGENT_WALLET_KEY"

const secrets = new Map<SecretName, string>()

function getSecretsDir(): string {
	const dataRoot = process.env.DATA_ROOT
	if (!dataRoot) return ""
	return join(dataRoot, "secrets")
}

function getSecretPaths(): Record<SecretName, string> {
	const secretsDir = getSecretsDir()
	return {
		AGENT_WALLET_KEY: join(secretsDir, "wallet.key")
	}
}

/**
 * Load all secrets from files into memory.
 * Call this ONCE at application startup, before any other initialization.
 *
 * Secret files live on the persistent volume at /app/data/secrets/
 * with 0400 permissions owned by app:app. They are NOT deleted after
 * load — they persist across deploys on the volume.
 */
export function loadSecrets(): void {
	const secretPaths = getSecretPaths()
	for (const [name, path] of Object.entries(secretPaths) as [
		SecretName,
		string
	][]) {
		if (existsSync(path)) {
			const content = readFileSync(path, "utf-8").trim()
			secrets.set(name, content)
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
	const key = secrets.get("AGENT_WALLET_KEY")
	if (!key) {
		throw new Error(
			"AGENT_WALLET_KEY not loaded. Call loadSecrets() at startup."
		)
	}
	return key
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
