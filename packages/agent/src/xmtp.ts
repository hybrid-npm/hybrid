import { randomUUID } from "node:crypto"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { resolveAgentSecret } from "@hybrd/xmtp"
import { getRole, parseACL } from "@hybrid/memory"
import { Agent, createUser } from "@xmtp/agent-sdk"
import { Client, type Signer } from "@xmtp/node-sdk"
import { config } from "dotenv"
import pc from "picocolors"
import { toBytes } from "viem"
import { getWalletKey, hasSecret, loadSecrets } from "./lib/secret-store"

// Resolve project directory (where hybrid dev was called from)
const projectDir = process.env.AGENT_PROJECT_ROOT || process.cwd()

// Load .env files from project directory FIRST (before any other code)
const envLocalPath = path.join(projectDir, ".env.local")
const envPath = path.join(projectDir, ".env")

config({ path: envLocalPath, override: true })
config({ path: envPath })

// Load secrets from persistent volume (must be after dotenv for DATA_ROOT)
loadSecrets()

// Debug output AFTER loading env and secrets
if (process.env.DEBUG) {
	console.log(`[xmtp] Project dir: ${projectDir}`)
	console.log(`[xmtp] .env path: ${envPath}`)
	console.log(`[xmtp] .env exists: ${fs.existsSync(envPath)}`)
	console.log(
		`[xmtp] AGENT_WALLET_KEY: ${hasSecret("AGENT_WALLET_KEY") ? "set" : "not set"}`
	)
}

const log = {
	info: (msg: string) => console.log(`${pc.magenta("[xmtp]")} ${msg}`),
	error: (msg: string) => console.error(`${pc.red("[xmtp]")} ${msg}`),
	warn: (msg: string) => console.log(`${pc.yellow("[xmtp]")} ${msg}`),
	success: (msg: string) => console.log(`${pc.green("[xmtp]")} ${msg}`)
}

async function revokeOldInstallations(
	signer: Signer,
	inboxId: string
): Promise<boolean> {
	try {
		log.info("Revoking old installations...")

		const inboxStates = await Client.inboxStateFromInboxIds([inboxId], XMTP_ENV)

		if (!inboxStates[0]) {
			log.error("No inbox state found")
			return false
		}

		const toRevokeInstallationBytes = inboxStates[0].installations.map(
			(i: { bytes: Uint8Array }) => i.bytes
		)

		await Client.revokeInstallations(
			signer,
			inboxId,
			toRevokeInstallationBytes,
			XMTP_ENV
		)

		log.success(`Revoked ${toRevokeInstallationBytes.length} installations`)
		return true
	} catch (error) {
		log.error(`Revocation failed: ${(error as Error).message}`)
		return false
	}
}

const AGENT_PORT = process.env.AGENT_PORT || "8454"
const SIDECAR_PORT = process.env.XMTP_SIDECAR_PORT || "8455"
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

function printBanner(
	walletAddress?: string,
	status?: "connecting" | "listening" | "error"
) {
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
	console.log(`  ${pc.bold("Agent")}      http://localhost:${AGENT_PORT}`)
	console.log(`  ${pc.bold("Sidecar")}    http://localhost:${SIDECAR_PORT}`)
	console.log("")

	if (isHotReload) {
		console.log(
			`  ${pc.yellow("⚡")} Hot reload enabled - watching for changes...`
		)
		console.log("")
		return
	}

	if (status === "connecting") {
		console.log(`  ${pc.yellow("◌")} Connecting to XMTP network...`)
	} else if (status === "listening") {
		console.log(`  ${pc.green("✓")} Listening for messages...`)
	} else if (status === "error") {
		console.log(`  ${pc.red("✗")} Failed to connect`)
	} else if (!walletAddress) {
		console.log(`  ${pc.yellow("○")} Waiting for wallet configuration...`)
	}
	console.log("")
}

interface SendMessageRequest {
	conversationId: string
	message: string
}

async function startSidecar() {
	// Try secret store first, then fall back to env var
	let key: string | null = null

	if (hasSecret("AGENT_WALLET_KEY")) {
		key = getWalletKey()
	} else {
		// Fall back to env var for development
		const envKey = process.env.AGENT_WALLET_KEY
		if (envKey) {
			key = envKey
			log.info("Using AGENT_WALLET_KEY from environment variable")
		}
	}

	if (!key) {
		log.warn("AGENT_WALLET_KEY not loaded (no secret file or env var found)")
		printBanner()
		await new Promise(() => {})
		return
	}

	const user = createUser(
		key.startsWith("0x")
			? (key as `0x${string}`)
			: (`0x${key}` as `0x${string}`)
	)

	printBanner(user.account.address, "connecting")

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

	const secret = resolveAgentSecret(key)
	const dbEncryptionKey = new Uint8Array(Buffer.from(secret, "hex"))

	const dbDir = path.join(process.cwd(), ".hybrid", ".xmtp")
	if (!fs.existsSync(dbDir)) {
		fs.mkdirSync(dbDir, { recursive: true })
	}
	const dbPath = path.join(
		dbDir,
		`xmtp-${XMTP_ENV}-${user.account.address.toLowerCase().slice(0, 8)}.db3`
	)

	let agent: Agent | undefined
	try {
		agent = await Agent.create(signer as any, {
			env: XMTP_ENV,
			dbEncryptionKey,
			dbPath
		})
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)

		// Handle installation limit error
		if (
			errorMessage.includes("installations") ||
			/\d+\/\d+\s+installations/.test(errorMessage)
		) {
			log.warn(
				"Installation limit reached, attempting to revoke old installations..."
			)

			// Extract inbox ID from error message
			const inboxIdMatch = errorMessage.match(/InboxID ([a-f0-9]{64})/i)
			const inboxId = inboxIdMatch ? inboxIdMatch[1] : undefined

			if (inboxId) {
				log.info(`Found InboxID: ${inboxId.slice(0, 16)}...`)
				const success = await revokeOldInstallations(signer, inboxId)

				if (success) {
					log.success("Revoked old installations, retrying...")
					// Retry agent creation
					agent = await Agent.create(signer as any, {
						env: XMTP_ENV,
						dbEncryptionKey,
						dbPath
					})
				} else {
					log.error("Failed to revoke installations")
					throw error
				}
			} else {
				log.error("Could not extract InboxID from error")
				throw error
			}
		} else {
			throw error
		}
	}

	log.success("connected to XMTP network")

	const botInboxId = agent.client.inboxId

	// HTTP server for scheduler to send messages
	const httpServer = http.createServer(async (req, res) => {
		if (req.method === "POST" && req.url === "/api/send") {
			const chunks: Buffer[] = []
			req.on("data", (chunk) => chunks.push(chunk))
			req.on("end", async () => {
				try {
					const body = Buffer.concat(chunks).toString()
					const { conversationId, message } = JSON.parse(
						body
					) as SendMessageRequest

					if (!conversationId || !message) {
						res.writeHead(400)
						res.end(
							JSON.stringify({ error: "Missing conversationId or message" })
						)
						return
					}

					const conversations = await agent.client.conversations.list()
					const conversation = conversations.find(
						(c: any) => c.id === conversationId
					)

					if (!conversation) {
						res.writeHead(404)
						res.end(JSON.stringify({ error: "Conversation not found" }))
						return
					}

					await conversation.send(message)
					log.success(`sent scheduled message to ${conversationId.slice(0, 8)}`)

					res.writeHead(200)
					res.end(JSON.stringify({ delivered: true }))
				} catch (err) {
					log.error(`send error: ${(err as Error).message}`)
					res.writeHead(500)
					res.end(JSON.stringify({ error: (err as Error).message }))
				}
			})
			return
		}

		res.writeHead(404)
		res.end(JSON.stringify({ error: "Not found" }))
	})

	httpServer.listen(Number.parseInt(SIDECAR_PORT), "127.0.0.1", () => {
		log.success(`sidecar API on 127.0.0.1:${SIDECAR_PORT}`)
	})

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

		// Check ACL - only respond to owners by default
		const acl = parseACL(projectDir)
		const role = getRole(acl, senderAddress)

		if (role !== "owner") {
			log.warn(`ignoring message from non-owner: ${displayId}`)
			await conversation.send(
				"Sorry, I can only talk to my owners. If you think this is a mistake, ask an owner to add your address."
			)
			return
		}

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
					requestId,
					conversationId: conversation.id
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
	console.log("")
	console.log(`  ${pc.green("✓")} Listening for messages...`)
	console.log("")
}

startSidecar().catch((e) => {
	log.error(e.message)
	process.exit(1)
})
