import type { HybridConfig } from "./packages/agent/src/config/index.js"

const config: HybridConfig = {
	agent: {
		name: "my-agent",
		model: "claude-sonnet-4-20250514"
	},
	chatSdk: {
		enabled: true,
		providers: {
			slack: {
				enabled: true
				// botToken: process.env.SLACK_BOT_TOKEN,
				// signingSecret: process.env.SLACK_SIGNING_SECRET
			},
			discord: {
				enabled: false
				// botToken: process.env.DISCORD_BOT_TOKEN,
				// publicKey: process.env.DISCORD_PUBLIC_KEY,
				// applicationId: process.env.DISCORD_APPLICATION_ID
			},
			linear: {
				enabled: false
				// apiKey: process.env.LINEAR_API_KEY,
				// webhookSecret: process.env.LINEAR_WEBHOOK_SECRET
			}
		}
	}
}

export default config
