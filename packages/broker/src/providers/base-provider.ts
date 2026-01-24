import { EventEmitter } from "node:events"
import { randomUUID } from "node:crypto"
import type {
	ConnectionState,
	InternalEvent,
	InternalResponse,
	Provider,
	ProviderConfig,
	ProviderConnectionOptions,
	ProviderEvents,
	ProviderHealth,
	ProviderType,
	RawProviderEvent,
	ReconnectConfig
} from "../types"
import { defaultReconnectConfig } from "../types"

/**
 * Connection tracking information
 */
interface ConnectionInfo {
	socketId: string
	sessionId: string
	state: ConnectionState
	connectedAt: number
	lastHeartbeat: number
	messageCount: number
	reconnectAttempts: number
}

/**
 * Abstract Base Provider
 *
 * Provides common functionality for all provider implementations.
 * Extend this class to create a new provider integration.
 *
 * @example
 * ```typescript
 * class DiscordProvider extends BaseProvider {
 *   readonly name = 'discord'
 *   readonly type: ProviderType = 'discord'
 *
 *   protected async doConnect(options: ProviderConnectionOptions): Promise<string> {
 *     // Discord-specific connection logic
 *   }
 *
 *   protected async doDisconnect(socketId: string): Promise<void> {
 *     // Discord-specific disconnect logic
 *   }
 *
 *   protected async doSend(socketId: string, response: InternalResponse): Promise<void> {
 *     // Discord-specific send logic
 *   }
 *
 *   normalize(raw: RawProviderEvent, socketId: string, sessionId: string): InternalEvent {
 *     // Discord-specific normalization
 *   }
 * }
 * ```
 */
export abstract class BaseProvider extends EventEmitter implements Provider {
	abstract readonly name: string
	abstract readonly type: ProviderType

	protected _config!: ProviderConfig
	protected readonly connections = new Map<string, ConnectionInfo>()
	protected reconnectConfig: ReconnectConfig = defaultReconnectConfig
	protected instanceId: string

	constructor() {
		super()
		this.instanceId = randomUUID()
	}

	get config(): ProviderConfig {
		return this._config
	}

	async initialize(config: ProviderConfig): Promise<void> {
		this._config = config

		if (config.reconnect) {
			this.reconnectConfig = { ...defaultReconnectConfig, ...config.reconnect }
		}

		await this.onInitialize(config)
	}

	async connect(options: ProviderConnectionOptions): Promise<string> {
		const socketId = await this.doConnect(options)

		const connectionInfo: ConnectionInfo = {
			socketId,
			sessionId: options.sessionId,
			state: "connected",
			connectedAt: Date.now(),
			lastHeartbeat: Date.now(),
			messageCount: 0,
			reconnectAttempts: 0
		}

		this.connections.set(socketId, connectionInfo)
		this.emit("connected", socketId)
		this.emit("stateChange", "connected", socketId)

		return socketId
	}

	async disconnect(socketId: string, reason?: string): Promise<void> {
		const connection = this.connections.get(socketId)
		if (!connection) return

		connection.state = "disconnected"
		this.emit("stateChange", "disconnected", socketId)

		await this.doDisconnect(socketId, reason)

		this.connections.delete(socketId)
		this.emit("disconnected", socketId, reason ?? "manual disconnect")
	}

	async disconnectAll(): Promise<void> {
		const disconnectPromises = Array.from(this.connections.keys()).map(
			(socketId) => this.disconnect(socketId, "shutdown")
		)
		await Promise.all(disconnectPromises)
	}

	abstract normalize(
		raw: RawProviderEvent,
		socketId: string,
		sessionId: string
	): InternalEvent

	async send(socketId: string, response: InternalResponse): Promise<void> {
		const connection = this.connections.get(socketId)
		if (!connection) {
			throw new Error(`No connection found for socket ${socketId}`)
		}

		if (connection.state !== "connected") {
			throw new Error(`Socket ${socketId} is not connected (state: ${connection.state})`)
		}

		await this.doSend(socketId, response)
		connection.messageCount++
	}

	getConnectionState(socketId: string): ConnectionState {
		const connection = this.connections.get(socketId)
		return connection?.state ?? "disconnected"
	}

	getActiveConnections(): string[] {
		return Array.from(this.connections.entries())
			.filter(([, info]) => info.state === "connected")
			.map(([socketId]) => socketId)
	}

	isConnected(socketId: string): boolean {
		const connection = this.connections.get(socketId)
		return connection?.state === "connected"
	}

	getHealth(): ProviderHealth {
		const activeConnections = this.getActiveConnections().length
		const totalConnections = this.connections.size

		let status: "healthy" | "degraded" | "unhealthy" = "healthy"
		if (activeConnections === 0 && totalConnections > 0) {
			status = "unhealthy"
		} else if (activeConnections < totalConnections * 0.8) {
			status = "degraded"
		}

		return {
			provider: this.type,
			instanceId: this.instanceId,
			status,
			lastCheck: Date.now(),
			consecutiveFailures: 0,
			metrics: {
				activeConnections,
				messagesPerSecond: 0,
				avgLatencyMs: 0
			}
		}
	}

	async heartbeat(socketId: string): Promise<void> {
		const connection = this.connections.get(socketId)
		if (!connection) return

		await this.doHeartbeat(socketId)
		connection.lastHeartbeat = Date.now()
	}

	/**
	 * Handle raw event from provider
	 * Call this from provider-specific event handlers
	 */
	protected handleRawEvent(raw: RawProviderEvent, socketId: string): void {
		const connection = this.connections.get(socketId)
		if (!connection) {
			this.emit("error", new Error(`No connection for socket ${socketId}`), socketId)
			return
		}

		this.emit("event", raw, socketId)
	}

	/**
	 * Handle connection error with automatic reconnection
	 */
	protected async handleConnectionError(
		socketId: string,
		error: Error
	): Promise<void> {
		const connection = this.connections.get(socketId)
		if (!connection) return

		connection.state = "error"
		this.emit("stateChange", "error", socketId)
		this.emit("error", error, socketId)

		if (connection.reconnectAttempts < this.reconnectConfig.maxAttempts) {
			await this.attemptReconnect(socketId)
		}
	}

	/**
	 * Attempt to reconnect a socket with exponential backoff
	 */
	protected async attemptReconnect(socketId: string): Promise<void> {
		const connection = this.connections.get(socketId)
		if (!connection) return

		connection.state = "reconnecting"
		this.emit("stateChange", "reconnecting", socketId)

		const delay = this.calculateReconnectDelay(connection.reconnectAttempts)
		await this.sleep(delay)

		connection.reconnectAttempts++

		try {
			await this.doReconnect(socketId, connection.sessionId)
			connection.state = "connected"
			connection.reconnectAttempts = 0
			this.emit("stateChange", "connected", socketId)
			this.emit("connected", socketId)
		} catch (error) {
			await this.handleConnectionError(
				socketId,
				error instanceof Error ? error : new Error(String(error))
			)
		}
	}

	/**
	 * Calculate reconnect delay with exponential backoff and jitter
	 */
	protected calculateReconnectDelay(attempt: number): number {
		const { initialDelayMs, maxDelayMs, multiplier, jitter } =
			this.reconnectConfig

		const exponentialDelay = initialDelayMs * multiplier ** attempt
		const cappedDelay = Math.min(exponentialDelay, maxDelayMs)
		const jitterAmount = cappedDelay * jitter * (Math.random() * 2 - 1)

		return cappedDelay + jitterAmount
	}

	protected sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	/**
	 * Override in subclass for provider-specific initialization
	 */
	protected async onInitialize(_config: ProviderConfig): Promise<void> {}

	/**
	 * Implement in subclass: Establish connection to provider
	 */
	protected abstract doConnect(
		options: ProviderConnectionOptions
	): Promise<string>

	/**
	 * Implement in subclass: Disconnect from provider
	 */
	protected abstract doDisconnect(
		socketId: string,
		reason?: string
	): Promise<void>

	/**
	 * Implement in subclass: Send message to provider
	 */
	protected abstract doSend(
		socketId: string,
		response: InternalResponse
	): Promise<void>

	/**
	 * Implement in subclass: Reconnect to provider
	 */
	protected abstract doReconnect(
		socketId: string,
		sessionId: string
	): Promise<void>

	/**
	 * Override in subclass: Send heartbeat/keepalive
	 */
	protected async doHeartbeat(_socketId: string): Promise<void> {}

	// Type-safe event emitter methods
	override on<K extends keyof ProviderEvents>(
		event: K,
		listener: ProviderEvents[K]
	): this {
		return super.on(event, listener)
	}

	override off<K extends keyof ProviderEvents>(
		event: K,
		listener: ProviderEvents[K]
	): this {
		return super.off(event, listener)
	}

	override emit<K extends keyof ProviderEvents>(
		event: K,
		...args: Parameters<ProviderEvents[K]>
	): boolean {
		return super.emit(event, ...args)
	}
}
