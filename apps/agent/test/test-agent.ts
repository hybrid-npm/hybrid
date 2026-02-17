/**
 * CLI test client for the wellington agent server.
 *
 * Usage:
 *   pnpm test:agent --message "hello"
 *   pnpm test:agent --message "what files are in this directory?" --url http://localhost:4100
 */

const args = process.argv.slice(2)

function flag(name: string, fallback: string): string {
	const idx = args.indexOf(`--${name}`)
	if (idx !== -1 && args[idx + 1]) return args[idx + 1]
	return fallback
}

const message = flag("message", "hello")
const url = flag("url", "http://localhost:4200")
const temperature = Number.parseFloat(flag("temperature", "0.7"))

const endpoint = `${url}/api/agent`

interface ContainerRequest {
	messages: { id: string; role: string; content: string }[]
	systemPrompt: string
	temperature: number
}

const payload: ContainerRequest = {
	messages: [
		{
			id: `msg-${Date.now()}`,
			role: "user",
			content: message,
		},
	],
	systemPrompt: "",
	temperature,
}

console.log("\n--- test-agent ---")
console.log(`endpoint: ${endpoint}`)
console.log(`message:  "${message}"`)
console.log(`temperature: ${temperature}`)
console.log("---\n")

async function run() {
	const response = await fetch(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	})

	if (!response.ok) {
		const text = await response.text()
		console.error(`HTTP ${response.status}: ${text}`)
		process.exit(1)
	}

	if (!response.body) {
		console.error("No response body")
		process.exit(1)
	}

	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buf = ""

	while (true) {
		const { done, value } = await reader.read()
		if (done) break

		buf += decoder.decode(value, { stream: true })

		// SSE frames are separated by double newlines
		const frames = buf.split("\n\n")
		buf = frames.pop() ?? "" // keep incomplete frame

		for (const frame of frames) {
			for (const line of frame.split("\n")) {
				if (!line.startsWith("data: ")) continue
				const data = line.slice(6)

				if (data === "[DONE]") {
					console.log("\n\n[DONE]")
					return
				}

				try {
					const parsed = JSON.parse(data) as {
						type: string
						content?: string
						toolName?: string
						toolCallId?: string
						argsTextDelta?: string
						args?: string
						msg?: number
						event?: string
						[key: string]: unknown
					}

					switch (parsed.type) {
						case "text":
							process.stdout.write(parsed.content ?? "")
							break
						case "tool-call-start":
							console.log(
								`\n\n[tool] ${parsed.toolName} (${parsed.toolCallId})`
							)
							break
						case "tool-call-delta":
							process.stdout.write(parsed.argsTextDelta ?? "")
							break
						case "tool-call-end":
							console.log(`\n[/tool] ${parsed.toolName}`)
							break
						case "error":
							console.error(`\n[error] ${parsed.content}`)
							break
						case "usage":
							console.log(
								`\n[usage] cost=$${parsed.total_cost_usd} turns=${parsed.num_turns} duration=${parsed.duration_ms}ms`
							)
							break
						case "debug":
							// silent by default — uncomment to see:
							// console.log(`  [debug] #${parsed.msg} ${parsed.event}`)
							break
					}
				} catch {
					// non-JSON data line, skip
				}
			}
		}
	}

	console.log("\n[stream ended]")
}

run().catch((err) => {
	console.error("Fatal:", err)
	process.exit(1)
})
