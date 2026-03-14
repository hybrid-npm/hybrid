import type { APIRoute } from "astro"

const AGENT_URL = import.meta.env.AGENT_URL || "http://localhost:8454"

export const GET: APIRoute = async () => {
	try {
		const response = await fetch(`${AGENT_URL}/api/skills`, {
			method: "GET",
			headers: { "Content-Type": "application/json" }
		})

		const data = await response.json()
		return new Response(JSON.stringify(data), {
			status: response.status,
			headers: { "Content-Type": "application/json" }
		})
	} catch (error) {
		return new Response(JSON.stringify({ error: "Failed to fetch skills" }), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		})
	}
}

export const POST: APIRoute = async ({ request, url }) => {
	try {
		const body = await request.json()
		const action = url.pathname.split("/").pop()

		const endpoint = action === "add" ? "/api/skills/add" : "/api/skills/remove"

		const response = await fetch(`${AGENT_URL}${endpoint}`, {
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
		return new Response(JSON.stringify({ error: "Failed to modify skills" }), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		})
	}
}
