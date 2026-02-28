/**
 * Hybrid Agent Configuration
 *
 * Configure your agent's behaviors and settings.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { Agent, listen } from "hybrid"
import { reactWith } from "hybrid/behaviors"
import type { BehaviorObject } from "hybrid/behaviors"
import { schedulerTools } from "hybrid/tools"

const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY
})

// Create agent with behaviors
const agent = new Agent({
	name: "My Agent",
	model: openrouter("anthropic/claude-sonnet-4"),
	instructions:
		process.env.AGENT_INSTRUCTIONS ?? "You are a helpful AI assistant.",
	tools: schedulerTools
})

// Listen with config
listen({
	agent,
	port: process.env.AGENT_PORT ?? "8454",
	scheduler: true,
	behaviors: [
		// React with eyes to EVERY message immediately
		reactWith("👀")

		// Add filter behavior if needed
		// filterMessages(({ message }) => message.senderAddress !== myAddress)
	] as BehaviorObject[]
})
