import { describe, expect, it } from "vitest"
import type { BehaviorContext } from "./behavior"

describe("Behavior Types", () => {
	it("should define BehaviorContext interface", () => {
		const context: BehaviorContext = {
			runtime: {} as any,
			sendOptions: {
				threaded: true,
				contentType: "text/plain"
			}
		}

		expect(context.sendOptions?.threaded).toBe(true)
		expect(context.sendOptions?.contentType).toBe("text/plain")
	})

	it("should allow optional sendOptions", () => {
		const context: BehaviorContext = {
			runtime: {} as any
		}

		expect(context.sendOptions).toBeUndefined()
	})
})
