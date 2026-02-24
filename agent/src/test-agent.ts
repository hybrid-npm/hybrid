import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "dotenv"

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, "..", "..", ".env.local") })
config({ path: join(__dirname, "..", ".env.local") })

const GATEWAY_PORT = process.env.GATEWAY_PORT || "8787"

async function testAgent() {
	console.log("🧪 Testing agent connection...\n")

	const testMessage = "Say 'hello' in one word"

	console.log(`📤 Sending: "${testMessage}"`)
	console.log(`📡 Endpoint: http://localhost:${GATEWAY_PORT}/api/chat\n`)

	try {
		const response = await fetch(`http://localhost:${GATEWAY_PORT}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				messages: [{ id: "1", role: "user", content: testMessage }],
				chatId: "test-chat"
			})
		})

		console.log(`Status: ${response.status} ${response.statusText}`)
		console.log(`Content-Type: ${response.headers.get("content-type")}\n`)

		if (!response.ok) {
			const text = await response.text()
			console.error("❌ Error response:", text)
			return
		}

		if (!response.body) {
			console.error("❌ No response body")
			return
		}

		const reader = response.body.getReader()
		const decoder = new TextDecoder()

		let fullText = ""
		let eventCount = 0

		console.log("📥 Stream events:\n")

		while (true) {
			const { done, value } = await reader.read()
			if (done) {
				console.log("\n✅ Stream complete")
				break
			}

			const chunk = decoder.decode(value)
			const lines = chunk.split("\n")

			for (const line of lines) {
				if (!line.trim()) continue

				if (line.startsWith("data: ")) {
					const data = line.slice(6)
					eventCount++

					if (data === "[DONE]") {
						console.log(`\n  [${eventCount}] [DONE]`)
						continue
					}

					try {
						const parsed = JSON.parse(data)
						console.log(`  [${eventCount}] type="${parsed.type}"`)

						if (parsed.type === "text") {
							fullText += parsed.content
							process.stdout.write(parsed.content)
						} else if (parsed.type === "error") {
							console.error(`  ❌ Error: ${parsed.content}`)
						} else if (parsed.type === "usage") {
							console.log(
								`  📊 ${parsed.inputTokens} in / ${parsed.outputTokens} out`
							)
						}
					} catch (e) {
						console.log(`  [${eventCount}] raw: ${data.slice(0, 100)}...`)
					}
				}
			}
		}

		console.log("\n")
		console.log("─".repeat(50))
		console.log(`Full response: "${fullText}"`)
		console.log("─".repeat(50))
	} catch (err) {
		console.error("\n❌ Connection failed:", err)
		console.log("\n💡 Make sure the agent is running:")
		console.log("   cd agent && pnpm dev:container")
	}
}

testAgent()
