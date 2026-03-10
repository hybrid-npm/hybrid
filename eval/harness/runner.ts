import { existsSync, mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { createHttpClient, waitForAgent } from "./client.js"
import type {
	EvalConfig,
	TestContext,
	TestResult,
	TestScenario,
	XmtpTestClient
} from "./types.js"
import { createXmtpClient, loadTestWallets } from "./xmtp-client.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

export class TestRunner {
	private scenarios: TestScenario[] = []
	private results: TestResult[] = []

	addScenario(...scenarios: TestScenario[]): void {
		this.scenarios.push(...scenarios)
	}

	async run(config: EvalConfig): Promise<TestResult[]> {
		console.log("Starting eval harness...\n")

		const http = createHttpClient(config.agentUrl)
		const wallets = existsSync(config.walletsPath)
			? loadTestWallets(config.walletsPath)
			: []

		console.log(`Found ${wallets.length} test wallets`)
		console.log(`Agent URL: ${config.agentUrl}\n`)

		const agentReady = await waitForAgent(config.agentUrl, 10000)
		if (!agentReady) {
			console.log("Agent not available at", config.agentUrl)
			console.log("\nTo run evals:")
			console.log("  1. Start agent: cd packages/agent && pnpm dev")
			console.log("  2. Run evals:   pnpm evals:run\n")

			for (const scenario of this.scenarios) {
				this.results.push({
					scenario: scenario.name,
					status: "skipped",
					duration: 0,
					error: "Agent not running - skipped in offline mode"
				})

				console.log(`○ ${scenario.name} (skipped: agent not running)`)
			}

			this.saveResults(config.resultsPath)
			console.log(
				"\nResults: 0 passed, 0 failed, " +
					this.scenarios.length +
					" skipped (offline mode)"
			)
			return this.results
		}

		console.log("Agent is healthy\n")

		let xmtp: XmtpTestClient | undefined
		if (wallets.length > 0) {
			const env = config.agentUrl.includes("dev") ? "dev" : "production"
			xmtp = createXmtpClient(wallets[0], env)
			console.log("XMTP client initialized (stub mode)\n")
		}

		const ctx: TestContext = {
			agentUrl: config.agentUrl,
			xmtpSidecarUrl: config.xmtpSidecarUrl,
			wallets,
			http,
			xmtp: xmtp!
		}

		for (const scenario of this.scenarios) {
			const result = await this.runScenario(
				scenario,
				ctx,
				config.timeout ?? 60000
			)
			this.results.push(result)

			const status =
				result.status === "passed"
					? "✓"
					: result.status === "failed"
						? "✗"
						: "○"
			console.log(`${status} ${scenario.name} (${result.duration}ms)`)

			if (result.error && result.status !== "skipped") {
				console.log(`  Error: ${result.error}\n`)
			}
		}

		if (xmtp) {
			await xmtp.close()
		}

		this.saveResults(config.resultsPath)

		const passed = this.results.filter((r) => r.status === "passed").length
		const failed = this.results.filter((r) => r.status === "failed").length
		const skipped = this.results.filter((r) => r.status === "skipped").length

		console.log(
			`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped`
		)

		return this.results
	}

	private async runScenario(
		scenario: TestScenario,
		ctx: TestContext,
		timeout: number
	): Promise<TestResult> {
		const startTime = Date.now()

		try {
			await Promise.race([
				scenario.run(ctx),
				new Promise((_, reject) =>
					setTimeout(
						() => reject(new Error(`Timeout after ${timeout}ms`)),
						timeout
					)
				)
			])

			return {
				scenario: scenario.name,
				status: "passed",
				duration: Date.now() - startTime
			}
		} catch (error: unknown) {
			const err = error as { message?: string }
			return {
				scenario: scenario.name,
				status: "failed",
				duration: Date.now() - startTime,
				error: err.message ?? "Unknown error"
			}
		}
	}

	private saveResults(resultsPath: string): void {
		const dir = dirname(resultsPath)
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true })
		}

		const junitXml = this.generateJUnitXml()
		writeFileSync(join(dir, "results.xml"), junitXml)

		writeFileSync(resultsPath, JSON.stringify(this.results, null, 2))
	}

	private generateJUnitXml(): string {
		let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n'
		xml +=
			'  <testsuite name="evals" tests="' +
			this.results.length +
			'" failures="' +
			this.results.filter((r) => r.status === "failed").length +
			'">\n'

		for (const result of this.results) {
			const status = result.status === "passed" ? "pass" : result.status
			xml +=
				'    <testcase name="' +
				result.scenario +
				'" time="' +
				result.duration / 1000 +
				'">\n'

			if (result.status === "failed") {
				xml += '      <failure message="' + (result.error ?? "failed") + '"/>\n'
			}

			xml += "    </testcase>\n"
		}

		xml += "  </testsuite>\n</testsuites>"
		return xml
	}
}

export function createTestRunner(): TestRunner {
	return new TestRunner()
}
