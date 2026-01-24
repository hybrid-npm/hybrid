/**
 * Broker Setup Example
 *
 * This example demonstrates how to configure and run the Connection Broker
 * with multiple providers and handler routes.
 */

import {
	Broker,
	GenericWebSocketProvider,
	type HttpHandlerConfig,
	type ProviderType
} from "@hybrd/broker"

// Handler configurations
const messageHandler: HttpHandlerConfig = {
	name: "message-handler",
	trigger: "http",
	url: process.env.MESSAGE_HANDLER_URL ?? "https://api.example.com/handle/message",
	timeoutMs: 300000, // 5 minutes
	retries: 3,
	retryDelayMs: 1000,
	signatureSecret: process.env.HANDLER_SECRET
}

const commandHandler: HttpHandlerConfig = {
	name: "command-handler",
	trigger: "http",
	url: process.env.COMMAND_HANDLER_URL ?? "https://api.example.com/handle/command",
	timeoutMs: 60000, // 1 minute
	retries: 2,
	retryDelayMs: 500
}

async function main() {
	// Create the broker
	const broker = new Broker({
		name: "hybrid-broker",
		port: Number(process.env.PORT) || 3000,
		callbackHost: process.env.CALLBACK_HOST ?? "http://localhost:3000",
		redis: {
			host: process.env.REDIS_HOST ?? "localhost",
			port: Number(process.env.REDIS_PORT) || 6379,
			password: process.env.REDIS_PASSWORD,
			keyPrefix: "broker:"
		},
		defaultHandlerTimeoutMs: 300000
	})

	// Register provider factories
	// Each provider type can have its own implementation
	broker.registerProvider("discord" as ProviderType, (config) => {
		return new GenericWebSocketProvider(
			config.name,
			config.type,
			"wss://gateway.discord.gg/?v=10&encoding=json"
		)
	})

	broker.registerProvider("farcaster" as ProviderType, (config) => {
		return new GenericWebSocketProvider(
			config.name,
			config.type,
			"wss://hub.farcaster.xyz/subscribe"
		)
	})

	broker.registerProvider("telegram" as ProviderType, (config) => {
		return new GenericWebSocketProvider(
			config.name,
			config.type,
			"wss://api.telegram.org/bot"
		)
	})

	// Add handler routes
	// Routes are matched in priority order (highest first)

	// Command handler for all providers (highest priority)
	broker.addRoute({
		pattern: { eventType: "command" },
		handler: commandHandler,
		priority: 100
	})

	// Discord-specific message handler
	broker.addRoute({
		pattern: { provider: "discord", eventType: "message" },
		handler: messageHandler,
		priority: 50
	})

	// Farcaster-specific message handler
	broker.addRoute({
		pattern: { provider: "farcaster", eventType: "message" },
		handler: messageHandler,
		priority: 50
	})

	// Default catch-all handler (lowest priority)
	broker.addRoute({
		pattern: {},
		handler: messageHandler,
		priority: 0
	})

	// Start the broker
	await broker.start()

	console.log(`
╔════════════════════════════════════════════════════════════╗
║               Connection Broker Started                     ║
╠════════════════════════════════════════════════════════════╣
║  Endpoints:                                                 ║
║    Health:     GET  /health                                ║
║    Stats:      GET  /stats                                 ║
║    Callback:   POST /callback/:correlationId               ║
║    Connections: GET /connections                            ║
╠════════════════════════════════════════════════════════════╣
║  Registered Providers: discord, farcaster, telegram         ║
║  Handler Routes: ${broker.getStats().providersRegistered} configured                              ║
╚════════════════════════════════════════════════════════════╝
  `)

	// Graceful shutdown
	const shutdown = async () => {
		console.log("\nShutting down broker...")
		await broker.stop()
		process.exit(0)
	}

	process.on("SIGINT", shutdown)
	process.on("SIGTERM", shutdown)

	// Example: Connect a session
	// const socketId = await broker.connect('discord', {
	//   sessionId: 'user-123',
	//   credentials: { token: process.env.DISCORD_BOT_TOKEN }
	// })
}

main().catch(console.error)
