import { Client } from "@xmtp/node-sdk"
import {
	createSigner,
	generateEncryptionKeyHex,
	getDbPath
} from "../src/client"
import { revokeOldInstallations } from "./revoke-installations"

async function revokeAllInstallations() {
	console.log("🔄 Revoking ALL XMTP Installations")
	console.log("==================================")

	const { AGENT_WALLET_KEY, AGENT_SECRET, XMTP_ENV } = process.env

	if (!AGENT_WALLET_KEY) {
		console.error("❌ AGENT_WALLET_KEY is required")
		process.exit(1)
	}

	const env = XMTP_ENV || "dev"
	console.log(`🌐 Environment: ${env}`)

	// Create signer
	const signer = createSigner(AGENT_WALLET_KEY as `0x${string}`)
	const identifier = await signer.getIdentifier()
	const address = identifier.identifier

	console.log(`🔑 Wallet Address: ${address}`)

	// Try to get inbox ID from error message by attempting to create a client
	let inboxId: string | undefined

	try {
		console.log("\n📧 Looking up Inbox ID...")

		// Try to create a client - this will fail with the installation limit error
		// but the error message contains the inbox ID
		const dbEncryptionKey = AGENT_SECRET
			? new Uint8Array(Buffer.from(AGENT_SECRET, "hex"))
			: new Uint8Array(Buffer.from(generateEncryptionKeyHex(), "hex"))

		const dbPath = await getDbPath(`${env}-${address}`)

		await Client.create(signer, {
			dbEncryptionKey,
			env: env as "dev" | "production",
			dbPath
		})

		// If we get here, client was created successfully
		console.log("✅ No installation limit reached - no need to revoke")
		return
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)

		// Extract inbox ID from error message
		const inboxIdMatch = errorMessage.match(/InboxID ([a-f0-9]{64})/i)
		if (inboxIdMatch) {
			inboxId = inboxIdMatch[1]
			console.log(`📧 Found Inbox ID: ${inboxId}`)
		}

		// Check if it's actually an installation limit error
		if (!errorMessage.includes("installations") && !inboxId) {
			console.error("❌ Unexpected error:", errorMessage)
			process.exit(1)
		}
	}

	if (!inboxId) {
		console.error("\n❌ Could not determine Inbox ID")
		console.error(
			"This usually means there's no existing XMTP identity for this wallet."
		)
		console.error("\nTry running 'hybrid register' to create a new identity.")
		process.exit(1)
	}

	console.log("\n🔧 Attempting to revoke all installations...")

	const success = await revokeOldInstallations(signer, inboxId)

	if (success) {
		console.log("\n✅ Successfully revoked all installations")
		console.log(
			"   You can now run 'hybrid register' to create a new installation"
		)
	} else {
		console.log("\n❌ Failed to revoke installations")
		process.exit(1)
	}
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	revokeAllInstallations().catch((error) => {
		console.error("💥 Fatal error:", error)
		process.exit(1)
	})
}

export { revokeAllInstallations }
