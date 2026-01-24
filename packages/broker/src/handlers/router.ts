import type {
	HandlerConfig,
	HandlerRoute,
	HandlerRouter,
	InternalEvent
} from "../types"

/**
 * Handler Router Implementation
 *
 * Routes incoming events to appropriate handlers based on configurable
 * patterns. Supports matching by provider, event type, and conversation type.
 *
 * @example
 * ```typescript
 * const router = new HandlerRouterImpl()
 *
 * // Route XMTP messages to dedicated handler
 * router.addRoute({
 *   pattern: { provider: 'xmtp', eventType: 'message' },
 *   handler: xmtpMessageHandlerConfig,
 *   priority: 10
 * })
 *
 * // Route all group conversations to group handler
 * router.addRoute({
 *   pattern: { conversationType: 'group' },
 *   handler: groupHandlerConfig,
 *   priority: 5
 * })
 *
 * // Default handler (catch-all)
 * router.addRoute({
 *   pattern: {},
 *   handler: defaultHandlerConfig,
 *   priority: 0
 * })
 *
 * const handler = router.match(event)
 * ```
 */
export class HandlerRouterImpl implements HandlerRouter {
	private routes: HandlerRoute[] = []

	addRoute(route: HandlerRoute): void {
		this.routes.push({
			...route,
			priority: route.priority ?? 0
		})
		this.sortRoutes()
	}

	removeRoute(handlerName: string): void {
		this.routes = this.routes.filter((r) => r.handler.name !== handlerName)
	}

	match(event: InternalEvent): HandlerConfig | undefined {
		for (const route of this.routes) {
			if (this.matchesPattern(event, route.pattern)) {
				return route.handler
			}
		}
		return undefined
	}

	getRoutes(): HandlerRoute[] {
		return [...this.routes]
	}

	private sortRoutes(): void {
		this.routes.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
	}

	private matchesPattern(
		event: InternalEvent,
		pattern: HandlerRoute["pattern"]
	): boolean {
		if (pattern.provider) {
			const providers = Array.isArray(pattern.provider)
				? pattern.provider
				: [pattern.provider]
			if (!providers.includes(event.provider)) {
				return false
			}
		}

		if (pattern.eventType) {
			const eventTypes = Array.isArray(pattern.eventType)
				? pattern.eventType
				: [pattern.eventType]
			if (!eventTypes.includes(event.eventType)) {
				return false
			}
		}

		if (pattern.conversationType) {
			const convTypes = Array.isArray(pattern.conversationType)
				? pattern.conversationType
				: [pattern.conversationType]
			if (!convTypes.includes(event.conversation.type)) {
				return false
			}
		}

		return true
	}
}
