import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { Hono } from "hono"

vi.mock("./chat-sdk.js", () => ({
	getChatInstance: vi.fn(),
	initChatSdk: vi.fn(),
	shutdownChatSdk: vi.fn()
}))

import { getChatInstance } from "./chat-sdk.js"

describe("webhook routes", () => {
	let app: Hono

	beforeEach(async () => {
		vi.clearAllMocks()
		vi.resetModules()

		const { default: serverApp } = await import("./index.js")
		app = serverApp
	})

	afterEach(() => {
		vi.resetModules()
	})

	describe("GET /health", () => {
		it("returns healthy status", async () => {
			const res = await app.request("/health")
			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body).toEqual({ status: "healthy" })
		})
	})

	describe("POST /api/chat", () => {
		it("returns 400 when messages is not an array", async () => {
			const res = await app.request("/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ messages: "not-array", chatId: "test" })
			})
			expect(res.status).toBe(400)
			const body = await res.json()
			expect(body.error).toBe("messages must be an array")
		})

		it("returns 400 when chatId is missing", async () => {
			const res = await app.request("/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
			})
			expect(res.status).toBe(400)
			const body = await res.json()
			expect(body.error).toBe("chatId is required")
		})
	})

	describe("webhook endpoints", () => {
		it("returns 503 for slack webhook when chat-sdk not initialized", async () => {
			vi.mocked(getChatInstance).mockReturnValue(null)

			const res = await app.request("/api/webhooks/slack", { method: "POST" })
			expect(res.status).toBe(503)
			const body = await res.json()
			expect(body.error).toBe("chat-sdk not initialized")
		})

		it("returns 503 for discord webhook when chat-sdk not initialized", async () => {
			vi.mocked(getChatInstance).mockReturnValue(null)

			const res = await app.request("/api/webhooks/discord", { method: "POST" })
			expect(res.status).toBe(503)
			const body = await res.json()
			expect(body.error).toBe("chat-sdk not initialized")
		})

		it("returns 503 for linear webhook when chat-sdk not initialized", async () => {
			vi.mocked(getChatInstance).mockReturnValue(null)

			const res = await app.request("/api/webhooks/linear", { method: "POST" })
			expect(res.status).toBe(503)
			const body = await res.json()
			expect(body.error).toBe("chat-sdk not initialized")
		})

		it("forwards slack webhook to chat-sdk when initialized", async () => {
			const mockWebhook = vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ ok: true }), { status: 200 })
			)
			vi.mocked(getChatInstance).mockReturnValue({
				webhooks: { slack: mockWebhook }
			} as any)

			const res = await app.request("/api/webhooks/slack", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ type: "event_callback" })
			})

			expect(res.status).toBe(200)
			expect(mockWebhook).toHaveBeenCalled()
		})

		it("forwards discord webhook to chat-sdk when initialized", async () => {
			const mockWebhook = vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ ok: true }), { status: 200 })
			)
			vi.mocked(getChatInstance).mockReturnValue({
				webhooks: { discord: mockWebhook }
			} as any)

			const res = await app.request("/api/webhooks/discord", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ type: 1 })
			})

			expect(res.status).toBe(200)
			expect(mockWebhook).toHaveBeenCalled()
		})

		it("forwards linear webhook to chat-sdk when initialized", async () => {
			const mockWebhook = vi.fn().mockResolvedValue(
				new Response("ok", { status: 200 })
			)
			vi.mocked(getChatInstance).mockReturnValue({
				webhooks: { linear: mockWebhook }
			} as any)

			const res = await app.request("/api/webhooks/linear", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ type: "Comment", action: "create" })
			})

			expect(res.status).toBe(200)
			expect(mockWebhook).toHaveBeenCalled()
		})
	})
})
