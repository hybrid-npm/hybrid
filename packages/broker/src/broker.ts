import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import type {
	HandlerConfig,
	HandlerDispatcher,
	HandlerRoute,
	HttpHandlerConfig,
	InternalEvent,
	InternalResponse,
	Provider,
	ProviderConfig,
	ProviderConnectionOptions,
	ProviderFactory,
	ProviderType,
	RawProviderEvent
} from "./types"
import { ProviderRegistryImpl } from "./providers"
import { HttpHandlerDispatcher } from "./handlers/http-dispatcher"
import { RequestResponseBridgeImpl } from "./handlers/request-response-bridge"
import { HandlerRouterImpl } from "./handlers/router"
import { RedisStore, type RedisStoreConfig } from "./store"

/**
 * Broker configuration
 */
export interface BrokerConfig {
	name?: string
	port?: number
	callbackHost?: string
	redis?: RedisStoreConfig
	defaultHandlerTimeoutMs?: number
}

/**
 * Broker statistics
 */
export interface BrokerStats {
	activeConnections: number
	pendingRequests: number
	providersRegistered: number
	providersActive: number
	uptime: number
}

/**
 * Connection Broker
 *
 * Central orchestrator that manages provider connections, event normalization,
 * handler dispatch, and response routing.
 *
 * @example
 * ```typescript
 * const broker = new Broker({
 *   name: 'my-broker',
 *   port: 3000,
 *   callbackHost: 'https://broker.example.com',
 *   redis: { host: 'localhost', port: 6379 }
 * })
 *
 * // Register provider factories
 * broker.registerProvider('discord', discordProviderFactory)
 * broker.registerProvider('farcaster', farcasterProviderFactory)
 *
 * // Add handler routes
 * broker.addRoute({
 *   pattern: { provider: 'discord' },
 *   handler: discordHandlerConfig
 * })
 *
 * // Start the broker
 * await broker.start()
 *
 * // Connect to a provider
 * const socketId = await broker.connect('discord', {
 *   sessionId: 'user-123',
 *   credentials: { token: 'xxx' }
 * })
 * ```
 */
export class Broker {
	readonly name: string
	readonly app: Hono

	private readonly config: BrokerConfig
	private readonly providerRegistry: ProviderRegistryImpl
	private readonly activeProviders = new Map<string, Provider>()
	private readonly handlerRouter: HandlerRouterImpl
	private readonly handlerDispatchers = new Map<string, HandlerDispatcher>()
	private readonly requestBridge: RequestResponseBridgeImpl
	private readonly store: RedisStore

	private startedAt: number | null = null

	constructor(config: BrokerConfig = {}) {
		this.name = config.name ?? "broker"
		this.config = {
			port: 3000,
			callbackHost: "http://localhost:3000",
			defaultHandlerTimeoutMs: 300000,
			...config
		}

		this.providerRegistry = new ProviderRegistryImpl()
		this.handlerRouter = new HandlerRouterImpl()
		this.requestBridge = new RequestResponseBridgeImpl()
		this.store = new RedisStore(config.redis)

		this.app = new Hono()
		this.setupRoutes()
	}

	/**
	 * Register a provider factory
	 */
	registerProvider(type: ProviderType, factory: ProviderFactory): void {
		this.providerRegistry.register(type, factory)
	}

	/**
	 * Add a handler route
	 */
	addRoute(route: HandlerRoute): void {
		this.handlerRouter.addRoute(route)

		if (!this.handlerDispatchers.has(route.handler.name)) {
			const dispatcher = this.createDispatcher(route.handler)
			this.handlerDispatchers.set(route.handler.name, dispatcher)
		}
	}

	/**
	 * Connect to a provider
	 */
	async connect(
		type: ProviderType,
		options: ProviderConnectionOptions & { config?: Partial<ProviderConfig> }
	): Promise<string> {
		const providerId = `${type}:${options.sessionId}`

		let provider = this.activeProviders.get(providerId)

		if (!provider) {
			const config: ProviderConfig = {
				name: providerId,
				type,
				credentials: options.credentials,
				metadata: options.metadata,
				...options.config
			}

			provider = this.providerRegistry.create(type, config)
			await provider.initialize(config)

			this.setupProviderListeners(provider)
			this.activeProviders.set(providerId, provider)
		}

		const socketId = await provider.connect(options)

		await this.store.setSessionSocket(options.sessionId, socketId)
		await this.store.setConnectionMetadata({
			socketId,
			sessionId: options.sessionId,
			provider: type,
			connectedAt: Date.now(),
			lastHeartbeat: Date.now(),
			messageCount: 0,
			state: "connected"
		})

		return socketId
	}

	/**
	 * Disconnect a socket
	 */
	async disconnect(socketId: string): Promise<void> {
		const metadata = await this.store.getConnectionMetadata(socketId)
		if (!metadata) return

		const providerId = `${metadata.provider}:${metadata.sessionId}`
		const provider = this.activeProviders.get(providerId)

		if (provider) {
			await provider.disconnect(socketId)
		}

		await this.store.removeSessionSocket(metadata.sessionId, socketId)
		await this.store.removeConnectionMetadata(socketId)
	}

	/**
	 * Start the broker
	 */
	async start(): Promise<void> {
		await this.store.connect()
		this.startedAt = Date.now()

		const server = Bun.serve({
			port: this.config.port,
			fetch: this.app.fetch
		})

		console.log(
			`🚀 Broker '${this.name}' started on port ${server.port}`
		)
	}

	/**
	 * Stop the broker
	 */
	async stop(): Promise<void> {
		this.requestBridge.cancelAll("Broker shutting down")

		for (const provider of this.activeProviders.values()) {
			await provider.disconnectAll()
		}

		await this.store.disconnect()
		this.startedAt = null
	}

	/**
	 * Get broker statistics
	 */
	getStats(): BrokerStats {
		let activeConnections = 0
		for (const provider of this.activeProviders.values()) {
			activeConnections += provider.getActiveConnections().length
		}

		return {
			activeConnections,
			pendingRequests: this.requestBridge.getPendingCount(),
			providersRegistered: this.providerRegistry.getTypes().length,
			providersActive: this.activeProviders.size,
			uptime: this.startedAt ? Date.now() - this.startedAt : 0
		}
	}

	private setupRoutes(): void {
		this.app.get("/health", (c) => {
			const healthy = this.startedAt !== null
			return c.json({ status: healthy ? "ok" : "starting" }, healthy ? 200 : 503)
		})

		this.app.get("/stats", (c) => {
			return c.json(this.getStats())
		})

		this.app.post("/callback/:correlationId", async (c) => {
			const correlationId = c.req.param("correlationId")
			const response = (await c.req.json()) as InternalResponse

			const resolved = this.requestBridge.resolveRequest(correlationId, response)
			if (!resolved) {
				return c.json({ error: "Request not found or already resolved" }, 404)
			}

			return c.json({ status: "ok" })
		})

		this.app.get("/connections", async (c) => {
			const connections = await this.store.getAllConnections()
			return c.json(connections)
		})
	}

	private setupProviderListeners(provider: Provider): void {
		provider.on("event", async (raw: RawProviderEvent, socketId: string) => {
			await this.handleProviderEvent(provider, raw, socketId)
		})

		provider.on("disconnected", async (socketId: string) => {
			await this.store.removeConnectionMetadata(socketId)
		})

		provider.on("error", (error: Error, socketId?: string) => {
			console.error(`[${provider.name}] Error:`, error, socketId)
		})
	}

	private async handleProviderEvent(
		provider: Provider,
		raw: RawProviderEvent,
		socketId: string
	): Promise<void> {
		const sessionId = await this.store.getSessionBySocket(socketId)
		if (!sessionId) {
			console.error(`No session found for socket ${socketId}`)
			return
		}

		const event = provider.normalize(raw, socketId, sessionId)

		const handlerConfig = this.handlerRouter.match(event)
		if (!handlerConfig) {
			console.warn(`No handler found for event:`, event.eventType, event.provider)
			return
		}

		const dispatcher = this.handlerDispatchers.get(handlerConfig.name)
		if (!dispatcher) {
			console.error(`No dispatcher for handler: ${handlerConfig.name}`)
			return
		}

		const callbackUrl = `${this.config.callbackHost}/callback/${event.correlationId}`

		await this.store.setPendingRequest({
			correlationId: event.correlationId,
			sessionId,
			socketId,
			provider: provider.type,
			createdAt: Date.now(),
			timeout: handlerConfig.timeoutMs,
			handlerUrl: handlerConfig.trigger === "http" ? (handlerConfig as HttpHandlerConfig).url : undefined
		})

		try {
			const responsePromise = this.requestBridge.registerRequest(
				event,
				handlerConfig.timeoutMs
			)

			void dispatcher.invoke(event, callbackUrl)

			const response = await responsePromise

			await this.store.removePendingRequest(event.correlationId)

			if (!response.directives?.suppressUpstream && response.payload) {
				if (response.directives?.delay) {
					await this.sleep(response.directives.delay)
				}
				await provider.send(socketId, response)
			}
		} catch (error) {
			console.error(
				`Error handling event ${event.correlationId}:`,
				error
			)
			await this.store.removePendingRequest(event.correlationId)
		}
	}

	private createDispatcher(config: HandlerConfig): HandlerDispatcher {
		switch (config.trigger) {
			case "http":
				return new HttpHandlerDispatcher(config as HttpHandlerConfig)
			default:
				throw new Error(`Unsupported handler trigger: ${config.trigger}`)
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}
}
