/**
 * Collects all text content from an SSE ReadableStream produced by runAgent().
 * Parses SSE frames, extracts `type: "text"` content, returns concatenated string.
 */
export async function collectTextFromStream(
	stream: ReadableStream<Uint8Array>
): Promise<string> {
	const reader = stream.getReader()
	const decoder = new TextDecoder()
	let buf = ""
	let result = ""

	while (true) {
		const { done, value } = await reader.read()
		if (done) break

		buf += decoder.decode(value, { stream: true })

		const frames = buf.split("\n\n")
		buf = frames.pop() ?? ""

		for (const frame of frames) {
			for (const line of frame.split("\n")) {
				if (!line.startsWith("data: ")) continue
				const data = line.slice(6)
				if (data === "[DONE]") return result

				try {
					const parsed = JSON.parse(data) as {
						type: string
						content?: string
					}
					if (parsed.type === "text" && parsed.content) {
						result += parsed.content
					}
				} catch {
					// non-JSON data line, skip
				}
			}
		}
	}

	return result
}
