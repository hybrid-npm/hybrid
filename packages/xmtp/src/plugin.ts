import {
	Agent as XmtpAgent,
	XmtpEnv,
	createSigner,
	createUser
} from "@xmtp/agent-sdk"

import { randomUUID } from "node:crypto"
import type {
	AgentMessage,
	AgentRuntime,
	BehaviorContext,
	BehaviorRegistry,
	Plugin,
	PluginContext,
	XmtpClient,
	XmtpConversation,
	XmtpMessage
} from "@hybrd/types"
import { logger } from "@hybrd/utils"
import { createXMTPClient, getDbPath } from "./client"
import { ContentTypeReply, ContentTypeText, type Reply } from "./index"

// Re-export types from @hybrd/types for backward compatibility
export type { Plugin }

/**
 * Send a response with threading support
 */
async function sendResponse(
	conversation: XmtpConversation,
	text: string,
	originalMessageId: string,
	behaviorContext?: BehaviorContext
) {
	const shouldThread = behaviorContext?.sendOptions?.threaded ?? false

	if (shouldThread) {
		// Send as a reply to the original message
		try {
			const reply: Reply = {
				reference: originalMessageId,
				contentType: ContentTypeText,
				content: text
			}
			await conversation.send(reply, ContentTypeReply)
			logger.debug(
				`✅ [sendResponse] Threaded reply sent successfully to message ${originalMessageId}`
			)
		} catch (error) {
			logger.error(
				`❌ [sendResponse] Failed to send threaded reply to message ${originalMessageId}:`,
				error
			)
			// Fall back to regular message if threaded reply fails
			logger.debug(`🔄 [sendResponse] Falling back to regular message`)
			await conversation.send(text)
		}
	} else {
		// Send as a regular message
		await conversation.send(text)
	}
}

/**
 * XMTP Plugin that provides XMTP functionality to the agent
 *
 * @description
 * This plugin integrates XMTP messaging capabilities into the agent's
 * HTTP server. It mounts the XMTP endpoints for handling XMTP tools requests.
 */
export function XMTPPlugin(): Plugin<PluginContext> {
	return {
		name: "xmtp",
		description: "Provides XMTP messaging functionality",
		apply: async (app, context): Promise<void> => {
			const { AGENT_WALLET_KEY, XMTP_ENV = "production" } = process.env

			const { agent } = context
			const pluginContext = context as PluginContext & {
				behaviors?: BehaviorRegistry
			}

			if (!AGENT_WALLET_KEY) {
				throw new Error("AGENT_WALLET_KEY must be set")
			}

			const user = createUser(AGENT_WALLET_KEY as `0x${string}`)
			const signer = createSigner(user)

			const xmtpClient = await createXMTPClient(
				AGENT_WALLET_KEY as `0x${string}`
			)

			const address = user.account.address.toLowerCase()
			const agentDbPath = await getDbPath(
				`agent-${XMTP_ENV || "dev"}-${address}`
			)
			logger.debug(`📁 Using database path: ${agentDbPath}`)

			const xmtp = (await XmtpAgent.create(signer, {
				env: XMTP_ENV as XmtpEnv,
				dbPath: agentDbPath
			})) as any

			const botInboxId = xmtp.client?.inboxId
			const MAX_HISTORY = 20

			xmtp.on("reaction", async ({ conversation, message }: any) => {
				try {
					const text = message.content.content
					const messages: AgentMessage[] = [
						{
							id: randomUUID(),
							role: "user",
							parts: [{ type: "text", text }]
						}
					]

					const baseRuntime: AgentRuntime = {
						conversation: conversation as unknown as XmtpConversation,
						message: message as unknown as XmtpMessage,
						xmtpClient,
						...(context.scheduler ? { scheduler: context.scheduler } : {})
					}

					const runtime = await agent.createRuntimeContext(baseRuntime)

					// Execute pre-response behaviors
					let behaviorContext: BehaviorContext | undefined
					if (context.behaviors) {
						behaviorContext = {
							runtime,
							client: xmtpClient as unknown as XmtpClient,
							conversation: conversation as unknown as XmtpConversation,
							message: message as unknown as XmtpMessage
						}
						await context.behaviors.executeBefore(behaviorContext)

						// Check if behaviors were stopped early (e.g., due to filtering)
						if (behaviorContext.stopped) {
							logger.debug(
								`🔇 [XMTP Plugin] Skipping reaction response due to behavior chain being stopped`
							)
							return
						}

						// Check if message was filtered out by filterMessages behavior
						if (behaviorContext.sendOptions?.filtered) {
							logger.debug(
								`🔇 [XMTP Plugin] Skipping reaction response due to message being filtered`
							)
							return
						}
					}

					const { text: reply } = await agent.generate(messages, { runtime })

					// Execute post-response behaviors
					if (context.behaviors) {
						if (behaviorContext) {
							behaviorContext.response = reply
						} else {
							behaviorContext = {
								runtime,
								client: xmtpClient as unknown as XmtpClient,
								conversation: conversation as unknown as XmtpConversation,
								message: message as unknown as XmtpMessage,
								response: reply
							}
						}
						await context.behaviors.executeAfter(behaviorContext)

						// Check if post behaviors were stopped early
						if (behaviorContext.stopped) {
							logger.debug(
								`🔇 [XMTP Plugin] Skipping reaction response due to post-behavior chain being stopped`
							)
							return
						}
					} else {
						// Create minimal context for send options
						behaviorContext = {
							runtime,
							client: xmtpClient as unknown as XmtpClient,
							conversation: conversation as unknown as XmtpConversation,
							message: message as unknown as XmtpMessage,
							response: reply
						}
					}

					await sendResponse(
						conversation as unknown as XmtpConversation,
						reply,
						message.id,
						behaviorContext
					)
				} catch (err) {
					logger.error("❌ Error handling reaction:", err)
				}
			})

			xmtp.on("reply", async ({ conversation, message }: any) => {
				try {
					// TODO - why isn't this typed better?
					const text = message.content.content as string
					const messages: AgentMessage[] = [
						{
							id: randomUUID(),
							role: "user",
							parts: [{ type: "text", text }]
						}
					]

					const baseRuntime: AgentRuntime = {
						conversation: conversation as unknown as XmtpConversation,
						message: message as unknown as XmtpMessage,
						xmtpClient,
						...(context.scheduler ? { scheduler: context.scheduler } : {})
					}

					const runtime = await agent.createRuntimeContext(baseRuntime)

					// Execute pre-response behaviors
					let behaviorContext: BehaviorContext | undefined
					if (context.behaviors) {
						behaviorContext = {
							runtime,
							client: xmtpClient as unknown as XmtpClient,
							conversation: conversation as unknown as XmtpConversation,
							message: message as unknown as XmtpMessage
						}
						await context.behaviors.executeBefore(behaviorContext)

						// Check if behaviors were stopped early (e.g., due to filtering)
						if (behaviorContext.stopped) {
							logger.debug(
								`🔇 [XMTP Plugin] Skipping reply response due to behavior chain being stopped`
							)
							return
						}
					}

					const { text: reply } = await agent.generate(messages, { runtime })

					// Execute post-response behaviors
					if (context.behaviors) {
						if (!behaviorContext) {
							behaviorContext = {
								runtime,
								client: xmtpClient as unknown as XmtpClient,
								conversation: conversation as unknown as XmtpConversation,
								message: message as unknown as XmtpMessage,
								response: reply
							}
						} else {
							behaviorContext.response = reply
						}
						await context.behaviors.executeAfter(behaviorContext)

						// Check if post behaviors were stopped early
						if (behaviorContext.stopped) {
							logger.debug(
								`🔇 [XMTP Plugin] Skipping reply response due to post-behavior chain being stopped`
							)
							return
						}
					} else {
						// Create minimal context for send options
						behaviorContext = {
							runtime,
							client: xmtpClient as unknown as XmtpClient,
							conversation: conversation as unknown as XmtpConversation,
							message: message as unknown as XmtpMessage,
							response: reply
						}
					}

					await sendResponse(
						conversation as unknown as XmtpConversation,
						reply,
						message.id,
						behaviorContext
					)
				} catch (err) {
					logger.error("❌ Error handling reply:", err)
				}
			})

			xmtp.on("text", async ({ conversation, message }: any) => {
				try {
					const text = message.content

					let historyMessages: AgentMessage[] = []
					try {
						console.log("[xmtp] fetching conversation history...")
						const history = await conversation.messages({
							limit: MAX_HISTORY + 1,
							direction: 1
						})

						console.log(
							`[xmtp] got ${history.length} messages from conversation.messages()`
						)

						const filtered = history
							.filter((msg: any) => msg.id !== message.id)
							.filter(
								(msg: any) => msg.content && typeof msg.content === "string"
							)
							.slice(0, MAX_HISTORY)
							.reverse()

						console.log(`[xmtp] after filter: ${filtered.length} messages`)

						historyMessages = filtered.map((msg: any) => ({
							id: msg.id,
							role:
								msg.senderInboxId === botInboxId
									? ("assistant" as const)
									: ("user" as const),
							parts: [{ type: "text" as const, text: msg.content as string }]
						}))
					} catch (historyErr) {
						console.error(`[xmtp] history error:`, historyErr)
					}

					const messages: AgentMessage[] = [
						...historyMessages,
						{ id: randomUUID(), role: "user", parts: [{ type: "text", text }] }
					]

					console.log(`[xmtp] sending ${messages.length} messages to agent`)

					const baseRuntime: AgentRuntime = {
						conversation: conversation as unknown as XmtpConversation,
						message: message as unknown as XmtpMessage,
						xmtpClient,
						...(context.scheduler ? { scheduler: context.scheduler } : {})
					}

					const runtime = await agent.createRuntimeContext(baseRuntime)

					// Execute pre-response behaviors
					let behaviorContext: BehaviorContext | undefined
					if (context.behaviors) {
						behaviorContext = {
							runtime,
							client: xmtpClient as unknown as XmtpClient,
							conversation: conversation as unknown as XmtpConversation,
							message: message as unknown as XmtpMessage
						}
						await context.behaviors.executeBefore(behaviorContext)

						// Check if behaviors were stopped early (e.g., due to filtering)
						if (behaviorContext.stopped) {
							logger.debug(
								`🔇 [XMTP Plugin] Skipping text response due to behavior chain being stopped`
							)
							return
						}
					}

					const { text: reply } = await agent.generate(messages, { runtime })

					// Execute post-response behaviors
					if (context.behaviors) {
						if (!behaviorContext) {
							behaviorContext = {
								runtime,
								client: xmtpClient as unknown as XmtpClient,
								conversation: conversation as unknown as XmtpConversation,
								message: message as unknown as XmtpMessage,
								response: reply
							}
						} else {
							behaviorContext.response = reply
						}
						await context.behaviors.executeAfter(behaviorContext)

						// Check if post behaviors were stopped early
						if (behaviorContext.stopped) {
							logger.debug(
								`🔇 [XMTP Plugin] Skipping text response due to post-behavior chain being stopped`
							)
							return
						}
					} else {
						// Create minimal context for send options
						behaviorContext = {
							runtime,
							client: xmtpClient as unknown as XmtpClient,
							conversation: conversation as unknown as XmtpConversation,
							message: message as unknown as XmtpMessage,
							response: reply
						}
					}

					await sendResponse(
						conversation as unknown as XmtpConversation,
						reply,
						message.id,
						behaviorContext
					)
				} catch (err) {
					logger.error("❌ Error handling text:", err)
				}
			})

			// Store xmtpClient in context for scheduler and other components
			;(context as any).xmtpClient = xmtpClient

			// Event handlers removed due to incompatibility with current XMTP agent SDK

			void xmtp
				.start()
				.then(() => logger.debug("✅ XMTP agent listener started"))
				.catch((err: any) =>
					console.error("❌ XMTP agent listener failed to start:", err)
				)
		}
	}
}
