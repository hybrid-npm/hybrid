import { randomUUID } from "node:crypto"
import WebSocket from "ws"
import { BaseProvider } from "../base-provider"
import type {
	InternalEvent,
	InternalResponse,
	ProviderConfig,
	ProviderConnectionOptions,
	ProviderType,
	RawProviderEvent
} from "../../types"

/**
 * Example WebSocket Provider
 *
 * A reference implementation showing how to create a provider for
 * any WebSocket-based service. Use this as a template for creating
 * providers for Discord, Farcaster, Telegram, etc.
 *
 * @example
 * ```typescript
 * class DiscordProvider extends WebSocketProvider {
 *   readonly name = 'discord'
 *   readonly type: ProviderType = 'discord'
 *
 *   protected getWebSocketUrl(options: ProviderConnectionOptions): string {
 *     return 'wss://gateway.discord.gg/?v=10&encoding=json'
 *   }
 *
 *   protected parseMessage(data: WebSocket.Data): RawProviderEvent | null {
 *     // Parse Discord gateway events
 *   }
 *
 *   protected formatResponse(response: InternalResponse): string | Buffer {
 *     // Format for Discord API
 *   }
 * }
 * ```
 */
export abstract class WebSocketProvider extends BaseProvider {
	protected sockets = new Map<string, WebSocket>()

	protected abstract getWebSocketUrl(
		options: ProviderConnectionOptions
	): string

	protected abstract parseMessage(data: WebSocket.Data): RawProviderEvent | null

	protected abstract formatResponse(
		response: InternalResponse
	): string | Buffer

	protected override async onInitialize(_config: ProviderConfig): Promise<void> {}

	protected override async doConnect(
		options: ProviderConnectionOptions
	): Promise<string> {
		const socketId = randomUUID()
		const url = this.getWebSocketUrl(options)

		const ws = new WebSocket(url)

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				ws.close()
				reject(new Error("Connection timeout"))
			}, 30000)

			ws.on("open", () => {
				clearTimeout(timeout)
				this.sockets.set(socketId, ws)
				this.setupSocketListeners(ws, socketId)
				resolve(socketId)
			})

			ws.on("error", (error) => {
				clearTimeout(timeout)
				reject(error)
			})
		})
	}

	protected override async doDisconnect(
		socketId: string,
		_reason?: string
	): Promise<void> {
		const ws = this.sockets.get(socketId)
		if (ws) {
			ws.close()
			this.sockets.delete(socketId)
		}
	}

	protected override async doSend(
		socketId: string,
		response: InternalResponse
	): Promise<void> {
		const ws = this.sockets.get(socketId)
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			throw new Error(`Socket ${socketId} is not connected`)
		}

		const data = this.formatResponse(response)
		ws.send(data)
	}

	protected override async doReconnect(
		socketId: string,
		sessionId: string
	): Promise<void> {
		const ws = this.sockets.get(socketId)
		if (ws) {
			ws.close()
			this.sockets.delete(socketId)
		}

		await this.doConnect({ sessionId })
	}

	protected override async doHeartbeat(socketId: string): Promise<void> {
		const ws = this.sockets.get(socketId)
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.ping()
		}
	}

	private setupSocketListeners(ws: WebSocket, socketId: string): void {
		ws.on("message", (data) => {
			const event = this.parseMessage(data)
			if (event) {
				this.handleRawEvent(event, socketId)
			}
		})

		ws.on("close", (code, reason) => {
			this.handleConnectionError(
				socketId,
				new Error(`WebSocket closed: ${code} - ${reason}`)
			)
		})

		ws.on("error", (error) => {
			this.handleConnectionError(socketId, error)
		})

		ws.on("pong", () => {
			const connection = this.connections.get(socketId)
			if (connection) {
				connection.lastHeartbeat = Date.now()
			}
		})
	}
}

/**
 * Generic WebSocket Provider Implementation
 *
 * A concrete implementation for simple WebSocket services.
 * For production use, extend WebSocketProvider for service-specific logic.
 */
export class GenericWebSocketProvider extends WebSocketProvider {
	readonly name: string
	readonly type: ProviderType

	private wsUrl: string

	constructor(name: string, type: ProviderType, wsUrl: string) {
		super()
		this.name = name
		this.type = type
		this.wsUrl = wsUrl
	}

	protected getWebSocketUrl(_options: ProviderConnectionOptions): string {
		return this.wsUrl
	}

	protected parseMessage(data: WebSocket.Data): RawProviderEvent | null {
		try {
			const parsed = JSON.parse(data.toString())
			return {
				type: parsed.type ?? "message",
				data: parsed,
				timestamp: Date.now()
			}
		} catch {
			return {
				type: "message",
				data: { text: data.toString() },
				timestamp: Date.now()
			}
		}
	}

	protected formatResponse(response: InternalResponse): string | Buffer {
		if (response.payload?.content) {
			if (typeof response.payload.content === "string") {
				return JSON.stringify({ text: response.payload.content })
			}
			return response.payload.content
		}
		return JSON.stringify({ success: response.success })
	}

	normalize(
		raw: RawProviderEvent,
		socketId: string,
		sessionId: string
	): InternalEvent {
		const data = raw.data as Record<string, unknown>

		return {
			correlationId: randomUUID(),
			sessionId,
			socketId,
			provider: this.type,
			providerEventType: raw.type,
			eventType: "message",
			payload: {
				content: typeof data.text === "string" ? data.text : JSON.stringify(data),
				contentType: "text/plain"
			},
			sender: {
				id: (data.senderId as string) ?? "unknown",
				displayName: data.senderName as string
			},
			conversation: {
				id: (data.conversationId as string) ?? socketId,
				type: "dm"
			},
			timestamp: raw.timestamp,
			receivedAt: Date.now()
		}
	}
}
