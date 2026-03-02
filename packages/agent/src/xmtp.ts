import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { Agent, createUser } from "@xmtp/agent-sdk"
import { Client } from "@xmtp/node-sdk"
import pc from "picocolors"
import { toBytes } from "viem"

const log = {
	info: (msg: string) => console.log(`${pc.magenta("[xmtp]")} ${msg}`),
	error: (msg: string) => console.error(`${pc.red("[xmtp]")} ${msg}`),
	warn: (msg: string) => console.log(`${pc.yellow("[xmtp]")} ${msg}`),
	success: (msg: string) => console.log(`${pc.green("[xmtp]")} ${msg}`)
}

const AGENT_PORT = process.env.AGENT_PORT || "8454"
const XMTP_ENV = (process.env.XMTP_ENV || "dev") as "dev" | "production"
const MAX_HISTORY_MESSAGES = 20

const processedMessages = new Set<string>()
const MAX_PROCESSED = 1000

process.on("uncaughtException", (err) => {
	log.error(`FATAL: ${err.message}`)
	process.exit(1)
})

process.on("unhandledRejection", (reason) => {
	log.error(`FATAL: ${reason}`)
	process.exit(1)
})

function printBanner(walletAddress?: string) {
	const isHotReload = process.env.TSX_WATCH === "true"

	console.log("")
	console.log(
		pc.magenta("  ╭───────────────────────────────────────────────────╮")
	)
	console.log(
		pc.magenta("  │") +
			pc.bold(pc.white("      XMTP Sidecar")) +
			pc.magenta("                             │")
	)
	console.log(
		pc.magenta("  ╰───────────────────────────────────────────────────╯")
	)
	console.log("")
	console.log(
		`  ${pc.bold("Network")}    ${XMTP_ENV === "production" ? pc.green("production") : pc.cyan("dev")}`
	)
	console.log(
		`  ${pc.bold("Wallet")}     ${walletAddress ? pc.cyan(walletAddress) : pc.gray("(not configured)")}`
	)
	console.log(`  ${pc.bold("Server")}     http://localhost:${AGENT_PORT}`)
	console.log("")

	if (isHotReload) {
		console.log(
			`  ${pc.yellow("⚡")} Hot reload enabled - watching for changes...`
		)
	} else {
		console.log(`  ${pc.green("✓")} Listening for messages...`)
	}
	console.log("")
}

async function startSidecar() {
	const key = process.env.AGENT_WALLET_KEY
	const secret = process.env.AGENT_SECRET

	if (!key || !secret) {
		log.warn("AGENT_WALLET_KEY and AGENT_SECRET not set")
		printBanner()
		await new Promise(() => {})
		return
	}

	const user = createUser(key as `0x${string}`)
	printBanner(user.account.address)

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

	const dbEncryptionKey = new Uint8Array(Buffer.from(secret, "hex"))

	const dbDir = path.join(process.cwd(), ".hybrid", ".xmtp")
	if (!fs.existsSync(dbDir)) {
		fs.mkdirSync(dbDir, { recursive: true })
	}
	const dbPath = path.join(
		dbDir,
		`xmtp-${XMTP_ENV}-${user.account.address.toLowerCase().slice(0, 8)}.db3`
	)

	const agent = await Agent.create(signer as any, {
		env: XMTP_ENV,
		dbEncryptionKey,
		dbPath
	})

	log.success("connected to XMTP network")

	const botInboxId = agent.client.inboxId

	agent.on("text", async ({ conversation, message }) => {
		log.info(`message ${pc.gray(message.id.slice(0, 8))}`)

		if (processedMessages.has(message.id)) {
			log.warn(`skipping duplicate: ${message.id.slice(0, 8)}`)
			return
		}
		processedMessages.add(message.id)

		if (processedMessages.size > MAX_PROCESSED) {
			const arr = Array.from(processedMessages)
			arr
				.slice(0, MAX_PROCESSED / 2)
				.forEach((id) => processedMessages.delete(id))
		}

		// Resolve wallet address from inboxId using static method
		let senderAddress = message.senderInboxId
		try {
			const states = await Client.inboxStateFromInboxIds(
				[message.senderInboxId],
				XMTP_ENV
			)
			const state = states[0]
			const ethId = state?.identifiers?.find((i: any) => i.identifierKind === 0)
			if (ethId?.identifier) {
				senderAddress = (ethId.identifier as string).toLowerCase()
				log.success(`user wallet: ${pc.cyan(senderAddress)}`)
			}
		} catch (err) {
			log.warn(`using inboxId: ${senderAddress.slice(0, 16)}...`)
		}

		const displayId = senderAddress.startsWith("0x")
			? senderAddress.slice(0, 10)
			: senderAddress.slice(0, 8)
		log.info(`${pc.cyan(displayId)}: ${message.content.slice(0, 50)}`)

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

				const filtered = history
					.filter((msg) => msg.id !== message.id)
					.filter((msg) => msg.content && typeof msg.content === "string")
					.slice(0, MAX_HISTORY_MESSAGES)
					.reverse()

				historyMessages = filtered.map((msg) => ({
					id: msg.id,
					role:
						msg.senderInboxId === botInboxId
							? ("assistant" as const)
							: ("user" as const),
					content: msg.content as string
				}))
			} catch (historyErr) {
				log.error(`history: ${(historyErr as Error).message}`)
			}

			const messages = [
				...historyMessages,
				{ id: randomUUID(), role: "user" as const, content: message.content }
			]

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
					userId: senderAddress,
					requestId
				})
			})

			if (!res.ok) {
				log.error(`HTTP ${res.status}`)
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
				log.success(`replied (${reply.length} chars)`)
			}
		} catch (err) {
			log.error((err as Error).message)
		}
	})

	log.info("starting message stream...")
	await agent.start()
	log.success("listening for messages")
}

startSidecar().catch((e) => {
	log.error(e.message)
	process.exit(1)
})
