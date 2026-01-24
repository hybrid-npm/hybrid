import { z } from "zod"

/**
 * Supported provider types
 */
export const ProviderTypeSchema = z.enum([
	"xmtp",
	"telephony",
	"x",
	"farcaster",
	"discord",
	"telegram",
	"slack"
])
export type ProviderType = z.infer<typeof ProviderTypeSchema>

/**
 * Normalized event types across all providers
 */
export const NormalizedEventTypeSchema = z.enum([
	"message",
	"reaction",
	"presence",
	"typing",
	"system",
	"command",
	"media"
])
export type NormalizedEventType = z.infer<typeof NormalizedEventTypeSchema>

/**
 * Conversation types
 */
export const ConversationTypeSchema = z.enum(["dm", "group", "channel", "thread"])
export type ConversationType = z.infer<typeof ConversationTypeSchema>

/**
 * Sender information schema
 */
export const SenderSchema = z.object({
	id: z.string(),
	displayName: z.string().optional(),
	username: z.string().optional(),
	avatarUrl: z.string().url().optional(),
	metadata: z.record(z.unknown()).optional()
})
export type Sender = z.infer<typeof SenderSchema>

/**
 * Conversation context schema
 */
export const ConversationSchema = z.object({
	id: z.string(),
	type: ConversationTypeSchema,
	title: z.string().optional(),
	participantCount: z.number().optional(),
	metadata: z.record(z.unknown()).optional()
})
export type Conversation = z.infer<typeof ConversationSchema>

/**
 * Event payload schema
 */
export const EventPayloadSchema = z.object({
	content: z.union([z.string(), z.instanceof(Buffer)]),
	contentType: z.string().default("text/plain"),
	metadata: z.record(z.unknown()).optional()
})
export type EventPayload = z.infer<typeof EventPayloadSchema>

/**
 * Internal Event Schema - Normalized event from any provider
 */
export const InternalEventSchema = z.object({
	correlationId: z.string().uuid(),
	sessionId: z.string(),
	socketId: z.string(),

	provider: ProviderTypeSchema,
	providerEventType: z.string(),

	eventType: NormalizedEventTypeSchema,
	payload: EventPayloadSchema,

	sender: SenderSchema,
	conversation: ConversationSchema,

	timestamp: z.number(),
	receivedAt: z.number(),

	replyTo: z.string().optional(),
	threadId: z.string().optional()
})
export type InternalEvent = z.infer<typeof InternalEventSchema>

/**
 * Response directives for controlling upstream behavior
 */
export const ResponseDirectivesSchema = z.object({
	suppressUpstream: z.boolean().optional(),
	delay: z.number().optional(),
	ttl: z.number().optional(),
	threadReply: z.boolean().optional()
})
export type ResponseDirectives = z.infer<typeof ResponseDirectivesSchema>

/**
 * Error information schema
 */
export const ResponseErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
	retryable: z.boolean().default(false),
	details: z.record(z.unknown()).optional()
})
export type ResponseError = z.infer<typeof ResponseErrorSchema>

/**
 * Response payload schema
 */
export const ResponsePayloadSchema = z.object({
	content: z.union([z.string(), z.instanceof(Buffer)]),
	contentType: z.string().default("text/plain"),
	metadata: z.record(z.unknown()).optional()
})
export type ResponsePayload = z.infer<typeof ResponsePayloadSchema>

/**
 * Internal Response Schema - Response from handler to broker
 */
export const InternalResponseSchema = z.object({
	correlationId: z.string().uuid(),
	success: z.boolean(),

	payload: ResponsePayloadSchema.optional(),
	error: ResponseErrorSchema.optional(),
	directives: ResponseDirectivesSchema.optional(),

	handlerDuration: z.number(),
	timestamp: z.number()
})
export type InternalResponse = z.infer<typeof InternalResponseSchema>

/**
 * Handler invocation request
 */
export const HandlerRequestSchema = z.object({
	event: InternalEventSchema,
	callbackUrl: z.string().url(),
	timeout: z.number().default(300000)
})
export type HandlerRequest = z.infer<typeof HandlerRequestSchema>
