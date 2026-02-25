process.stdout.write("[sidecar] Starting XMTP sidecar...\n")
process.stdout.write(`[sidecar] Node version: ${process.version}\n`)

process.on("uncaughtException", (err) => {
	process.stderr.write(`[sidecar] FATAL: ${err.message}\n`)
	process.exit(1)
})

process.on("unhandledRejection", (reason) => {
	process.stderr.write(`[sidecar] FATAL: ${reason}\n`)
	process.exit(1)
})

const { randomUUID } = require("node:crypto")
const { Agent, createUser } = require("@xmtp/agent-sdk")
const { toBytes } = require("viem")

const log = (msg) => process.stdout.write(`${msg}\n`)

const AGENT_PORT = process.env.AGENT_PORT || "4100"
const XMTP_ENV = process.env.XMTP_ENV || "dev"

async function startSidecar() {
	log(`\n  XMTP Sidecar`)
	log(`  Port: ${AGENT_PORT}`)
	log(`  Env: ${XMTP_ENV}\n`)

	const key = process.env.AGENT_WALLET_KEY
	const secret = process.env.AGENT_SECRET

	if (!key || !secret) {
		process.stderr.write("ERROR: AGENT_WALLET_KEY and AGENT_SECRET required\n")
		process.exit(1)
	}

	log("  Creating wallet...")
	const user = createUser(key)

	const identifier = {
		identifier: user.account.address.toLowerCase(),
		identifierKind: 0
	}

	const signer = {
		type: "EOA",
		getIdentifier: () => identifier,
		signMessage: async (message) => {
			const sig = await user.account.signMessage({ message })
			return toBytes(sig)
		}
	}

	log(`  Wallet: ${user.account.address}`)
	log("  Connecting to XMTP...")

	const dbEncryptionKey = new Uint8Array(Buffer.from(secret, "hex"))

	const agent = await Agent.create(signer, {
		env: XMTP_ENV,
		dbEncryptionKey
	})

	log("  Connected to XMTP")
	log("  Listening for messages...\n")

	agent.on("text", async ({ conversation, message }) => {
		log(
			`Message from ${message.senderInboxId.slice(0, 8)}: ${message.content.slice(0, 50)}`
		)

		try {
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
				log(`  Error from agent: ${res.status}`)
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
				log("  Replied")
			}
		} catch (err) {
			log(`  Error: ${err.message}`)
		}
	})

	agent.start()
}

startSidecar().catch((e) => {
	process.stderr.write(`ERROR: ${e.message}\n`)
	process.exit(1)
})
