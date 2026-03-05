import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "dotenv"

const __dirname = dirname(fileURLToPath(import.meta.url))
// Try multiple possible locations for .env
const envPaths = [
	join(__dirname, "..", "..", "agents", "hybrid-agent", ".env"),
	join(__dirname, "..", "..", "..", "agents", "hybrid-agent", ".env"),
	join(__dirname, "..", "..", ".env")
]
for (const envPath of envPaths) {
	try {
		config({ path: envPath })
		break
	} catch {}
}

import {
	createSigner,
	createXMTPClient,
	getDbPath,
	logAgentDetails,
	validateEnvironment
} from "../src/client"

async function registerOnXMTP() {
	const XMTP_ENV = process.env.XMTP_ENV || "dev"
	const networkName = XMTP_ENV === "production" ? "Production" : "Dev"

	console.log(`🚀 Starting XMTP ${networkName} Network Registration...`)

	const { AGENT_WALLET_KEY } = validateEnvironment(["AGENT_WALLET_KEY"])

	if (!AGENT_WALLET_KEY) {
		console.error("❌ AGENT_WALLET_KEY is required for registration")
		process.exit(1)
	}

	try {
		console.log("🔑 Creating signer...")
		const signer = createSigner(AGENT_WALLET_KEY)

		const identifier = await signer.getIdentifier()
		const address = identifier.identifier
		console.log(`📍 Wallet Address: ${address}`)

		console.log(`🌐 Connecting to XMTP ${networkName} Network...`)
		if (XMTP_ENV === "production") {
			console.log("⚠️  This will prompt you to sign messages in your wallet")
			console.log("   - 'XMTP : Authenticate to inbox' message")
			console.log("   - 'Grant messaging access to app' message")
			console.log("   - 'Create inbox' message (if first time)")
		}

		const dbPath = await getDbPath(`${XMTP_ENV}-${address}`)
		console.log(`📁 Database path: ${dbPath}`)

		const client = await createXMTPClient(AGENT_WALLET_KEY)

		console.log(`✅ Successfully connected to XMTP ${networkName} Network!`)

		await logAgentDetails(client)

		console.log("📡 Syncing conversations...")
		await client.conversations.sync()

		const conversations = await client.conversations.list()
		console.log(`💬 Found ${conversations.length} existing conversations`)

		console.log("🎉 Registration Complete!")
		console.log(`
✓ Wallet ${address} is now registered on XMTP ${networkName} Network
✓ Inbox ID: ${client.inboxId}
✓ Database: ${XMTP_ENV}-${address}.db3
✓ Ready to receive messages on ${networkName.toLowerCase()} network

Next steps:
1. Start your listener service
2. Share your address for others to message: ${address}
3. Test messaging at: https://xmtp.chat/dm/${address}
    `)
	} catch (error) {
		console.error("❌ Registration failed:", error)

		if (error instanceof Error) {
			if (error.message.includes("User rejected")) {
				console.log(
					"📝 Registration was cancelled. You need to approve the wallet signatures to complete registration."
				)
			} else if (error.message.includes("network")) {
				console.log(
					"🌐 Network connection issue. Please check your internet connection and try again."
				)
			} else if (
				error.message.includes("database") ||
				error.message.includes("Unable to open")
			) {
				console.log(
					"💾 Database access issue. Please check file permissions and ensure the directory exists."
				)
			} else if (
				error.message.includes("base16") ||
				error.message.includes("hex")
			) {
				console.log("🔐 AGENT_WALLET_KEY must be a valid private key")
			} else {
				console.log("💡 Make sure your wallet is connected and try again.")
			}
		}

		process.exit(1)
	}
}

registerOnXMTP().catch((error) => {
	console.error("💥 Fatal error during registration:", error)
	process.exit(1)
})
