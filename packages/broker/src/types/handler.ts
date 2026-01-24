import type { InternalEvent, InternalResponse } from "./events"

/**
 * Handler trigger types
 */
export type HandlerTriggerType = "http" | "grpc" | "lambda" | "cloudrun"

/**
 * Base handler configuration
 */
export interface HandlerConfigBase {
	name: string
	trigger: HandlerTriggerType
	timeoutMs: number
	retries: number
	retryDelayMs: number
}

/**
 * HTTP handler configuration
 */
export interface HttpHandlerConfig extends HandlerConfigBase {
	trigger: "http"
	url: string
	method?: "POST" | "PUT"
	headers?: Record<string, string>
	signatureSecret?: string
}

/**
 * gRPC handler configuration
 */
export interface GrpcHandlerConfig extends HandlerConfigBase {
	trigger: "grpc"
	host: string
	port: number
	service: string
	method: string
	useTls?: boolean
	certPath?: string
}

/**
 * AWS Lambda handler configuration
 */
export interface LambdaHandlerConfig extends HandlerConfigBase {
	trigger: "lambda"
	functionName: string
	region?: string
	invocationType?: "RequestResponse" | "Event"
	qualifier?: string
}

/**
 * GCP Cloud Run handler configuration
 */
export interface CloudRunHandlerConfig extends HandlerConfigBase {
	trigger: "cloudrun"
	url: string
	region?: string
	serviceAccountEmail?: string
}

/**
 * Union type for all handler configurations
 */
export type HandlerConfig =
	| HttpHandlerConfig
	| GrpcHandlerConfig
	| LambdaHandlerConfig
	| CloudRunHandlerConfig

/**
 * Handler invocation result
 */
export interface HandlerInvocationResult {
	success: boolean
	response?: InternalResponse
	error?: Error
	durationMs: number
	retryCount: number
}

/**
 * Handler Dispatcher Interface
 *
 * Responsible for invoking serverless handlers with normalized events
 * and returning responses. Implementations handle the specifics of
 * each trigger type (HTTP, gRPC, Lambda, etc.)
 *
 * @example
 * ```typescript
 * const dispatcher = new HttpHandlerDispatcher({
 *   name: 'message-handler',
 *   trigger: 'http',
 *   url: 'https://api.example.com/handle',
 *   timeoutMs: 300000,
 *   retries: 3,
 *   retryDelayMs: 1000
 * })
 *
 * const result = await dispatcher.invoke(event, callbackUrl)
 * ```
 */
export interface HandlerDispatcher {
	/**
	 * Handler configuration
	 */
	readonly config: HandlerConfig

	/**
	 * Invoke the handler with an event
	 *
	 * @param event - Normalized internal event
	 * @param callbackUrl - URL for async response callback
	 * @returns Invocation result with response
	 */
	invoke(
		event: InternalEvent,
		callbackUrl: string
	): Promise<HandlerInvocationResult>

	/**
	 * Check if the handler is healthy/reachable
	 *
	 * @returns True if healthy
	 */
	healthCheck(): Promise<boolean>
}

/**
 * Handler dispatcher factory function type
 */
export type HandlerDispatcherFactory = (config: HandlerConfig) => HandlerDispatcher

/**
 * Handler routing configuration
 */
export interface HandlerRoute {
	pattern: {
		provider?: string | string[]
		eventType?: string | string[]
		conversationType?: string | string[]
	}
	handler: HandlerConfig
	priority?: number
}

/**
 * Handler Router Interface
 *
 * Routes events to appropriate handlers based on configurable patterns.
 * Supports routing by provider, event type, and conversation type.
 */
export interface HandlerRouter {
	/**
	 * Add a route
	 *
	 * @param route - Route configuration
	 */
	addRoute(route: HandlerRoute): void

	/**
	 * Remove a route by handler name
	 *
	 * @param handlerName - Name of handler to remove
	 */
	removeRoute(handlerName: string): void

	/**
	 * Find the best matching handler for an event
	 *
	 * @param event - Event to route
	 * @returns Handler configuration or undefined if no match
	 */
	match(event: InternalEvent): HandlerConfig | undefined

	/**
	 * Get all configured routes
	 *
	 * @returns Array of routes
	 */
	getRoutes(): HandlerRoute[]
}

/**
 * Request-Response Bridge Interface
 *
 * Manages the correlation between outgoing requests to handlers
 * and incoming responses. Handles timeouts, retries, and cleanup.
 */
export interface RequestResponseBridge {
	/**
	 * Register a pending request
	 *
	 * @param event - Event being sent to handler
	 * @param timeoutMs - Timeout for response
	 * @returns Promise that resolves with the response
	 */
	registerRequest(
		event: InternalEvent,
		timeoutMs: number
	): Promise<InternalResponse>

	/**
	 * Resolve a pending request with a response
	 *
	 * @param correlationId - Request correlation ID
	 * @param response - Handler response
	 * @returns True if request was found and resolved
	 */
	resolveRequest(correlationId: string, response: InternalResponse): boolean

	/**
	 * Reject a pending request with an error
	 *
	 * @param correlationId - Request correlation ID
	 * @param error - Error to reject with
	 * @returns True if request was found and rejected
	 */
	rejectRequest(correlationId: string, error: Error): boolean

	/**
	 * Check if a request is still pending
	 *
	 * @param correlationId - Request correlation ID
	 * @returns True if pending
	 */
	isPending(correlationId: string): boolean

	/**
	 * Get count of pending requests
	 *
	 * @returns Number of pending requests
	 */
	getPendingCount(): number

	/**
	 * Cancel all pending requests
	 *
	 * @param reason - Cancellation reason
	 */
	cancelAll(reason: string): void
}
