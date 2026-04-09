import type { ChannelId, TriggerRequest, TriggerResponse } from "@hybrd/types"

export const DEFAULT_ADAPTER_PORTS: Record<string, number> = {
	// telegram: 8456,  // future
	// slack: 8457,     // future
}

export async function dispatchToChannel(params: {
	channel: ChannelId
	to: string
	message: string
	metadata?: TriggerRequest["metadata"]
}): Promise<TriggerResponse> {
	const port = DEFAULT_ADAPTER_PORTS[params.channel]

	if (!port) {
		return { delivered: false, error: `Unknown channel: ${params.channel}` }
	}

	const url = `http://127.0.0.1:${port}/api/trigger`

	try {
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				to: params.to,
				message: params.message,
				metadata: params.metadata
			})
		})

		if (!res.ok) {
			return {
				delivered: false,
				error: `Channel adapter returned ${res.status}: ${res.statusText}`
			}
		}

		return (await res.json()) as TriggerResponse
	} catch (err) {
		return {
			delivered: false,
			error:
				err instanceof Error
					? err.message
					: "Failed to connect to channel adapter"
		}
	}
}
