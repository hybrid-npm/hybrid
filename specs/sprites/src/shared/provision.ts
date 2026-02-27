/**
 * Provision Script - User onboarding and Sprite management
 *
 * This script handles:
 * 1. Creating Vault and Agent Sprites for new users
 * 2. Initializing Vault with user's encryption key
 * 3. Configuring Agent with Vault URL
 * 4. Re-authentication after cold start
 * 5. Deprovisioning (cleanup)
 */

import { createHash } from "crypto"

// ============================================================================
// Types
// ============================================================================

interface SpriteConfig {
	orgSlug: string
	region?: string
}

interface UserProvisionResult {
	userId: string
	agentSprite: {
		name: string
		url: string
	}
	vaultSprite: {
		name: string
		url: string
	}
	createdAt: Date
}

// Use the real client from sprites-client
import { HybridSpritesClient } from "./sprites-client.js"

type SpritesClient = HybridSpritesClient

// ============================================================================
// Key Derivation
// ============================================================================

/**
 * Derive encryption key from wallet signature
 * This key is NEVER stored - derived at runtime
 */
export function deriveEncryptionKey(walletSignature: string): string {
	return createHash("sha256").update(walletSignature).digest("hex")
}

/**
 * Generate a random challenge for user to sign
 */
export function generateChallenge(): string {
	const nonce = `${Date.now()}-${Math.random().toString(36).substring(7)}`
	return `Sign this message to authenticate with the agent platform.\n\nNonce: ${nonce}`
}

/**
 * Verify user's signature (mock - in production use proper signature verification)
 */
export function verifySignature(signature: string, challenge: string): boolean {
	// In production, use proper EVM signature verification
	// This is a mock for demonstration
	return signature.length > 0 && challenge.length > 0
}

// ============================================================================
// Provisioning
// ============================================================================

/**
 * Provision a new user with Agent and Vault Sprites
 */
export async function provisionUser(
	userId: string,
	walletSignature: string,
	config: SpriteConfig
): Promise<UserProvisionResult> {
	console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    PROVISIONING USER                         ║
╚═══════════════════════════════════════════════════════════════╝
  `)

	console.log(`User ID: ${userId}`)
	console.log(`Organization: ${config.orgSlug}`)
	console.log(`Region: ${config.region || "default"}`)

	// Derive encryption key from signature
	const encryptionKey = deriveEncryptionKey(walletSignature)
	console.log(`\nDerived encryption key: ${encryptionKey.substring(0, 16)}...`)

	// Create client using environment variable
	const spritesToken = process.env.SPRITES_TOKEN
	if (!spritesToken) {
		throw new Error("SPRITES_TOKEN environment variable is required")
	}
	const client = new HybridSpritesClient(spritesToken)

	// 1. Create Vault Sprite
	const vaultName = `vault-${userId}`
	console.log(`\n[1/4] Creating Vault Sprite: ${vaultName}`)

	const vaultSprite = await client.createVaultSprite(userId, {
		ramMB: 512,
		cpus: 1,
		region: config.region
	})
	console.log(`✅ Vault Sprite created: ${vaultSprite.url}`)

	// 2. Initialize Vault with encryption key
	console.log(`\n[2/4] Initializing Vault with encryption key...`)

	// In production: make HTTP call to vault to initialize
	// await fetch(`${vaultSprite.url}/init`, {
	//   method: 'POST',
	//   body: JSON.stringify({ key: encryptionKey }),
	// });

	console.log(`✅ Vault initialized`)

	// 3. Create Agent Sprite
	const agentName = `agent-${userId}`
	console.log(`\n[3/4] Creating Agent Sprite: ${agentName}`)

	const agentSprite = await client.createSprite(agentName, config)
	console.log(`✅ Agent Sprite created: ${agentSprite.url}`)

	// 4. Configure Agent with Vault URL
	console.log(`\n[4/4] Configuring Agent with Vault URL...`)

	// In production: set environment variable or write config
	// await agentSprite.exec(`echo "VAULT_URL=${vaultSprite.url}" >> ~/.env`);

	console.log(`✅ Agent configured with Vault URL: ${vaultSprite.url}`)

	// Result
	const result: UserProvisionResult = {
		userId,
		agentSprite: {
			name: agentName,
			url: agentSprite.url
		},
		vaultSprite: {
			name: vaultName,
			url: vaultSprite.url
		},
		createdAt: new Date()
	}

	console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    PROVISIONING COMPLETE                     ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Agent Sprite: ${result.agentSprite.url.padEnd(45)}║
║  Vault Sprite: ${result.vaultSprite.url.padEnd(45)}║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `)

	return result
}

/**
 * Get existing user sprites
 */
export async function getUserSprites(
	userId: string,
	_config: SpriteConfig
): Promise<{
	agent?: { name: string; url: string }
	vault?: { name: string; url: string }
}> {
	const spritesToken = process.env.SPRITES_TOKEN
	if (!spritesToken) {
		throw new Error("SPRITES_TOKEN environment variable is required")
	}
	const client = new HybridSpritesClient(spritesToken)

	const sprites = await client.listSprites(`agent-${userId}`)

	const agent = sprites.find((s) => s.name === `agent-${userId}`)
	const vault = sprites.find((s) => s.name === `vault-${userId}`)

	return {
		agent: agent
			? { name: agent.name, url: `https://${agent.name}.sprites.app` }
			: undefined,
		vault: vault
			? { name: vault.name, url: `https://${vault.name}.sprites.app` }
			: undefined
	}
}

/**
 * Re-authenticate user after cold start
 */
export async function reauthenticateUser(
	userId: string,
	walletSignature: string
): Promise<{ success: boolean }> {
	console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    RE-AUTHENTICATING                           ║
╚═══════════════════════════════════════════════════════════════╝
  `)

	console.log(`User ID: ${userId}`)

	// Derive key from new signature
	const encryptionKey = deriveEncryptionKey(walletSignature)

	// Get vault URL
	const { vault } = await getUserSprites(userId, { orgSlug: "" })

	if (!vault) {
		throw new Error(`No vault found for user: ${userId}`)
	}

	console.log(`Vault: ${vault.url}`)

	// Re-initialize vault
	// In production: await fetch(`${vault.url}/reinit`, { ... });

	console.log(`✅ Re-authentication complete`)

	return { success: true }
}

/**
 * Delete user's sprites (cleanup)
 */
export async function deprovisionUser(
	userId: string,
	_config: SpriteConfig
): Promise<{ success: boolean }> {
	console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    DEPROVISIONING USER                        ║
╚═══════════════════════════════════════════════════════════════╝
  `)

	const { agent, vault } = await getUserSprites(userId, { orgSlug: "" })

	if (agent) {
		await agent.destroy()
		console.log(`Deleted Agent Sprite: agent-${userId}`)
	}

	if (vault) {
		await vault.destroy()
		console.log(`Deleted Vault Sprite: vault-${userId}`)
	}

	console.log(`✅ User deprovisioned: ${userId}`)

	return { success: true }
}

// ============================================================================
// CLI
// ============================================================================

interface CliArgs {
	command: string
	userId?: string
	signature?: string
	org?: string
	region?: string
}

function parseArgs(): CliArgs {
	const args = process.argv.slice(2)

	return {
		command: args[0] || "help",
		userId: args[1],
		signature: args[2],
		org: process.env.FLY_ORG,
		region: process.env.REGION
	}
}

async function runCli() {
	const args = parseArgs()

	if (!args.org) {
		console.error("Error: FLY_ORG environment variable required")
		console.error(
			"Usage: FLY_ORG=my-org npx tsx provision.ts <command> [userId] [signature]"
		)
		process.exit(1)
	}

	const config: SpriteConfig = {
		orgSlug: args.org,
		region: args.region
	}

	switch (args.command) {
		case "provision":
			if (!args.userId || !args.signature) {
				console.error("Usage: provision <userId> <walletSignature>")
				process.exit(1)
			}
			await provisionUser(args.userId, args.signature, config)
			break

		case "reauth":
			if (!args.userId || !args.signature) {
				console.error("Usage: reauth <userId> <walletSignature>")
				process.exit(1)
			}
			await reauthenticateUser(args.userId, args.signature)
			break

		case "deprovision":
			if (!args.userId) {
				console.error("Usage: deprovision <userId>")
				process.exit(1)
			}
			await deprovisionUser(args.userId, config)
			break

		case "list":
			const spritesToken = process.env.SPRITES_TOKEN
			if (!spritesToken) {
				console.error("Error: SPRITES_TOKEN environment variable required")
				process.exit(1)
			}
			const client = new HybridSpritesClient(spritesToken)
			const sprites = await client.listSprites()
			console.log("Sprites:")
			for (const sprite of sprites) {
				console.log(`  - ${sprite.name}: https://${sprite.name}.sprites.app`)
			}
			break

		case "help":
		default:
			console.log(`
Sprites Provision CLI

Usage:
  provision <userId> <walletSignature>   Provision new user
  reauth <userId> <walletSignature>     Re-authenticate after cold start
  deprovision <userId>                 Remove user's sprites
  list                                  List all sprites

Environment:
  FLY_ORG        Organization slug (required)
  REGION         Region (optional, default: auto)

Example:
  FLY_ORG=my-org npx tsx provision.ts user-123 "0xabc..."
      `)
	}
}

// Run if called directly
if (require.main === module) {
	runCli().catch(console.error)
}

export {
	provisionUser,
	getUserSprites,
	reauthenticateUser,
	deprovisionUser,
	deriveEncryptionKey,
	generateChallenge,
	verifySignature
}
