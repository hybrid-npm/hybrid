import { toBytes } from "viem"
import { HDKey } from "viem/accounts"

/**
 * Derives a deterministic 32-byte secret from an agent wallet private key.
 *
 * Uses BIP-32 HD key derivation at path m/44'/60'/0'/0/41 (coin type 60 = ETH,
 * index 41 is arbitrary but fixed — chosen to avoid collision with standard
 * account derivation paths). The child private key is used directly as the
 * 32-byte secret, returned as a 64-character hex string.
 *
 * This means AGENT_SECRET never needs to be set separately — it is always
 * deterministically recoverable from AGENT_WALLET_KEY alone.
 */
export function deriveAgentSecret(walletKey: string): string {
	const keyBytes = toBytes(walletKey as `0x${string}`)
	const hdKey = HDKey.fromMasterSeed(keyBytes)
	const child = hdKey.derive("m/44'/60'/0'/0/41")
	if (!child.privateKey) {
		throw new Error("Failed to derive child key from wallet key")
	}
	return Buffer.from(child.privateKey).toString("hex")
}

/**
 * Resolves AGENT_SECRET: checks memory store first, then derives from wallet key.
 *
 * Priority:
 * 1. Memory store (loaded from /secrets/agent.key via secret-store)
 * 2. Environment variable (fallback for local dev)
 * 3. Derive from wallet key
 */
export function resolveAgentSecret(walletKey?: string): string {
	// Try memory store first (from secret-store module)
	try {
		// Dynamic import to avoid circular dependencies
		const secretStore = require("@hybrd/agent/lib/secret-store")
		if (secretStore.hasSecret("AGENT_SECRET")) {
			return secretStore.getAgentSecret()
		}
		if (secretStore.hasSecret("WALLET_KEY")) {
			return deriveAgentSecret(secretStore.getWalletKey())
		}
	} catch {
		// Secret store not available, fall through to env/derive
	}

	// Check environment variable (for local development)
	if (process.env.AGENT_SECRET) {
		return process.env.AGENT_SECRET
	}

	// Derive from wallet key
	const key = walletKey || process.env.AGENT_WALLET_KEY
	if (!key) {
		throw new Error(
			"AGENT_WALLET_KEY must be set to derive AGENT_SECRET automatically"
		)
	}
	return deriveAgentSecret(key)
}
