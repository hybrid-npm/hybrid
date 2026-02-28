/**
 * Hybrid Agent Configuration
 *
 * This file configures your agent. The dev script runs:
 * - Claude server (packages/agent/dist/server/index.cjs) - handles /api/chat
 * - XMTP sidecar (packages/agent/dist/xmtp.cjs) - listens for XMTP messages
 *
 * Agent identity: SOUL.md
 * Build/deploy: AGENTS.md
 */

export const config = {
	name: process.env.AGENT_NAME || "Hybrid Agent",

	// Behaviors applied to incoming XMTP messages
	behaviors: [
		// React with 👀 to every message
		{ type: "reactWith", emoji: "👀" }
	],

	// Enable scheduled tasks
	scheduler: true
}

export default config
