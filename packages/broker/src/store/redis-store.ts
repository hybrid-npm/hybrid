import Redis from "ioredis"
import type {
	ConnectionMetadata,
	PendingRequest,
	ProviderHealth,
	ProviderType
} from "../types"

/**
 * Redis key prefixes
 */
const KEYS = {
	SESSION_SOCKET: "session",
	SOCKET_SESSION: "socket",
	CONNECTION: "connection",
	PENDING: "pending",
	HEALTH: "health"
} as const

/**
 * TTL values in seconds
 */
const TTL = {
	SESSION: 86400, // 24 hours
	CONNECTION: 3600, // 1 hour
	PENDING: 360, // 6 minutes (request timeout + buffer)
	HEALTH: 300 // 5 minutes
} as const

/**
 * Redis State Store Configuration
 */
export interface RedisStoreConfig {
	host?: string
	port?: number
	password?: string
	db?: number
	keyPrefix?: string
	tls?: boolean
	connectionString?: string
}

/**
 * Redis State Store
 *
 * Manages persistent state for the connection broker using Redis.
 * Handles session-socket mappings, connection metadata, pending requests,
 * and provider health status.
 *
 * @example
 * ```typescript
 * const store = new RedisStore({
 *   host: 'localhost',
 *   port: 6379,
 *   keyPrefix: 'broker:'
 * })
 *
 * await store.connect()
 *
 * // Map session to socket
 * await store.setSessionSocket('session-123', 'socket-abc')
 *
 * // Store pending request
 * await store.setPendingRequest({
 *   correlationId: 'req-456',
 *   sessionId: 'session-123',
 *   socketId: 'socket-abc',
 *   provider: 'xmtp',
 *   createdAt: Date.now(),
 *   timeout: 300000
 * })
 * ```
 */
export class RedisStore {
	private client: Redis
	private readonly keyPrefix: string

	constructor(config: RedisStoreConfig = {}) {
		this.keyPrefix = config.keyPrefix ?? "broker:"

		if (config.connectionString) {
			this.client = new Redis(config.connectionString)
		} else {
			this.client = new Redis({
				host: config.host ?? "localhost",
				port: config.port ?? 6379,
				password: config.password,
				db: config.db ?? 0,
				tls: config.tls ? {} : undefined,
				lazyConnect: true
			})
		}
	}

	async connect(): Promise<void> {
		await this.client.connect()
	}

	async disconnect(): Promise<void> {
		await this.client.quit()
	}

	private key(...parts: string[]): string {
		return this.keyPrefix + parts.join(":")
	}

	// Session-Socket Mappings

	async setSessionSocket(sessionId: string, socketId: string): Promise<void> {
		const pipeline = this.client.pipeline()
		pipeline.setex(
			this.key(KEYS.SESSION_SOCKET, sessionId, "socket"),
			TTL.SESSION,
			socketId
		)
		pipeline.setex(
			this.key(KEYS.SOCKET_SESSION, socketId, "session"),
			TTL.SESSION,
			sessionId
		)
		await pipeline.exec()
	}

	async getSocketBySession(sessionId: string): Promise<string | null> {
		return this.client.get(this.key(KEYS.SESSION_SOCKET, sessionId, "socket"))
	}

	async getSessionBySocket(socketId: string): Promise<string | null> {
		return this.client.get(this.key(KEYS.SOCKET_SESSION, socketId, "session"))
	}

	async removeSessionSocket(sessionId: string, socketId: string): Promise<void> {
		const pipeline = this.client.pipeline()
		pipeline.del(this.key(KEYS.SESSION_SOCKET, sessionId, "socket"))
		pipeline.del(this.key(KEYS.SOCKET_SESSION, socketId, "session"))
		await pipeline.exec()
	}

	// Connection Metadata

	async setConnectionMetadata(metadata: ConnectionMetadata): Promise<void> {
		await this.client.setex(
			this.key(KEYS.CONNECTION, metadata.socketId),
			TTL.CONNECTION,
			JSON.stringify(metadata)
		)
	}

	async getConnectionMetadata(
		socketId: string
	): Promise<ConnectionMetadata | null> {
		const data = await this.client.get(this.key(KEYS.CONNECTION, socketId))
		return data ? JSON.parse(data) : null
	}

	async updateConnectionHeartbeat(socketId: string): Promise<void> {
		const key = this.key(KEYS.CONNECTION, socketId)
		const data = await this.client.get(key)
		if (data) {
			const metadata: ConnectionMetadata = JSON.parse(data)
			metadata.lastHeartbeat = Date.now()
			await this.client.setex(key, TTL.CONNECTION, JSON.stringify(metadata))
		}
	}

	async removeConnectionMetadata(socketId: string): Promise<void> {
		await this.client.del(this.key(KEYS.CONNECTION, socketId))
	}

	async getAllConnections(): Promise<ConnectionMetadata[]> {
		const pattern = this.key(KEYS.CONNECTION, "*")
		const keys = await this.client.keys(pattern)
		if (keys.length === 0) return []

		const values = await this.client.mget(...keys)
		return values
			.filter((v): v is string => v !== null)
			.map((v) => JSON.parse(v) as ConnectionMetadata)
	}

	// Pending Requests

	async setPendingRequest(request: PendingRequest): Promise<void> {
		await this.client.setex(
			this.key(KEYS.PENDING, request.correlationId),
			TTL.PENDING,
			JSON.stringify(request)
		)
	}

	async getPendingRequest(correlationId: string): Promise<PendingRequest | null> {
		const data = await this.client.get(this.key(KEYS.PENDING, correlationId))
		return data ? JSON.parse(data) : null
	}

	async removePendingRequest(correlationId: string): Promise<void> {
		await this.client.del(this.key(KEYS.PENDING, correlationId))
	}

	async getPendingRequestCount(): Promise<number> {
		const pattern = this.key(KEYS.PENDING, "*")
		const keys = await this.client.keys(pattern)
		return keys.length
	}

	// Provider Health

	async setProviderHealth(health: ProviderHealth): Promise<void> {
		await this.client.setex(
			this.key(KEYS.HEALTH, health.provider, health.instanceId),
			TTL.HEALTH,
			JSON.stringify(health)
		)
	}

	async getProviderHealth(
		provider: ProviderType,
		instanceId: string
	): Promise<ProviderHealth | null> {
		const data = await this.client.get(this.key(KEYS.HEALTH, provider, instanceId))
		return data ? JSON.parse(data) : null
	}

	async getAllProviderHealth(provider?: ProviderType): Promise<ProviderHealth[]> {
		const pattern = provider
			? this.key(KEYS.HEALTH, provider, "*")
			: this.key(KEYS.HEALTH, "*")
		const keys = await this.client.keys(pattern)
		if (keys.length === 0) return []

		const values = await this.client.mget(...keys)
		return values
			.filter((v): v is string => v !== null)
			.map((v) => JSON.parse(v) as ProviderHealth)
	}

	// Utility Methods

	async ping(): Promise<boolean> {
		try {
			const result = await this.client.ping()
			return result === "PONG"
		} catch {
			return false
		}
	}

	async flush(): Promise<void> {
		const pattern = this.keyPrefix + "*"
		const keys = await this.client.keys(pattern)
		if (keys.length > 0) {
			await this.client.del(...keys)
		}
	}

	/**
	 * Get raw Redis client for advanced operations
	 */
	getClient(): Redis {
		return this.client
	}
}
