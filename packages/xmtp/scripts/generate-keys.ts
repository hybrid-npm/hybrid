import { generateEncryptionKeyHex } from "@hybrd/xmtp"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

// Check Node.js version
const nodeVersion = process.versions.node
const [major] = nodeVersion?.split(".").map(Number) || [0]

if (major && major < 20) {
	console.error("Error: Node.js version 20 or higher is required")
	process.exit(1)
}

console.log("Generating XMTP keys...")

const walletKey = generatePrivateKey()
const account = privateKeyToAccount(walletKey)
const encryptionKeyHex = generateEncryptionKeyHex()
const publicKey = account.address

console.log("\n# === Generated Keys ===")
console.log(`# Public Address: ${publicKey}`)
console.log(`AGENT_WALLET_KEY=${walletKey}`)
console.log(`AGENT_SECRET=${encryptionKeyHex}`)

console.log("\nCopy the above environment variables to your .env file")
