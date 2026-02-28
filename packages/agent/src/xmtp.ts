process.stdout.write("[sidecar] Starting XMTP sidecar...\n")
process.stdout.write(`[sidecar] Node version: ${process.version}\n`)
process.stdout.write(
	`[sidecar] Platform: ${process.platform} ${process.arch}\n`
)

process.on("uncaughtException", (err) => {
	process.stderr.write(`[sidecar] FATAL: ${err.message}\n`)
	process.stderr.write(`[sidecar] Stack: ${err.stack}\n`)
	process.exit(1)
})

process.on("unhandledRejection", (reason) => {
	process.stderr.write(`[sidecar] FATAL: ${reason}\n`)
	process.exit(1)
})

process.stdout.write("[sidecar] Loading crypto...\n")
import { randomUUID } from "node:crypto"
process.stdout.write("[sidecar] Loading viem...\n")
import { toBytes } from "viem"
process.stdout.write("[sidecar] Loading XMTP SDK...\n")
import { Agent, createUser } from "@xmtp/agent-sdk"
process.stdout.write("[sidecar] All imports loaded\n")

const log = (msg: string) => process.stdout.write(`${msg}\n`)

const AGENT_PORT = process.env.AGENT_PORT || "4100"
const XMTP_ENV = (process.env.XMTP_ENV || "dev") as "dev" | "production"

async function startSidecar() {
	log(`\n  XMTP Sidecar`)
	log(`  Port: ${AGENT_PORT}`)
	log(`  Env: ${XMTP_ENV}\n`)

	const key = process.env.AGENT_WALLET_KEY
	const secret = process.env.AGENT_SECRET

	if (!key || !secret) {
		process.stderr.write(
			"WARN: AGENT_WALLET_KEY and AGENT_SECRET not set, XMTP sidecar disabled\n"
		)
		process.stderr.write("Set these in .env to enable XMTP messaging\n")
		// Don't exit - keep process alive but don't connect to XMTP
		await new Promise(() => {}) // hang forever
		return
	}

	log("  Creating wallet...")
	const user = createUser(key as `0x${string}`)

	const identifier = {
		identifier: user.account.address.toLowerCase(),
		identifierKind: 0
	}

	const signer = {
		type: "EOA" as const,
		getIdentifier: () => identifier,
		getChainId: async () => BigInt(1),
		signMessage: async (message: string) => {
			const sig = await user.account.signMessage({ message })
			return toBytes(sig)
		}
	}

	log(`  Wallet: ${user.account.address}`)
	log("  Connecting to XMTP...")

	const dbEncryptionKey = new Uint8Array(Buffer.from(secret, "hex"))

	const agent = await Agent.create(signer as any, {
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
			log(`  Error: ${(err as Error).message}`)
		}
	})

	agent.start()
}

startSidecar().catch((e) => {
	process.stderr.write(`ERROR: ${e.message}\n`)
	process.exit(1)
})
