import type { APIRoute } from "astro"

const AGENT_URL = import.meta.env.AGENT_URL || "http://localhost:8454"

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await request.json()

		const response = await fetch(`${AGENT_URL}/api/auth/verify`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body)
		})

		const data = await response.json()
		return new Response(JSON.stringify(data), {
			status: response.status,
			headers: { "Content-Type": "application/json" }
		})
	} catch (error) {
		return new Response(JSON.stringify({ error: "Authentication failed" }), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		})
	}
}
