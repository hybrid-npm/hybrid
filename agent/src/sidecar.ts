// Log immediately - this runs before imports in bundled code
console.log("[sidecar] ========================================")
console.log("[sidecar] Starting XMTP sidecar (pre-import)...")
console.log("[sidecar] Node version:", process.version)
console.log("[sidecar] Platform:", process.platform)
console.log("[sidecar] Arch:", process.arch)
console.log("[sidecar] CWD:", process.cwd())
console.log("[sidecar] ENV keys:", Object.keys(process.env).sort().join(", "))
console.log("[sidecar] ========================================")

// Catch errors before imports
process.on("uncaughtException", (err) => {
	console.error("[sidecar] FATAL Uncaught exception:", err.message)
	console.error("[sidecar] Stack:", err.stack)
	process.exit(1)
})

process.on("unhandledRejection", (reason) => {
	console.error("[sidecar] FATAL Unhandled rejection:", reason)
	process.exit(1)
})

// Now import - any errors will be caught by handlers above
import { randomUUID } from "node:crypto"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createUser, createXMTPClient, getDbPath } from "@hybrd/xmtp"

console.log("[sidecar] All imports successful")

const __dirname = dirname(fileURLToPath(import.meta.url))

// Catch all uncaught errors
process.on("uncaughtException", (err) => {
	console.error("[sidecar] Uncaught exception:", err.message)
	console.error("[sidecar] Stack:", err.stack)
	process.exit(1)
})

process.on("unhandledRejection", (reason, promise) => {
	console.error("[sidecar] Unhandled rejection:", reason)
	process.exit(1)
})

const AGENT_PORT = process.env.AGENT_PORT || "4100"
const XMTP_ENV = process.env.XMTP_ENV || "dev"

console.log(`[sidecar] AGENT_PORT=${AGENT_PORT}, XMTP_ENV=${XMTP_ENV}`)
console.log(`[sidecar] AGENT_WALLET_KEY set: ${!!process.env.AGENT_WALLET_KEY}`)
console.log(`[sidecar] AGENT_SECRET set: ${!!process.env.AGENT_SECRET}`)

async function startSidecar() {
	console.log("\n  ╭──────────────────────────────────────────────────╮")
	console.log("  │              XMTP Sidecar                         │")
	console.log("  ╰──────────────────────────────────────────────────╯")
	console.log()

	const AGENT_WALLET_KEY = process.env.AGENT_WALLET_KEY
	const AGENT_SECRET = process.env.AGENT_SECRET

	if (!AGENT_WALLET_KEY) {
		console.error("❌ AGENT_WALLET_KEY is required")
		process.exit(1)
	}

	if (!AGENT_SECRET) {
		console.error("❌ AGENT_SECRET is required")
		process.exit(1)
	}

	console.log(`  XMTP Net   ${XMTP_ENV}`)
	console.log(`  Agent      http://localhost:${AGENT_PORT}`)
	console.log()

	let user: ReturnType<typeof createUser>
	let address: string

	try {
		user = createUser(AGENT_WALLET_KEY as `0x${string}`)
		address = user.account.address.toLowerCase()
		console.log(`  Wallet     ${address}`)
		console.log()
		console.log("  ─────────────────────────────────────────────────")
		console.log()
		console.log("  Connecting to XMTP...")
	} catch (err) {
		console.error("❌ Failed to create wallet from AGENT_WALLET_KEY:", err)
		process.exit(1)
	}

	const agentDbPath = await getDbPath(`sidecar-${XMTP_ENV}-${address}`)

	let xmtp: Awaited<ReturnType<typeof createXMTPClient>>
	try {
		xmtp = await createXMTPClient(AGENT_WALLET_KEY, {
			persist: true,
			storagePath: agentDbPath
		})
		console.log("  ✓ Connected to XMTP")
		console.log()
		console.log("  ─────────────────────────────────────────────────")
		console.log()
		console.log("  Listening for messages...")
		console.log()
	} catch (err) {
		console.error("❌ Failed to connect to XMTP:", err)
		console.log("  Check that:")
		console.log("  - AGENT_WALLET_KEY is valid (64 char hex)")
		console.log("  - AGENT_SECRET is valid (64 char hex)")
		console.log(`  - XMTP_ENV is valid (dev or production, got: ${XMTP_ENV}`)
		process.exit(1)
	}

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

			const response = await fetch(`http://localhost:${AGENT_PORT}/api/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					messages,
					chatId: conversation.id
				})
			})

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

			const response = await fetch(`http://localhost:${AGENT_PORT}/api/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					messages,
					chatId: conversation.id
				})
			})

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
