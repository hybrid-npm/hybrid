import { createHmac } from "node:crypto"
import type {
	HandlerDispatcher,
	HandlerInvocationResult,
	HttpHandlerConfig,
	InternalEvent,
	InternalResponse
} from "../types"

/**
 * HTTP Handler Dispatcher
 *
 * Invokes serverless handlers via HTTP POST requests.
 * Supports request signing, retries, and timeout handling.
 *
 * @example
 * ```typescript
 * const dispatcher = new HttpHandlerDispatcher({
 *   name: 'message-handler',
 *   trigger: 'http',
 *   url: 'https://api.example.com/handle',
 *   timeoutMs: 300000, // 5 minutes
 *   retries: 3,
 *   retryDelayMs: 1000,
 *   signatureSecret: 'your-secret'
 * })
 *
 * const result = await dispatcher.invoke(event, callbackUrl)
 * if (result.success) {
 *   console.log('Handler response:', result.response)
 * }
 * ```
 */
export class HttpHandlerDispatcher implements HandlerDispatcher {
	readonly config: HttpHandlerConfig

	constructor(config: HttpHandlerConfig) {
		this.config = config
	}

	async invoke(
		event: InternalEvent,
		callbackUrl: string
	): Promise<HandlerInvocationResult> {
		const startTime = Date.now()
		let lastError: Error | undefined
		let retryCount = 0

		while (retryCount <= this.config.retries) {
			try {
				const response = await this.doInvoke(event, callbackUrl)
				return {
					success: true,
					response,
					durationMs: Date.now() - startTime,
					retryCount
				}
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error))
				retryCount++

				if (retryCount <= this.config.retries) {
					await this.sleep(this.config.retryDelayMs * retryCount)
				}
			}
		}

		return {
			success: false,
			error: lastError,
			durationMs: Date.now() - startTime,
			retryCount: retryCount - 1
		}
	}

	private async doInvoke(
		event: InternalEvent,
		callbackUrl: string
	): Promise<InternalResponse> {
		const body = JSON.stringify({ event, callbackUrl })
		const headers = this.buildHeaders(body, event.correlationId)

		const controller = new AbortController()
		const timeoutId = setTimeout(
			() => controller.abort(),
			this.config.timeoutMs
		)

		try {
			const response = await fetch(this.config.url, {
				method: this.config.method ?? "POST",
				headers,
				body,
				signal: controller.signal
			})

			if (!response.ok) {
				const errorText = await response.text()
				throw new Error(
					`HTTP ${response.status}: ${response.statusText} - ${errorText}`
				)
			}

			const data = await response.json()
			return data as InternalResponse
		} finally {
			clearTimeout(timeoutId)
		}
	}

	private buildHeaders(
		body: string,
		correlationId: string
	): Record<string, string> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"X-Correlation-Id": correlationId,
			...this.config.headers
		}

		if (this.config.signatureSecret) {
			const signature = createHmac("sha256", this.config.signatureSecret)
				.update(body)
				.digest("hex")
			headers["X-Broker-Signature"] = `sha256=${signature}`
		}

		return headers
	}

	async healthCheck(): Promise<boolean> {
		try {
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 5000)

			const response = await fetch(this.config.url, {
				method: "HEAD",
				signal: controller.signal
			})

			clearTimeout(timeoutId)
			return response.ok || response.status === 405
		} catch {
			return false
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}
}
