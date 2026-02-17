import { serve } from "@hono/node-server"
import app from "./index"
import { GATEWAY_PORT } from "../server/types"

serve({ fetch: app.fetch, port: GATEWAY_PORT }, (info) => {
	console.log(`agent-gateway listening on http://localhost:${info.port}`)
})
