/**
 * Hybrid Sprites Client - Wrapper around @fly/sprites SDK
 *
 * Provides:
 * - Simplified sprite creation/destruction
 * - Agent + Vault sprite pairing
 * - Service management
 * - Checkpoint/restore
 */

import {
	type ExecResult,
	type Sprite,
	type SpriteInfo,
	SpritesClient
} from "@fly/sprites"

export interface HybridSpriteConfig {
	ramMB?: number
	cpus?: number
	region?: string
	storageGB?: number
	env?: Record<string, string>
}

export interface HybridSpritePair {
	agentSprite: SpriteHandle
	vaultSprite: SpriteHandle
	agentUrl: string
	vaultUrl: string
}

export interface SpriteHandle {
	name: string
	url: string
	status: string
	exec: (command: string) => Promise<ExecResult>
	execFile: (file: string, args?: string[]) => Promise<ExecResult>
	checkpoint: (comment?: string) => Promise<CheckpointResult>
	restore: (checkpointId: string) => Promise<void>
	destroy: () => Promise<void>
	get: () => Promise<SpriteInfo>
}

export interface CheckpointResult {
	id: string
	createdAt: Date
	comment?: string
}

function getSpriteUrl(name: string): string {
	return `https://${name}.sprites.app`
}

export class HybridSpritesClient {
	private client: SpritesClient

	constructor(token: string) {
		this.client = new SpritesClient(token)
	}

	/**
	 * Create a new sprite pair (Agent + Vault) for a user
	 */
	async createSpritePair(
		userId: string,
		config?: HybridSpriteConfig
	): Promise<HybridSpritePair> {
		console.log(`[sprites] Creating sprite pair for user: ${userId}`)

		// Create Vault first (Agent depends on it)
		console.log(`[sprites] Creating vault sprite...`)
		const vaultSprite = await this.createVaultSprite(userId, config)

		// Create Agent
		console.log(`[sprites] Creating agent sprite...`)
		const agentSprite = await this.createAgentSprite(userId, config)

		console.log(`[sprites] Sprite pair created successfully`)
		console.log(`[sprites]   Agent: ${agentSprite.url}`)
		console.log(`[sprites]   Vault: ${vaultSprite.url}`)

		return {
			agentSprite: this.wrapSprite(agentSprite.name),
			vaultSprite: this.wrapSprite(vaultSprite.name),
			agentUrl: agentSprite.url,
			vaultUrl: vaultSprite.url
		}
	}

	/**
	 * Create a Vault sprite
	 */
	async createVaultSprite(
		userId: string,
		config?: HybridSpriteConfig
	): Promise<{ name: string; url: string }> {
		const name = `vault-${userId}`

		const sprite = await this.client.createSprite(name, {
			ramMB: config?.ramMB || 512,
			cpus: config?.cpus || 1,
			region: config?.region,
			storageGB: config?.storageGB
		})

		return {
			name: sprite.name,
			url: getSpriteUrl(sprite.name)
		}
	}

	/**
	 * Create an Agent sprite
	 */
	async createAgentSprite(
		userId: string,
		config?: HybridSpriteConfig
	): Promise<{ name: string; url: string }> {
		const name = `agent-${userId}`

		const sprite = await this.client.createSprite(name, {
			ramMB: config?.ramMB || 2048,
			cpus: config?.cpus || 2,
			region: config?.region,
			storageGB: config?.storageGB
		})

		return {
			name: sprite.name,
			url: getSpriteUrl(sprite.name)
		}
	}

	/**
	 * Get existing sprite pair
	 */
	async getSpritePair(userId: string): Promise<HybridSpritePair | null> {
		const agentName = `agent-${userId}`
		const vaultName = `vault-${userId}`

		let agentSprite: Sprite | null = null
		let vaultSprite: Sprite | null = null

		try {
			agentSprite = await this.client.getSprite(agentName)
		} catch {
			// Sprite doesn't exist
		}

		try {
			vaultSprite = await this.client.getSprite(vaultName)
		} catch {
			// Sprite doesn't exist
		}

		if (!agentSprite || !vaultSprite) {
			return null
		}

		return {
			agentSprite: this.wrapSprite(agentSprite.name),
			vaultSprite: this.wrapSprite(vaultSprite.name),
			agentUrl: getSpriteUrl(agentSprite.name),
			vaultUrl: getSpriteUrl(vaultSprite.name)
		}
	}

	/**
	 * Delete sprite pair
	 */
	async deleteSpritePair(userId: string): Promise<void> {
		const agentName = `agent-${userId}`
		const vaultName = `vault-${userId}`

		console.log(`[sprites] Deleting sprite pair for user: ${userId}`)

		try {
			await this.client.deleteSprite(agentName)
			console.log(`[sprites] Deleted: ${agentName}`)
		} catch (e) {
			console.warn(`[sprites] Failed to delete ${agentName}:`, e)
		}

		try {
			await this.client.deleteSprite(vaultName)
			console.log(`[sprites] Deleted: ${vaultName}`)
		} catch (e) {
			console.warn(`[sprites] Failed to delete ${vaultName}:`, e)
		}
	}

	/**
	 * List all sprites
	 */
	async listSprites(prefix?: string): Promise<SpriteInfo[]> {
		const sprites = await this.client.listAllSprites(prefix)
		return sprites.map((s) => ({
			id: s.id || "",
			name: s.name,
			organization: s.organizationName || "",
			status: s.status || "unknown",
			config: s.config,
			environment: s.environment,
			createdAt: s.createdAt || new Date(),
			updatedAt: s.updatedAt || new Date()
		}))
	}

	/**
	 * Get a single sprite
	 */
	async getSprite(name: string): Promise<SpriteHandle | null> {
		try {
			const sprite = await this.client.getSprite(name)
			return this.wrapSprite(sprite.name)
		} catch {
			return null
		}
	}

	/**
	 * Wrap sprite name with convenient methods
	 */
	private wrapSprite(spriteName: string): SpriteHandle {
		const sprite = this.client.sprite(spriteName)

		return {
			name: spriteName,
			url: getSpriteUrl(spriteName),
			status: "unknown",
			exec: async (command: string): Promise<ExecResult> => {
				return sprite.exec(command)
			},
			execFile: async (
				file: string,
				args: string[] = []
			): Promise<ExecResult> => {
				return sprite.execFile(file, args)
			},
			checkpoint: async (comment?: string): Promise<CheckpointResult> => {
				const response = await sprite.createCheckpoint(comment)
				const text = await response.text()
				const lines = text.trim().split("\n")
				const lastLine = lines[lines.length - 1]
				const data = JSON.parse(lastLine)

				return {
					id: data.id || data.checkpoint?.id || "unknown",
					createdAt: new Date(),
					comment
				}
			},
			restore: async (checkpointId: string): Promise<void> => {
				await sprite.restoreCheckpoint(checkpointId)
			},
			destroy: async (): Promise<void> => {
				await sprite.destroy()
			},
			get: async (): Promise<SpriteInfo> => {
				const s = await this.client.getSprite(spriteName)
				return {
					id: s.id || "",
					name: s.name,
					organization: s.organizationName || "",
					status: s.status || "unknown",
					config: s.config,
					environment: s.environment,
					createdAt: s.createdAt || new Date(),
					updatedAt: s.updatedAt || new Date()
				}
			}
		}
	}
}

/**
 * Create a Hybrid Sprites client
 */
export function createSpritesClient(token: string): HybridSpritesClient {
	return new HybridSpritesClient(token)
}
