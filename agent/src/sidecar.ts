console.log("[sidecar] Starting XMTP sidecar...")
console.log("[sidecar] Node version:", process.version)

process.on("uncaughtException", (err) => {
	console.error("[sidecar] FATAL:", err.message)
	process.exit(1)
})

process.on("unhandledRejection", (reason) => {
	console.error("[sidecar] FATAL:", reason)
	process.exit(1)
})

import { randomUUID } from "node:crypto"
import { Agent, type XmtpEnv, createUser } from "@xmtp/agent-sdk"
import { toBytes } from "viem"

const AGENT_PORT = process.env.AGENT_PORT || "4100"
const XMTP_ENV = (process.env.XMTP_ENV || "dev") as XmtpEnv

async function startSidecar() {
	console.log(`\n  XMTP Sidecar`)
	console.log(`  Port: ${AGENT_PORT}`)
	console.log(`  Env: ${XMTP_ENV}\n`)

	const key = process.env.AGENT_WALLET_KEY
	const secret = process.env.AGENT_SECRET

	if (!key || !secret) {
		console.error("❌ AGENT_WALLET_KEY and AGENT_SECRET required")
		process.exit(1)
	}

	const user = createUser(key as `0x${string}`)

	const identifier = {
		identifier: user.account.address.toLowerCase(),
		identifierKind: 0
	}

	const signer = {
		type: "EOA" as const,
		getIdentifier: () => identifier,
		signMessage: async (message: string) => {
			const sig = await user.account.signMessage({ message })
			return toBytes(sig)
		}
	}

	console.log(`  Wallet: ${user.account.address}`)
	console.log("  Connecting to XMTP...")

	const dbEncryptionKey = new Uint8Array(Buffer.from(secret, "hex"))

	const agent = await Agent.create(signer, {
		env: XMTP_ENV,
		dbEncryptionKey
	})

	console.log("  ✓ Connected\n  Listening...\n")

	agent.on("text", async ({ conversation, message }) => {
		console.log(
			`📨 ${message.senderInboxId.slice(0, 8)}: ${message.content.slice(0, 50)}`
		)

		const res = await fetch(`http://localhost:${AGENT_PORT}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				messages: [
					{ id: randomUUID(), role: "user", content: message.content }
				],
				chatId: conversation.id
			})
		})

		if (!res.ok) {
			console.error(`  ❌ Error ${res.status}`)
			return
		}

		const reader = res.body?.getReader()
		if (!reader) return

		const decoder = new TextDecoder()
		let reply = ""

		while (true) {
			const { done, value } = await reader.read()
			if (done) break

			for (const line of decoder.decode(value).split("\n")) {
				if (line.startsWith("data: ") && line !== "data: [DONE]") {
					try {
						const p = JSON.parse(line.slice(6))
						if (p.type === "text" && p.content) reply += p.content
					} catch {}
				}
			}
		}

		if (reply) {
			await conversation.send(reply)
			console.log(`  ✓ Replied`)
		}
	})

	agent.start()
}

startSidecar().catch((e) => {
	console.error("💥", e)
	process.exit(1)
})
