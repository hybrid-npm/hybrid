import { serve } from "@hono/node-server"
import app from "./index"
import { AGENT_PORT } from "./types"

process.on("uncaughtException", (err) => {
	console.error("[agent] uncaughtException:", err)
	process.exit(1)
})

process.on("unhandledRejection", (reason) => {
	console.error("[agent] unhandledRejection:", reason)
	process.exit(1)
})

serve({ fetch: app.fetch, port: AGENT_PORT }, (info) => {
	console.log(`[container] listening on http://localhost:${info.port}`)

	if (process.env.XMTP_WALLET_KEY) {
		import("../xmtp/index").then(({ startXmtpAgent }) => startXmtpAgent())
	} else {
		console.log("[container] XMTP_WALLET_KEY not set, skipping XMTP agent")
	}
})
