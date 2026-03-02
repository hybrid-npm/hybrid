import { randomUUID } from "node:crypto"
import type { Server } from "node:http"
import type {
	ChannelAdapter,
	ChannelId,
	TriggerRequest,
	TriggerResponse
} from "@hybrd/types"
import { Agent } from "@xmtp/agent-sdk"
import type { Conversation } from "@xmtp/node-sdk"
import express from "express"
import pc from "picocolors"

const log = {
	info: (msg: string) => console.log(`${pc.magenta("[xmtp]")} ${msg}`),
	error: (msg: string) => console.error(`${pc.red("[xmtp]")} ${msg}`),
	warn: (msg: string) => console.log(`${pc.yellow("[xmtp]")} ${msg}`),
	success: (msg: string) => console.log(`${pc.green("[xmtp]")} ${msg}`)
}

export interface XMTPAdapterConfig {
	port: number
	agentUrl: string
	xmtpEnv?: "dev" | "production"
	walletKey: `0x${string}`
	dbEncryptionKey: Uint8Array
	dbPath: string
}

interface TextMessage {
	id: string
	content: string
	senderInboxId: string
}

export class XMTPAdapter implements ChannelAdapter {
	readonly channel: ChannelId = "xmtp"
	readonly port: number

	private config: XMTPAdapterConfig
	private agent: Agent | null = null
	private server: Server | null = null
	private app: express.Application
	private botInboxId: string | null = null
	private processedMessages: Set<string> = new Set()

	constructor(config: XMTPAdapterConfig) {
		this.port = config.port
		this.config = config
		this.app = express()
		this.app.use(express.json())
	}

	async start(): Promise<void> {
		await this.startXMTPClient()
		this.startTriggerServer()
	}

	async stop(): Promise<void> {
		this.server?.close()
	}

	private async startXMTPClient(): Promise<void> {
		const { createUser } = await import("@xmtp/agent-sdk")
		const { toBytes } = await import("viem")

		const user = createUser(this.config.walletKey)
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

		this.agent = await Agent.create(
			signer as unknown as Parameters<typeof Agent.create>[0],
			{
				env: this.config.xmtpEnv ?? "dev",
				dbEncryptionKey: this.config.dbEncryptionKey,
				dbPath: this.config.dbPath
			}
		)

		log.success("connected to XMTP network")

		this.botInboxId = this.agent.client.inboxId

		this.agent.on("text", async (ctx) => {
			const { conversation, message } = ctx
			await this.handleInbound(conversation, message as TextMessage)
		})

		await this.agent.start()
		log.success("listening for XMTP messages")
	}

	private startTriggerServer(): void {
		this.app.post("/api/trigger", async (req, res) => {
			const result = await this.handleTrigger(req.body)
			res.json(result)
		})

		this.server = this.app.listen(this.port, "127.0.0.1", () => {
			log.success(`trigger server listening on 127.0.0.1:${this.port}`)
		})
	}

	private async handleInbound(
		conversation: Conversation,
		message: TextMessage
	): Promise<void> {
		log.info(`message ${pc.gray(message.id.slice(0, 8))}`)

		if (this.processedMessages.has(message.id)) {
			log.warn(`skipping duplicate: ${message.id.slice(0, 8)}`)
			return
		}
		this.processedMessages.add(message.id)

		if (this.processedMessages.size > 1000) {
			const arr = Array.from(this.processedMessages)
			arr.slice(0, 500).forEach((id) => this.processedMessages.delete(id))
		}

		await this.runAgentAndReply({
			conversationId: conversation.id,
			message: message.content,
			conversation
		})
	}

	async trigger(req: TriggerRequest): Promise<TriggerResponse> {
		return this.handleTrigger(req)
	}

	private async handleTrigger(req: TriggerRequest): Promise<TriggerResponse> {
		if (!this.agent) {
			return { delivered: false, error: "XMTP client not initialized" }
		}

		const conversations = await this.agent.client.conversations.list()
		const conversation = conversations.find(
			(c: Conversation) => c.id === req.to
		)

		if (!conversation) {
			return { delivered: false, error: "Conversation not found" }
		}

		return this.runAgentAndReply({
			conversationId: req.to,
			message: req.message,
			conversation
		})
	}

	private async runAgentAndReply(params: {
		conversationId: string
		message: string
		conversation: Conversation
	}): Promise<TriggerResponse> {
		const { conversation, message, conversationId } = params

		try {
			const res = await fetch(`${this.config.agentUrl}/api/chat`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Request-ID": randomUUID(),
					"X-Source": "xmtp-adapter"
				},
				body: JSON.stringify({
					messages: [{ id: randomUUID(), role: "user", content: message }],
					chatId: conversationId
				})
			})

			if (!res.ok) {
				log.error(`HTTP ${res.status}`)
				return { delivered: false, error: `HTTP ${res.status}` }
			}

			const reader = res.body?.getReader()
			if (!reader) {
				return { delivered: false, error: "No response body" }
			}

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
				return { delivered: true }
			}

			return { delivered: false, error: "No reply generated" }
		} catch (err) {
			log.error((err as Error).message)
			return { delivered: false, error: (err as Error).message }
		}
	}
}

export async function createXMTPAdapter(
	config: XMTPAdapterConfig
): Promise<XMTPAdapter> {
	const adapter = new XMTPAdapter(config)
	await adapter.start()
	return adapter
}
