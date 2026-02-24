import {
	createXMTPClient,
	logAgentDetails,
	validateEnvironment
} from "../src/client"

/**
 * Refresh XMTP Identity Script
 *
 * This script refreshes the bot's XMTP identity on the production network
 * to resolve association errors and missing identity updates
 */

async function refreshXMTPIdentity() {
	console.log("🔄 XMTP Identity Refresh")
	console.log("========================")

	// Validate environment
	const { AGENT_WALLET_KEY } = validateEnvironment(["AGENT_WALLET_KEY"])

	if (!AGENT_WALLET_KEY) {
		console.error("❌ AGENT_WALLET_KEY is required")
		process.exit(1)
	}

	try {
		console.log(`🌐 Environment: ${process.env.XMTP_ENV || "dev"}`)

		// Step 1: Create client with persistence to force identity refresh
		console.log("\n📋 Step 1: Creating client with persistence...")
		const persistentClient = await createXMTPClient(AGENT_WALLET_KEY, {
			persist: true
		})

		console.log(
			`🔑 Wallet Address: ${persistentClient.accountIdentifier?.identifier}`
		)
		console.log(`🌐 XMTP Environment: ${process.env.XMTP_ENV || "dev"}`)

		// Step 2: Force full sync
		console.log("\n📋 Step 2: Forcing full conversation sync...")
		await persistentClient.conversations.sync()

		// Step 3: List conversations
		const conversations = await persistentClient.conversations.list()
		console.log(`📬 Found ${conversations.length} conversations`)

		// Step 4: Display agent details
		console.log("\n📋 Step 3: Displaying refreshed identity details...")
		await logAgentDetails(persistentClient)

		// Step 5: Test identity resolution
		console.log("\n📋 Step 4: Testing identity resolution...")

		if (conversations.length > 0) {
			const testConv = conversations[0]
			if (!testConv) {
				console.log("❌ No valid conversation found")
				return
			}

			try {
				// Get all participants
				const members = await testConv.members()
				console.log(`👥 Conversation members: ${members.length}`)

				for (const member of members) {
					console.log(`   - Inbox ID: ${member.inboxId}`)
					console.log(`   - Installation IDs: ${member.installationIds.length}`)

					// Try to resolve addresses
					try {
						const inboxState =
							await persistentClient.preferences.inboxStateFromInboxIds([
								member.inboxId
							])
						if (
							inboxState.length > 0 &&
							inboxState[0] &&
							inboxState[0].identifiers.length > 0
						) {
							const identifier = inboxState[0]?.identifiers[0]?.identifier
							console.log(`   - Address: ${identifier || "Unable to resolve"}`)
						} else {
							console.log(`   - Address: Unable to resolve`)
						}
					} catch (error) {
						const err = error as Error
						console.log(`   - Address: Error resolving - ${err.message}`)
					}
				}
			} catch (error) {
				const err = error as Error
				console.log(`❌ Error testing conversation: ${err.message}`)
			}
		}

		console.log("\n✅ Identity refresh completed successfully!")
		console.log("🔄 Try processing messages again")
	} catch (error) {
		const err = error as Error
		console.error("❌ Identity refresh failed:", err)

		if (err.message.includes("AGENT_SECRET")) {
			console.log("\n💡 Add AGENT_SECRET to your environment:")
			console.log("   export AGENT_SECRET=your_key_here")
			console.log(
				"   Or run: pnpm with-env pnpm --filter @hybrd/xmtp refresh:identity"
			)
		}

		process.exit(1)
	}
}

// Run the refresh
if (require.main === module) {
	refreshXMTPIdentity().catch(console.error)
}
