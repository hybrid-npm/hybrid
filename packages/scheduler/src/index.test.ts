import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { AgentScheduler, createAgentScheduler } from "../src/index"

describe("AgentScheduler", () => {
	let scheduler: AgentScheduler
	let executedTasks: Array<{ taskId: string; prompt: string; result: string }>

	beforeEach(() => {
		executedTasks = []
		scheduler = new AgentScheduler()

		scheduler.setExecutor(async (task) => {
			const result = `Executed: ${task.payload.prompt}`
			executedTasks.push({
				taskId: task.id,
				prompt: task.payload.prompt,
				result
			})
			return result
		})
	})

	afterEach(() => {
		scheduler.stop()
	})

	describe("schedule", () => {
		it("should schedule a one-time task", async () => {
			const futureDate = new Date(Date.now() + 60_000).toISOString()

			const task = await scheduler.schedule({
				name: "Test task",
				scheduleType: "once",
				scheduleValue: futureDate,
				prompt: "Hello from the future"
			})

			expect(task.id).toBeDefined()
			expect(task.name).toBe("Test task")
			expect(task.scheduleType).toBe("once")
			expect(task.status).toBe("active")
			expect(task.nextRun).toBeInstanceOf(Date)
		})

		it("should schedule an interval task", async () => {
			const task = await scheduler.schedule({
				name: "Recurring task",
				scheduleType: "interval",
				scheduleValue: "60000",
				prompt: "Run every minute"
			})

			expect(task.id).toBeDefined()
			expect(task.scheduleType).toBe("interval")
			expect(task.status).toBe("active")
		})

		it("should schedule a cron task", async () => {
			const task = await scheduler.schedule({
				name: "Cron task",
				scheduleType: "cron",
				scheduleValue: "0 9 * * *",
				prompt: "Run daily at 9am"
			})

			expect(task.id).toBeDefined()
			expect(task.scheduleType).toBe("cron")
			expect(task.status).toBe("active")
		})

		it("should throw on invalid schedule", async () => {
			await expect(
				scheduler.schedule({
					name: "Invalid task",
					scheduleType: "once",
					scheduleValue: "invalid-date",
					prompt: "This should fail"
				})
			).rejects.toThrow()
		})

		it("should throw on invalid cron expression", async () => {
			await expect(
				scheduler.schedule({
					name: "Invalid cron",
					scheduleType: "cron",
					scheduleValue: "invalid-cron",
					prompt: "This should fail"
				})
			).rejects.toThrow()
		})
	})

	describe("listTasks", () => {
		it("should list all scheduled tasks when no store", async () => {
			await scheduler.schedule({
				name: "Task 1",
				scheduleType: "once",
				scheduleValue: new Date(Date.now() + 60_000).toISOString(),
				prompt: "Test 1"
			})

			await scheduler.schedule({
				name: "Task 2",
				scheduleType: "interval",
				scheduleValue: "60000",
				prompt: "Test 2"
			})

			const tasks = await scheduler.listTasks()
			expect(tasks).toHaveLength(0)
		})
	})

	describe("pauseTask / resumeTask", () => {
		it("should pause and resume a task", async () => {
			const task = await scheduler.schedule({
				name: "Pausable task",
				scheduleType: "interval",
				scheduleValue: "60000",
				prompt: "Test"
			})

			await scheduler.pauseTask(task.id)
			const paused = await scheduler.getTask(task.id)
			expect(paused?.status).toBeUndefined()

			await scheduler.resumeTask(task.id)
			const resumed = await scheduler.getTask(task.id)
			expect(resumed).toBeUndefined()
		})
	})

	describe("deleteTask", () => {
		it("should delete a task", async () => {
			const task = await scheduler.schedule({
				name: "Deletable task",
				scheduleType: "once",
				scheduleValue: new Date(Date.now() + 60_000).toISOString(),
				prompt: "Test"
			})

			await scheduler.deleteTask(task.id)
			const deleted = await scheduler.getTask(task.id)
			expect(deleted).toBeUndefined()
		})
	})

	describe("executor", () => {
		it("should schedule a task with future date", async () => {
			const futureDate = new Date(Date.now() + 60000).toISOString()

			const task = await scheduler.schedule({
				name: "Future task",
				scheduleType: "once",
				scheduleValue: futureDate,
				prompt: "Not due yet"
			})

			expect(task.id).toBeDefined()
			expect(task.nextRun).toBeInstanceOf(Date)
		})
	})

	describe("start / stop", () => {
		it("should start and stop the scheduler", () => {
			expect(scheduler.isRunning()).toBe(false)

			scheduler.start()
			expect(scheduler.isRunning()).toBe(true)

			scheduler.stop()
			expect(scheduler.isRunning()).toBe(false)
		})

		it("should not start twice", () => {
			scheduler.start()
			scheduler.start()
			expect(scheduler.isRunning()).toBe(true)
		})
	})
})

describe("createAgentScheduler", () => {
	it("should create a scheduler instance", async () => {
		const scheduler = await createAgentScheduler()
		expect(scheduler).toBeInstanceOf(AgentScheduler)
		scheduler.stop()
	})
})
