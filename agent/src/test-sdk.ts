import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { query } from "@anthropic-ai/claude-agent-sdk"
import { config } from "dotenv"

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, "..", "..", ".env.local") })
config({ path: join(__dirname, "..", ".env.local") })

// Auto-configure OpenRouter
if (process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY) {
	process.env.ANTHROPIC_BASE_URL = "https://openrouter.ai/api"
	process.env.ANTHROPIC_AUTH_TOKEN = process.env.OPENROUTER_API_KEY
	process.env.ANTHROPIC_API_KEY = ""
}

console.log("Environment:")
console.log(`  ANTHROPIC_BASE_URL: ${process.env.ANTHROPIC_BASE_URL}`)
console.log(
	`  ANTHROPIC_AUTH_TOKEN: ${process.env.ANTHROPIC_AUTH_TOKEN ? "***" : "not set"}`
)
console.log(`  ANTHROPIC_API_KEY: "${process.env.ANTHROPIC_API_KEY}"`)
console.log()

async function main() {
	console.log("Calling SDK query()...")

	const options = {
		systemPrompt: "You are a helpful assistant.",
		maxTurns: 1,
		env: {
			...process.env,
			ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
			ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
			ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY
		}
	}

	try {
		const conversation = query({
			prompt: "Say hello in one word",
			options
		})

		console.log("Streaming messages...")
		let count = 0

		for await (const msg of conversation) {
			count++
			console.log(`Message #${count}:`, msg.type)

			if (msg.type === "stream_event") {
				console.log("  Event:", msg.event?.type)
				if (msg.event?.type === "content_block_delta") {
					console.log(
						"  Delta:",
						JSON.stringify(msg.event?.delta).slice(0, 100)
					)
				}
			} else if (msg.type === "assistant") {
				console.log(
					"  Content:",
					JSON.stringify(msg.message?.content).slice(0, 200)
				)
			}

			if (count > 20) {
				console.log("Too many messages, breaking...")
				break
			}
		}

		console.log(`\nDone. Received ${count} messages.`)
	} catch (err) {
		console.error("Error:", err)
	}
}

main()
