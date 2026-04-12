/**
 * Sprites Platform - Main Export
 */

// Vault exports
export { default as vaultService } from "./vault/vault-service.js"
export { VaultClient } from "./agent/agent-storage.js"

// Agent exports
export {
	AgentStorage,
	EncryptedFileStorage,
	VaultClient as VaultStorage,
	createAgentStorage,
	createVaultClient
} from "./agent/agent-storage.js"

// Shared exports
export {
	provisionUser,
	getUserSprites,
	reauthenticateUser,
	deprovisionUser,
	deriveEncryptionKey,
	generateChallenge
} from "./shared/provision.js"

// Sprites client exports
export {
	HybridSpritesClient,
	createSpritesClient
} from "./shared/sprites-client.js"
export type {
	HybridSpriteConfig,
	HybridSpritePair,
	SpriteHandle,
	CheckpointResult
} from "./shared/sprites-client.js"

// Types
export type {
	VaultConfig,
	VaultStatus,
	SessionData,
	UserConfig
} from "./shared/types.js"
