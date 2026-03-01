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

const AGENT_PORT = process.env.AGENT_PORT || "8454"
const XMTP_ENV = (process.env.XMTP_ENV || "dev") as "dev" | "production"
const MAX_HISTORY_MESSAGES = 20

const processedMessages = new Set<string>()
const MAX_PROCESSED = 1000

async function startSidecar() {
	log(`[xmtp] starting (env: ${XMTP_ENV})`)

	const key = process.env.AGENT_WALLET_KEY
	const secret = process.env.AGENT_SECRET

	if (!key || !secret) {
		process.stderr.write(
			"[xmtp] WARN: AGENT_WALLET_KEY and AGENT_SECRET not set\n"
		)
		await new Promise(() => {})
		return
	}

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

	log(`[xmtp] wallet: ${user.account.address.slice(0, 10)}...`)

	const dbEncryptionKey = new Uint8Array(Buffer.from(secret, "hex"))

	const agent = await Agent.create(signer as any, {
		env: XMTP_ENV,
		dbEncryptionKey
	})

	log(`[xmtp] connected`)

	const botInboxId = agent.client.inboxId

	agent.on("text", async ({ conversation, message }) => {
		log(`[xmtp] received message: ${message.id}`)

		if (processedMessages.has(message.id)) {
			log(`[xmtp] skipping duplicate: ${message.id}`)
			return
		}
		processedMessages.add(message.id)

		if (processedMessages.size > MAX_PROCESSED) {
			const arr = Array.from(processedMessages)
			arr
				.slice(0, MAX_PROCESSED / 2)
				.forEach((id) => processedMessages.delete(id))
		}

		log(
			`[xmtp] ${message.senderInboxId.slice(0, 8)}: ${message.content.slice(0, 50)}`
		)

		const requestId = randomUUID()
		try {
			let historyMessages: Array<{
				id: string
				role: "user" | "assistant"
				content: string
			}> = []

			try {
				const history = await conversation.messages({
					limit: MAX_HISTORY_MESSAGES + 1,
					direction: 1
				})

				log(`[xmtp] raw history: ${history.length} messages from XMTP`)

				const filtered = history
					.filter((msg) => msg.id !== message.id)
					.filter((msg) => msg.content && typeof msg.content === "string")
					.slice(0, MAX_HISTORY_MESSAGES)
					.reverse()

				log(`[xmtp] after filter: ${filtered.length} messages`)

				historyMessages = filtered.map((msg) => ({
					id: msg.id,
					role:
						msg.senderInboxId === botInboxId
							? ("assistant" as const)
							: ("user" as const),
					content: msg.content as string
				}))
			} catch (historyErr) {
				log(`[xmtp] history error: ${(historyErr as Error).message}`)
			}

			const messages = [
				...historyMessages,
				{ id: randomUUID(), role: "user" as const, content: message.content }
			]

			log(`[xmtp] sending ${messages.length} total messages to agent`)

			const res = await fetch(`http://localhost:${AGENT_PORT}/api/chat`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Request-ID": requestId,
					"X-Source": "xmtp-sidecar"
				},
				body: JSON.stringify({
					messages,
					chatId: conversation.id,
					userId: message.senderInboxId,
					requestId
				})
			})

			if (!res.ok) {
				log(`[xmtp] error: ${res.status}`)
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
			}
		} catch (err) {
			log(`[xmtp] error: ${(err as Error).message}`)
		}
	})

	log(`[xmtp] starting message stream...`)
	await agent.start()
	log(`[xmtp] listening for messages`)
}

startSidecar().catch((e) => {
	process.stderr.write(`ERROR: ${e.message}\n`)
	process.exit(1)
})
