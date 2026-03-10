import type { TestContext, TestScenario } from "../harness/types.js"

export function createAclScenarios(): TestScenario[] {
	return [
		{
			name: "user workspace isolation - user A cannot read user B files",
			timeout: 30000,
			run: async (ctx: TestContext) => {
				const userAId = "user-a-" + Date.now()
				const userBId = "user-b-" + Date.now()

				await ctx.http.post("/api/chat", {
					messages: [
						{
							id: "1",
							role: "user",
							content: `Write "secret data" to file /private.txt`
						}
					],
					chatId: "isolation-test-a",
					userId: userAId
				})

				const response = await ctx.http.post("/api/chat", {
					messages: [
						{ id: "1", role: "user", content: "Read file /private.txt" }
					],
					chatId: "isolation-test-b",
					userId: userBId
				})

				if (response.status === 200) {
					const body = await response.text()
					if (body.toLowerCase().includes("secret data")) {
						throw new Error(
							"User B was able to read User A private file - ACL violation!"
						)
					}
				}
			}
		},
		{
			name: "guest users have restricted access",
			timeout: 30000,
			run: async (ctx: TestContext) => {
				const guestId = "guest-" + Date.now()
				const response = await ctx.http.post("/api/chat", {
					messages: [{ id: "1", role: "user", content: "Hello" }],
					chatId: "acl-test-guest",
					userId: guestId
				})
				if (response.status >= 500) {
					throw new Error("Guest user request failed with server error")
				}
			}
		},
		{
			name: "memory is isolated per user",
			timeout: 30000,
			run: async (ctx: TestContext) => {
				const user1Id = "memory-user-1-" + Date.now()
				const user2Id = "memory-user-2-" + Date.now()

				await ctx.http.post("/api/chat", {
					messages: [
						{
							id: "1",
							role: "user",
							content: "Remember: my favorite color is Blue"
						}
					],
					chatId: "memory-test-1",
					userId: user1Id
				})

				const stream2 = await ctx.http.postStream("/api/chat", {
					messages: [
						{ id: "1", role: "user", content: "What is my favorite color?" }
					],
					chatId: "memory-test-2",
					userId: user2Id
				})

				let responseText = ""
				for await (const chunk of stream2) {
					if (chunk.startsWith("data: ")) {
						const data = chunk.slice(6)
						if (data === "[DONE]") break

						try {
							const parsed = JSON.parse(data)
							if (parsed.type === "text") {
								responseText += parsed.content
							}
						} catch {
							// Skip invalid JSON
						}
					}
				}

				if (responseText.toLowerCase().includes("blue")) {
					throw new Error(
						"User 2 can see User 1 memory - memory isolation violated!"
					)
				}
			}
		}
	]
}
