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
 * Resolves AGENT_SECRET by deriving it from the provided wallet key.
 *
 * The wallet key must be passed explicitly — this function does not
 * read from environment variables or external stores.
 */
export function resolveAgentSecret(walletKey: string): string {
	if (!walletKey) {
		throw new Error("walletKey is required to derive AGENT_SECRET")
	}
	return deriveAgentSecret(walletKey)
}
