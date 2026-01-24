import type { InternalEvent, InternalResponse, RequestResponseBridge } from "../types"

/**
 * Pending request tracking
 */
interface PendingRequestEntry {
	event: InternalEvent
	resolve: (response: InternalResponse) => void
	reject: (error: Error) => void
	timeoutId: ReturnType<typeof setTimeout>
	createdAt: number
}

/**
 * Request-Response Bridge Implementation
 *
 * Manages correlation between outgoing handler requests and incoming responses.
 * Handles timeouts, cancellation, and cleanup of pending requests.
 *
 * @example
 * ```typescript
 * const bridge = new RequestResponseBridgeImpl()
 *
 * // Register a request (returns promise that resolves with response)
 * const responsePromise = bridge.registerRequest(event, 300000) // 5 min timeout
 *
 * // Dispatch to handler (async)
 * dispatcher.invoke(event, callbackUrl)
 *
 * // Handler sends response back via callback
 * bridge.resolveRequest(event.correlationId, response)
 *
 * // Original promise resolves
 * const response = await responsePromise
 * ```
 */
export class RequestResponseBridgeImpl implements RequestResponseBridge {
	private readonly pendingRequests = new Map<string, PendingRequestEntry>()

	registerRequest(
		event: InternalEvent,
		timeoutMs: number
	): Promise<InternalResponse> {
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				this.pendingRequests.delete(event.correlationId)
				reject(
					new Error(
						`Request ${event.correlationId} timed out after ${timeoutMs}ms`
					)
				)
			}, timeoutMs)

			const entry: PendingRequestEntry = {
				event,
				resolve,
				reject,
				timeoutId,
				createdAt: Date.now()
			}

			this.pendingRequests.set(event.correlationId, entry)
		})
	}

	resolveRequest(correlationId: string, response: InternalResponse): boolean {
		const entry = this.pendingRequests.get(correlationId)
		if (!entry) return false

		clearTimeout(entry.timeoutId)
		this.pendingRequests.delete(correlationId)
		entry.resolve(response)
		return true
	}

	rejectRequest(correlationId: string, error: Error): boolean {
		const entry = this.pendingRequests.get(correlationId)
		if (!entry) return false

		clearTimeout(entry.timeoutId)
		this.pendingRequests.delete(correlationId)
		entry.reject(error)
		return true
	}

	isPending(correlationId: string): boolean {
		return this.pendingRequests.has(correlationId)
	}

	getPendingCount(): number {
		return this.pendingRequests.size
	}

	cancelAll(reason: string): void {
		const error = new Error(`All requests cancelled: ${reason}`)

		for (const [correlationId, entry] of this.pendingRequests) {
			clearTimeout(entry.timeoutId)
			entry.reject(error)
			this.pendingRequests.delete(correlationId)
		}
	}

	/**
	 * Get statistics about pending requests
	 */
	getStats(): {
		count: number
		oldestMs: number | null
		averageAgeMs: number
	} {
		if (this.pendingRequests.size === 0) {
			return { count: 0, oldestMs: null, averageAgeMs: 0 }
		}

		const now = Date.now()
		let oldestMs: number | null = null
		let totalAgeMs = 0

		for (const entry of this.pendingRequests.values()) {
			const ageMs = now - entry.createdAt
			totalAgeMs += ageMs
			if (oldestMs === null || ageMs > oldestMs) {
				oldestMs = ageMs
			}
		}

		return {
			count: this.pendingRequests.size,
			oldestMs,
			averageAgeMs: totalAgeMs / this.pendingRequests.size
		}
	}
}
