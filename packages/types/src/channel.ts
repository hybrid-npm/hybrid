export type ChannelId = "xmtp" | (string & {})

export type CronDeliveryMode = "none" | "announce"

export interface CronDelivery {
	mode: CronDeliveryMode
	channel?: ChannelId
	to?: string
	accountId?: string
	bestEffort?: boolean
}

export interface TriggerRequest {
	to: string
	message: string
	metadata?: {
		accountId?: string
		threadId?: string
		replyToId?: string
	}
}

export interface TriggerResponse {
	delivered: boolean
	messageId?: string
	error?: string
}

export interface ChannelAdapter {
	readonly channel: ChannelId
	readonly port: number
	start(): Promise<void>
	stop(): Promise<void>
	trigger(req: TriggerRequest): Promise<TriggerResponse>
}

export interface ChannelDispatcher {
	dispatch(params: {
		channel: ChannelId
		to: string
		message: string
		metadata?: TriggerRequest["metadata"]
	}): Promise<TriggerResponse>
}
