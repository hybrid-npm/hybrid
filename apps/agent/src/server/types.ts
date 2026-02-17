export interface ContainerRequest {
	messages: UIMessageLite[]
	systemPrompt: string
	temperature: number
}

export interface UIMessageLite {
	id: string
	role: "user" | "assistant" | "system" | "data"
	content: string
	createdAt?: string
}

export const AGENT_PORT = 4100

export const GATEWAY_PORT = 4200

export const HEALTH_CHECK_PATH = "/health"

export const AGENT_ENDPOINT = "/api/agent"
