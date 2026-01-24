import { z } from "zod"
import { ProviderTypeSchema } from "./events"

/**
 * Connection states
 */
export const ConnectionStateSchema = z.enum([
	"connecting",
	"connected",
	"reconnecting",
	"disconnected",
	"error"
])
export type ConnectionState = z.infer<typeof ConnectionStateSchema>

/**
 * Connection metadata stored in Redis
 */
export const ConnectionMetadataSchema = z.object({
	socketId: z.string(),
	sessionId: z.string(),
	provider: ProviderTypeSchema,
	connectedAt: z.number(),
	lastHeartbeat: z.number(),
	messageCount: z.number().default(0),
	state: ConnectionStateSchema,
	remoteAddress: z.string().optional(),
	userAgent: z.string().optional()
})
export type ConnectionMetadata = z.infer<typeof ConnectionMetadataSchema>

/**
 * Pending request stored in Redis
 */
export const PendingRequestSchema = z.object({
	correlationId: z.string().uuid(),
	sessionId: z.string(),
	socketId: z.string(),
	provider: ProviderTypeSchema,
	createdAt: z.number(),
	timeout: z.number(),
	handlerUrl: z.string().optional()
})
export type PendingRequest = z.infer<typeof PendingRequestSchema>

/**
 * Provider health status
 */
export const HealthStatusSchema = z.enum(["healthy", "degraded", "unhealthy"])
export type HealthStatus = z.infer<typeof HealthStatusSchema>

/**
 * Provider health metadata
 */
export const ProviderHealthSchema = z.object({
	provider: ProviderTypeSchema,
	instanceId: z.string(),
	status: HealthStatusSchema,
	lastCheck: z.number(),
	consecutiveFailures: z.number().default(0),
	lastError: z.string().optional(),
	metrics: z
		.object({
			activeConnections: z.number(),
			messagesPerSecond: z.number(),
			avgLatencyMs: z.number()
		})
		.optional()
})
export type ProviderHealth = z.infer<typeof ProviderHealthSchema>

/**
 * Reconnection configuration
 */
export interface ReconnectConfig {
	initialDelayMs: number
	maxDelayMs: number
	multiplier: number
	jitter: number
	maxAttempts: number
}

export const defaultReconnectConfig: ReconnectConfig = {
	initialDelayMs: 1000,
	maxDelayMs: 60000,
	multiplier: 2,
	jitter: 0.1,
	maxAttempts: Number.POSITIVE_INFINITY
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
	failureThreshold: number
	successThreshold: number
	timeoutMs: number
	volumeThreshold: number
}

export const defaultCircuitBreakerConfig: CircuitBreakerConfig = {
	failureThreshold: 5,
	successThreshold: 3,
	timeoutMs: 30000,
	volumeThreshold: 10
}
