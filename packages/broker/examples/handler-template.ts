/**
 * Handler Template
 *
 * This is a template for creating serverless handler functions that
 * receive events from the Broker and return responses.
 *
 * Deploy this as a serverless function (AWS Lambda, Vercel, Cloudflare Workers, etc.)
 */

import type { InternalEvent, InternalResponse } from "@hybrd/broker"

/**
 * Handler request body from the Broker
 */
interface HandlerRequest {
	event: InternalEvent
	callbackUrl: string
}

/**
 * Example: Vercel Serverless Function
 */
export async function POST(request: Request): Promise<Response> {
	const startTime = Date.now()

	try {
		const body = (await request.json()) as HandlerRequest
		const { event, callbackUrl } = body

		// Verify signature if configured
		const signature = request.headers.get("X-Broker-Signature")
		if (signature) {
			// Verify HMAC signature
			// const isValid = verifySignature(body, signature, SECRET)
			// if (!isValid) return new Response('Invalid signature', { status: 401 })
		}

		// Process the event based on type
		let responseContent: string

		switch (event.eventType) {
			case "message":
				responseContent = await handleMessage(event)
				break
			case "reaction":
				responseContent = await handleReaction(event)
				break
			case "command":
				responseContent = await handleCommand(event)
				break
			default:
				responseContent = `Unknown event type: ${event.eventType}`
		}

		// Build the response
		const response: InternalResponse = {
			correlationId: event.correlationId,
			success: true,
			payload: {
				content: responseContent,
				contentType: "text/plain"
			},
			handlerDuration: Date.now() - startTime,
			timestamp: Date.now()
		}

		// Send response back to broker via callback
		await fetch(callbackUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(response)
		})

		return new Response(JSON.stringify({ status: "ok" }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		})
	} catch (error) {
		console.error("Handler error:", error)

		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : "Unknown error"
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" }
			}
		)
	}
}

/**
 * Handle incoming messages
 */
async function handleMessage(event: InternalEvent): Promise<string> {
	const content = event.payload.content.toString()

	// Your message handling logic here
	// This is where you'd integrate with AI models, databases, etc.

	console.log(`Message from ${event.sender.displayName}: ${content}`)

	// Example: Echo back
	return `You said: ${content}`
}

/**
 * Handle reactions
 */
async function handleReaction(event: InternalEvent): Promise<string> {
	const reaction = event.payload.content.toString()
	console.log(`Reaction ${reaction} from ${event.sender.id}`)

	return `Thanks for the ${reaction}!`
}

/**
 * Handle commands
 */
async function handleCommand(event: InternalEvent): Promise<string> {
	const command = event.payload.content.toString()

	switch (command.toLowerCase()) {
		case "/help":
			return "Available commands: /help, /status, /info"
		case "/status":
			return "All systems operational"
		case "/info":
			return `Provider: ${event.provider}, Session: ${event.sessionId}`
		default:
			return `Unknown command: ${command}`
	}
}

/**
 * Example: AWS Lambda Handler
 */
export const lambdaHandler = async (lambdaEvent: {
	body: string
	headers: Record<string, string>
}): Promise<{ statusCode: number; body: string }> => {
	const startTime = Date.now()

	try {
		const body = JSON.parse(lambdaEvent.body) as HandlerRequest
		const { event, callbackUrl } = body

		// Process the event
		const responseContent = await handleMessage(event)

		const response: InternalResponse = {
			correlationId: event.correlationId,
			success: true,
			payload: {
				content: responseContent,
				contentType: "text/plain"
			},
			handlerDuration: Date.now() - startTime,
			timestamp: Date.now()
		}

		// Send response back to broker
		await fetch(callbackUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(response)
		})

		return {
			statusCode: 200,
			body: JSON.stringify({ status: "ok" })
		}
	} catch (error) {
		return {
			statusCode: 500,
			body: JSON.stringify({
				error: error instanceof Error ? error.message : "Unknown error"
			})
		}
	}
}
