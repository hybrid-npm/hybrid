import { Agent } from "@xmtp/agent-sdk"
import type { ContainerRequest } from "../server/types"
import { runAgent } from "../server/agent"
import { collectTextFromStream } from "./collect"

export async function startXmtpAgent(): Promise<void> {
	const agent = await Agent.createFromEnv()

	agent.on("text", async (ctx) => {
		const incomingText = ctx.message.content ?? ""
		const sender = await ctx.getSenderAddress()
		console.log(
			`[xmtp] received: "${incomingText.slice(0, 100)}" from ${sender}`
		)

		try {
			const req: ContainerRequest = {
				messages: [
					{
						id: `xmtp-${Date.now()}`,
						role: "user",
						content: incomingText,
					},
				],
				systemPrompt: "",
				temperature: 0.7,
			}

			const stream = runAgent(req)
			const reply = await collectTextFromStream(stream)

			if (reply) {
				await ctx.conversation.sendText(reply)
				console.log(`[xmtp] replied: "${reply.slice(0, 100)}"`)
			} else {
				await ctx.conversation.sendText(
					"Sorry, I couldn't generate a response."
				)
				console.warn("[xmtp] empty response from agent")
			}
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Internal error"
			console.error("[xmtp] error:", message)
			await ctx.conversation.sendText(`Error: ${message}`)
		}
	})

	await agent.start()
	console.log("[xmtp] agent started")
}
