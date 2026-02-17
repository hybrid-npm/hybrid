import { loadDevVars } from "../env"
loadDevVars()

import { serve } from "@hono/node-server"
import app from "./index"
import { startXmtpAgent } from "../xmtp/index"
import { AGENT_PORT } from "./types"

if (!process.env.XMTP_WALLET_KEY) {
	console.error("[container] XMTP_WALLET_KEY is required")
	process.exit(1)
}

process.on("uncaughtException", (err) => {
	console.error("[agent] uncaughtException:", err)
	process.exit(1)
})

process.on("unhandledRejection", (reason) => {
	console.error("[agent] unhandledRejection:", reason)
	process.exit(1)
})

console.log("[container] starting...")

serve({ fetch: app.fetch, port: AGENT_PORT }, (info) => {
	console.log(`[container] HTTP server listening on http://localhost:${info.port}`)
	startXmtpAgent()
})
