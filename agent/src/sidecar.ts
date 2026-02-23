import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "dotenv"

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, "..", "..", ".env.local") })
config({ path: join(__dirname, "..", ".env.local") })
config({ path: join(__dirname, ".env.local") })

import { randomUUID } from "node:crypto"
import { getDbPath } from "@hybrd/xmtp"
import {
	Agent as XmtpAgent,
	XmtpEnv,
	createSigner,
	createUser
} from "@xmtp/agent-sdk"

const CONTAINER_PORT = process.env.CONTAINER_PORT || "4100"
const XMTP_ENV = process.env.XMTP_ENV || "dev"

async function startSidecar() {
	console.log("\n  ╭──────────────────────────────────────────────────╮")
	console.log("  │              XMTP Sidecar                         │")
	console.log("  ╰──────────────────────────────────────────────────╯")
	console.log()

	const { XMTP_WALLET_KEY, XMTP_DB_ENCRYPTION_KEY } = process.env

	if (!XMTP_WALLET_KEY) {
		console.error("❌ XMTP_WALLET_KEY is required")
		process.exit(1)
	}

	if (!XMTP_DB_ENCRYPTION_KEY) {
		console.error("❌ XMTP_DB_ENCRYPTION_KEY is required")
		process.exit(1)
	}

	console.log(`  XMTP Net   ${XMTP_ENV}`)
	console.log(`  Container  http://localhost:${CONTAINER_PORT}`)
	console.log()

	const user = createUser(XMTP_WALLET_KEY as `0x${string}`)
	const signer = createSigner(user)
	const address = user.account.address.toLowerCase()

	console.log(`  Wallet     ${address}`)
	console.log()
	console.log("  ─────────────────────────────────────────────────")
	console.log()
	console.log("  Connecting to XMTP...")

	const agentDbPath = await getDbPath(`sidecar-${XMTP_ENV}-${address}`)

	const xmtp = await XmtpAgent.create(signer, {
		env: XMTP_ENV as XmtpEnv,
		dbPath: agentDbPath
	})

	console.log("  ✓ Connected to XMTP")
	console.log()
	console.log("  ─────────────────────────────────────────────────")
	console.log()
	console.log("  Listening for messages...")
	console.log()

	xmtp.on("text", async ({ conversation, message }) => {
		try {
			console.log(`\n📨 [text] from ${message.senderInboxId.slice(0, 8)}...`)
			console.log(
				`  "${message.content.slice(0, 50)}${message.content.length > 50 ? "..." : ""}"`
			)

			const messages = [
				{ id: randomUUID(), role: "user" as const, content: message.content }
			]

			console.log(`  → Forwarding to container...`)

			const response = await fetch(
				`http://localhost:${CONTAINER_PORT}/api/chat`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						messages,
						chatId: conversation.id
					})
				}
			)

			if (!response.ok) {
				console.error(`  ❌ Container error: ${response.status}`)
				const errorText = await response.text()
				console.error(`  ❌ Error body: ${errorText}`)
				return
			}

			console.log(`  ← Receiving response stream...`)

			const reader = response.body?.getReader()
			if (!reader) {
				console.error(`  ❌ No response body reader`)
				return
			}

			let fullResponse = ""
			const decoder = new TextDecoder()

			while (true) {
				const { done, value } = await reader.read()
				if (done) {
					console.log(`  ✓ Stream complete`)
					break
				}

				const chunk = decoder.decode(value)
				const lines = chunk.split("\n")

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6)
						if (data === "[DONE]") {
							console.log(`  ✓ Received [DONE]`)
							continue
						}

						try {
							const parsed = JSON.parse(data)
							if (parsed.type === "text" && parsed.content) {
								fullResponse += parsed.content
								process.stdout.write(parsed.content)
							} else if (parsed.type === "error") {
								console.error(`  ❌ Agent error: ${parsed.content}`)
							} else if (parsed.type === "usage") {
								console.log(
									`\n  📊 Usage: ${parsed.inputTokens} in / ${parsed.outputTokens} out`
								)
							}
						} catch (parseErr) {
							console.error(`  ⚠️ Failed to parse SSE: ${data.slice(0, 100)}`)
						}
					}
				}
			}

			console.log("\n")

			if (fullResponse) {
				console.log(`  → Sending reply via XMTP...`)
				await conversation.send(fullResponse)
				console.log(`  ✓ Reply sent`)
			}
		} catch (err) {
			console.error("❌ Error handling text message:", err)
			console.error("Stack:", err instanceof Error ? err.stack : "no stack")
		}
	})

	xmtp.on("reaction", async ({ conversation, message }) => {
		console.log(`\n📨 [reaction] from ${message.senderInboxId.slice(0, 8)}...`)
		console.log(`  Reaction: ${message.content.content}`)
	})

	xmtp.on("reply", async ({ conversation, message }) => {
		try {
			console.log(`\n📨 [reply] from ${message.senderInboxId.slice(0, 8)}...`)

			const text = message.content.content as string
			console.log(`  "${text.slice(0, 50)}${text.length > 50 ? "..." : ""}"`)

			const messages = [
				{ id: randomUUID(), role: "user" as const, content: text }
			]

			console.log(`  → Forwarding to container...`)

			const response = await fetch(
				`http://localhost:${CONTAINER_PORT}/api/chat`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						messages,
						chatId: conversation.id
					})
				}
			)

			if (!response.ok) {
				console.error(`  ❌ Container error: ${response.status}`)
				return
			}

			const reader = response.body?.getReader()
			if (!reader) return

			let fullResponse = ""
			const decoder = new TextDecoder()

			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				const chunk = decoder.decode(value)
				const lines = chunk.split("\n")

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6)
						if (data === "[DONE]") continue

						try {
							const parsed = JSON.parse(data)
							if (parsed.type === "text" && parsed.content) {
								fullResponse += parsed.content
							}
						} catch {
							// Skip invalid JSON
						}
					}
				}
			}

			if (fullResponse) {
				await conversation.send(fullResponse)
				console.log(`  ✓ Reply sent`)
			}
		} catch (err) {
			console.error("❌ Error handling reply:", err)
		}
	})

	xmtp.start()
}

startSidecar().catch((error) => {
	console.error("💥 Fatal error:", error)
	process.exit(1)
})
