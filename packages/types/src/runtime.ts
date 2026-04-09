export type ChannelId = "web" | (string & {})

export interface AgentRuntime {
	channel?: ChannelId
	scheduler?: unknown
}
