import type { EventEmitter } from "node:events"
import type {
	ConnectionState,
	InternalEvent,
	InternalResponse,
	ProviderHealth,
	ProviderType,
	ReconnectConfig
} from "./index"

/**
 * Provider configuration options
 */
export interface ProviderConfig {
	name: string
	type: ProviderType
	reconnect?: Partial<ReconnectConfig>
	heartbeatIntervalMs?: number
	maxConnectionsPerInstance?: number
	credentials?: Record<string, string>
	metadata?: Record<string, unknown>
}

/**
 * Provider connection options
 */
export interface ProviderConnectionOptions {
	sessionId: string
	credentials?: Record<string, string>
	metadata?: Record<string, unknown>
}

/**
 * Raw event from provider before normalization
 */
export interface RawProviderEvent {
	type: string
	data: unknown
	timestamp: number
	metadata?: Record<string, unknown>
}

/**
 * Provider event emitter interface
 */
export interface ProviderEvents {
	connected: (socketId: string) => void
	disconnected: (socketId: string, reason: string) => void
	error: (error: Error, socketId?: string) => void
	event: (event: RawProviderEvent, socketId: string) => void
	stateChange: (state: ConnectionState, socketId: string) => void
}

/**
 * Provider Interface
 *
 * This is the core abstraction for adding new provider integrations.
 * Implement this interface to support a new external service like
 * Farcaster, Discord, Telegram, etc.
 *
 * @example
 * ```typescript
 * class FarcasterProvider implements Provider {
 *   readonly name = 'farcaster'
 *   readonly type: ProviderType = 'farcaster'
 *
 *   async connect(options: ProviderConnectionOptions): Promise<string> {
 *     // Connect to Farcaster Hub
 *   }
 *
 *   normalize(raw: RawProviderEvent): InternalEvent {
 *     // Convert Farcaster cast to InternalEvent
 *   }
 *
 *   async send(socketId: string, response: InternalResponse): Promise<void> {
 *     // Send reply via Farcaster
 *   }
 * }
 * ```
 */
export interface Provider extends EventEmitter {
	/**
	 * Unique provider identifier
	 */
	readonly name: string

	/**
	 * Provider type for routing and categorization
	 */
	readonly type: ProviderType

	/**
	 * Current provider configuration
	 */
	readonly config: ProviderConfig

	/**
	 * Initialize the provider with configuration
	 *
	 * @param config - Provider configuration options
	 */
	initialize(config: ProviderConfig): Promise<void>

	/**
	 * Establish a new connection to the provider
	 *
	 * @param options - Connection options including session ID
	 * @returns Socket ID for the new connection
	 */
	connect(options: ProviderConnectionOptions): Promise<string>

	/**
	 * Disconnect a specific socket
	 *
	 * @param socketId - Socket to disconnect
	 * @param reason - Optional disconnect reason
	 */
	disconnect(socketId: string, reason?: string): Promise<void>

	/**
	 * Disconnect all sockets and cleanup resources
	 */
	disconnectAll(): Promise<void>

	/**
	 * Normalize a raw provider event to the internal schema
	 *
	 * This is where provider-specific payloads are converted to
	 * the standardized InternalEvent format.
	 *
	 * @param raw - Raw event from the provider
	 * @param socketId - Socket that received the event
	 * @param sessionId - Session associated with the socket
	 * @returns Normalized internal event
	 */
	normalize(
		raw: RawProviderEvent,
		socketId: string,
		sessionId: string
	): InternalEvent

	/**
	 * Convert an internal response to provider format and send
	 *
	 * @param socketId - Socket to send the response on
	 * @param response - Internal response to send
	 */
	send(socketId: string, response: InternalResponse): Promise<void>

	/**
	 * Get current connection state for a socket
	 *
	 * @param socketId - Socket to check
	 * @returns Current connection state
	 */
	getConnectionState(socketId: string): ConnectionState

	/**
	 * Get all active socket IDs
	 *
	 * @returns Array of active socket IDs
	 */
	getActiveConnections(): string[]

	/**
	 * Check if a socket is currently connected
	 *
	 * @param socketId - Socket to check
	 * @returns True if connected
	 */
	isConnected(socketId: string): boolean

	/**
	 * Get provider health status
	 *
	 * @returns Current health status
	 */
	getHealth(): ProviderHealth

	/**
	 * Send a heartbeat/keepalive to maintain connection
	 *
	 * @param socketId - Socket to ping
	 */
	heartbeat(socketId: string): Promise<void>

	/**
	 * Event listeners
	 */
	on<K extends keyof ProviderEvents>(
		event: K,
		listener: ProviderEvents[K]
	): this
	off<K extends keyof ProviderEvents>(
		event: K,
		listener: ProviderEvents[K]
	): this
	emit<K extends keyof ProviderEvents>(
		event: K,
		...args: Parameters<ProviderEvents[K]>
	): boolean
}

/**
 * Provider factory function type
 */
export type ProviderFactory = (config: ProviderConfig) => Provider

/**
 * Provider registry for managing multiple providers
 */
export interface ProviderRegistry {
	/**
	 * Register a provider factory
	 *
	 * @param type - Provider type
	 * @param factory - Factory function to create provider instances
	 */
	register(type: ProviderType, factory: ProviderFactory): void

	/**
	 * Create a provider instance
	 *
	 * @param type - Provider type to create
	 * @param config - Provider configuration
	 * @returns Provider instance
	 */
	create(type: ProviderType, config: ProviderConfig): Provider

	/**
	 * Get a registered provider factory
	 *
	 * @param type - Provider type
	 * @returns Factory function or undefined
	 */
	get(type: ProviderType): ProviderFactory | undefined

	/**
	 * Check if a provider type is registered
	 *
	 * @param type - Provider type
	 * @returns True if registered
	 */
	has(type: ProviderType): boolean

	/**
	 * Get all registered provider types
	 *
	 * @returns Array of registered types
	 */
	getTypes(): ProviderType[]
}
