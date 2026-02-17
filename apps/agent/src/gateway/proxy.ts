import { AGENT_ENDPOINT } from "../server/types"

export async function proxyToContainer(
	containerUrl: string,
	body: ReadableStream<Uint8Array> | null,
): Promise<Response> {
	const target = `${containerUrl}${AGENT_ENDPOINT}`

	const containerRes = await fetch(target, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body,
		duplex: "half",
	})

	if (!containerRes.ok) {
		const text = await containerRes.text()
		return new Response(text, { status: containerRes.status })
	}

	return new Response(containerRes.body, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	})
}
