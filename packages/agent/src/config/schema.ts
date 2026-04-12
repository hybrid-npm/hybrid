import { z } from "zod"

const mcpStdioTransportSchema = z.object({
	type: z.literal("stdio"),
	command: z.string(),
	args: z.array(z.string()).optional(),
	env: z.record(z.string(), z.string()).optional()
})

const mcpSseTransportSchema = z.object({
	type: z.literal("sse"),
	url: z.string(),
	headers: z.record(z.string(), z.string()).optional()
})

const mcpStreamableHttpTransportSchema = z.object({
	type: z.literal("streamable-http"),
	url: z.string(),
	headers: z.record(z.string(), z.string()).optional()
})

const mcpTransportSchema = z.discriminatedUnion("type", [
	mcpStdioTransportSchema,
	mcpSseTransportSchema,
	mcpStreamableHttpTransportSchema
])

const mcpServerSchema = z.object({
	name: z.string(),
	transport: mcpTransportSchema,
	disabled: z.boolean().optional().default(false)
})

const channelSchema = z.object({
	id: z.string(),
	enabled: z.boolean().optional().default(true),
	config: z.record(z.string(), z.unknown()).optional()
})

const channelsSchema = z.object({
	enabled: z.boolean().optional().default(false),
	state: z
		.object({
			type: z.enum(["postgres", "redis", "memory"]),
			url: z.string().optional()
		})
		.optional(),
	providers: z
		.object({
			slack: z
				.object({
					enabled: z.boolean().optional().default(false),
					botToken: z.string().optional(),
					signingSecret: z.string().optional()
				})
				.optional(),
			discord: z
				.object({
					enabled: z.boolean().optional().default(false),
					botToken: z.string().optional(),
					publicKey: z.string().optional(),
					applicationId: z.string().optional()
				})
				.optional(),
			linear: z
				.object({
					enabled: z.boolean().optional().default(false),
					apiKey: z.string().optional(),
					webhookSecret: z.string().optional()
				})
				.optional()
		})
		.optional()
})

const identitySchema = z.object({
	type: z.enum(["wallet", "api-key", "oauth", "email", "custom"]),
	provider: z.string().optional(),
	config: z.record(z.string(), z.unknown()).optional()
})

export const hybridConfigSchema = z.object({
	agent: z
		.object({
			name: z.string().optional(),
			model: z.string().optional(),
			maxTurns: z.number().optional()
		})
		.optional(),
	identity: identitySchema.optional(),
	mcpServers: z.array(mcpServerSchema).optional(),
	channels: z.array(channelSchema).optional(),
	chatSdk: channelsSchema.optional()
})

export type HybridConfig = z.infer<typeof hybridConfigSchema>
export type McpServerConfig = z.infer<typeof mcpServerSchema>
export type McpStdioTransport = z.infer<typeof mcpStdioTransportSchema>
export type McpSseTransport = z.infer<typeof mcpSseTransportSchema>
export type McpStreamableHttpTransport = z.infer<
	typeof mcpStreamableHttpTransportSchema
>
export type McpTransportConfig = z.infer<typeof mcpTransportSchema>
export type ChannelConfig = z.infer<typeof channelSchema>
export type IdentityConfig = z.infer<typeof identitySchema>
export type ChatSdkConfig = z.infer<typeof channelsSchema>
