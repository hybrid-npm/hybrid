import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "dotenv"

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, "..", "..", ".env.local") })
config({ path: join(__dirname, "..", ".env.local") })

async function testOpenRouter() {
	const apiKey = process.env.OPENROUTER_API_KEY

	if (!apiKey) {
		console.error("❌ OPENROUTER_API_KEY not set")
		return
	}

	console.log("🔑 Testing OpenRouter connection...")
	console.log(`   Key: ***${apiKey.slice(-4)}`)
	console.log()

	const response = await fetch(
		"https://openrouter.ai/api/v1/chat/completions",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				"HTTP-Referer": "https://hybrid.ai",
				"X-Title": "Hybrid Agent Test"
			},
			body: JSON.stringify({
				model: "anthropic/claude-3.5-sonnet",
				messages: [{ role: "user", content: "Say 'hello' in one word" }],
				max_tokens: 10
			})
		}
	)

	console.log(`Status: ${response.status} ${response.statusText}`)

	if (!response.ok) {
		const error = await response.text()
		console.error("❌ Error:", error)
		return
	}

	const data = await response.json()
	console.log("✅ Response:", JSON.stringify(data, null, 2))
}

testOpenRouter().catch(console.error)
