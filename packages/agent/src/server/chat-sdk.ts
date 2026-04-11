import { Chat, type Message, type Adapter, type StateAdapter } from "chat"
import { createSlackAdapter } from "@chat-adapter/slack"
import { createDiscordAdapter } from "@chat-adapter/discord"
import { createLinearAdapter } from "@chat-adapter/linear"
import { createPostgresState } from "@chat-adapter/state-pg"
import { toAiMessages } from "chat"
import pc from "picocolors"
import type { ChatSdkConfig } from "../config/index.js"
import { getSecret } from "../lib/secret-store.js"

interface ChatSdkOptions {
	projectRoot: string
	agentName: string
	runAgentTurn: (params: {
		messages: Array<{ role: string; content: string }>
		chatId: string
		userId?: string
		conversationId?: string
		channel?: string
	}) => Promise<AsyncIterable<string>>
}

type BotType = Chat<
	Record<string, Adapter<unknown, unknown>>,
	Record<string, unknown>
>

let bot: BotType | null = null

export function getChatInstance(): BotType | null {
	return bot
}

export async function initChatSdk(
	options: ChatSdkOptions,
	config?: ChatSdkConfig
): Promise<void> {
	if (!config?.enabled) {
		console.log(`${pc.yellow("[chat-sdk]")} disabled in config`)
		return
	}

	const state = createStateAdapter(config.state)
	const adapters: Record<string, Adapter<unknown, unknown>> = {}

	if (config.providers?.slack?.enabled) {
		const adapter = createSlackAdapter({
			botToken:
				config.providers.slack.botToken ??
				getSecret("slack-bot-token") ??
				process.env.SLACK_BOT_TOKEN,
			signingSecret:
				config.providers.slack.signingSecret ??
				getSecret("slack-signing-secret") ??
				process.env.SLACK_SIGNING_SECRET
		})
		adapters.slack = adapter
		console.log(`${pc.green("[chat-sdk]")} slack adapter configured`)
	}

	if (config.providers?.discord?.enabled) {
		const adapter = createDiscordAdapter({
			botToken:
				config.providers.discord.botToken ??
				getSecret("discord-bot-token") ??
				process.env.DISCORD_BOT_TOKEN,
			publicKey:
				config.providers.discord.publicKey ??
				getSecret("discord-public-key") ??
				process.env.DISCORD_PUBLIC_KEY,
			applicationId:
				config.providers.discord.applicationId ??
				getSecret("discord-application-id") ??
				process.env.DISCORD_APPLICATION_ID
		})
		adapters.discord = adapter
		console.log(`${pc.green("[chat-sdk]")} discord adapter configured`)
	}

	if (config.providers?.linear?.enabled) {
		const apiKey =
			config.providers.linear.apiKey ??
			getSecret("linear-api-key") ??
			process.env.LINEAR_API_KEY
		const webhookSecret =
			config.providers.linear.webhookSecret ??
			getSecret("linear-webhook-secret") ??
			process.env.LINEAR_WEBHOOK_SECRET
		if (apiKey && webhookSecret) {
			const adapter = createLinearAdapter({
				apiKey,
				webhookSecret
			})
			adapters.linear = adapter
			console.log(`${pc.green("[chat-sdk]")} linear adapter configured`)
		}
	}

	if (Object.keys(adapters).length === 0) {
		console.log(`${pc.yellow("[chat-sdk]")} no providers enabled`)
		return
	}

	bot = new Chat({
		userName: options.agentName,
		adapters,
		state,
		onLockConflict: "force",
		logger: "info"
	})

	bot.onNewMention(async (thread, message) => {
		await thread.subscribe()
		await thread.startTyping()

		const channel = thread.id.split(":")[0]
		const stream = await options.runAgentTurn({
			messages: [{ role: "user", content: message.text }],
			chatId: thread.id,
			userId: message.author.userId,
			conversationId: thread.id,
			channel
		})

		await thread.post(stream)
	})

	bot.onSubscribedMessage(async (thread, message) => {
		const channel = thread.id.split(":")[0]

		const messages: Message[] = []
		for await (const msg of thread.allMessages) {
			messages.push(msg)
		}

		const history = await toAiMessages(messages.slice(-20))

		await thread.startTyping()
		const stream = await options.runAgentTurn({
			messages: history.map((m) => ({
				role: m.role,
				content: typeof m.content === "string" ? m.content : ""
			})),
			chatId: thread.id,
			userId: message.author.userId,
			conversationId: thread.id,
			channel
		})

		await thread.post(stream)
	})

	bot.onReaction(["thumbs_up"], async (event) => {
		if (!event.added) return
		console.log(
			`${pc.cyan("[chat-sdk]")} reaction on ${event.messageId} in ${event.threadId}`
		)
	})

	await bot.initialize()
	console.log(`${pc.green("[chat-sdk]")} initialized with ${Object.keys(adapters).join(", ")}`)
}

export async function shutdownChatSdk(): Promise<void> {
	if (bot) {
		await bot.shutdown()
		bot = null
		console.log(`${pc.yellow("[chat-sdk]")} shut down`)
	}
}

function createStateAdapter(
	stateConfig?: ChatSdkConfig["state"]
): StateAdapter {
	if (stateConfig?.type === "postgres") {
		return createPostgresState({
			url: stateConfig.url ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL
		})
	}

	const pgUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL
	if (pgUrl) {
		console.log(`${pc.yellow("[chat-sdk]")} using postgres state adapter`)
		return createPostgresState({ url: pgUrl })
	}

	console.log(`${pc.yellow("[chat-sdk]")} no database URL, using memory state (dev only)`)
	return createMemoryState()
}

function createMemoryState(): StateAdapter {
	const subscriptions = new Map<string, Set<string>>()
	const locks = new Map<string, { expiresAt: number }>()
	const cache = new Map<string, { value: unknown; expiresAt: number }>()

	return {
		async connect() {
			console.log(`${pc.yellow("[chat-sdk]")} memory state connected (volatile)`)
		},
		async disconnect() {
			subscriptions.clear()
			locks.clear()
			cache.clear()
		},
		async subscribe(threadId: string, userId: string) {
			const existing = subscriptions.get(threadId)
			if (!existing) {
				subscriptions.set(threadId, new Set())
			}
			subscriptions.get(threadId)?.add(userId)
		},
		async unsubscribe(threadId: string, userId: string) {
			subscriptions.get(threadId)?.delete(userId)
		},
		async getSubscriptions(threadId: string) {
			return subscriptions.get(threadId) || new Set()
		},
		async getAllSubscriptions() {
			const result: Array<{ threadId: string; userIds: string[] }> = []
			for (const [threadId, userIds] of subscriptions) {
				result.push({ threadId, userIds: Array.from(userIds) })
			}
			return result
		},
		async acquireLock(threadId: string, ttlMs = 30_000) {
			const now = Date.now()
			const existing = locks.get(threadId)
			if (existing && existing.expiresAt > now) return false
			locks.set(threadId, { expiresAt: now + ttlMs })
			return true
		},
		async releaseLock(threadId: string) {
			locks.delete(threadId)
		},
		async getCache(key: string) {
			const entry = cache.get(key)
			if (entry && entry.expiresAt > Date.now()) return entry.value
			return null
		},
		async setCache(key: string, value: unknown, ttlMs = 60_000) {
			cache.set(key, { value, expiresAt: Date.now() + ttlMs })
		},
		async clearCache() {
			cache.clear()
		}
	}
}
