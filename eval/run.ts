import { spawn } from "child_process"
import { existsSync, readFileSync } from "fs"
import { join, resolve } from "path"
import { fileURLToPath } from "url"
import { createTestRunner } from "./harness/runner.js"
import type { EvalConfig } from "./harness/types.js"
import {
	createAclScenarios,
	createBootstrappingScenarios,
	createCapabilitiesScenarios,
	createErrorsScenarios,
	createMessagingScenarios
} from "./scenarios/index.js"

const __dirname = fileURLToPath(new URL(".", import.meta.url))

let agentProcess: ReturnType<typeof spawn> | null = null

async function startAgent(): Promise<void> {
	console.log("Starting agent...")

	const agentDir = join(__dirname, "..", "packages", "agent")

	// Load .env from agent directory or root if it exists
	const rootDir = join(__dirname, "..")
	const envFiles = [
		join(agentDir, ".env"),
		join(agentDir, ".env.local"),
		join(rootDir, ".env.local"),
		join(rootDir, ".env")
	]
	const env = { ...process.env }

	for (const envFile of envFiles) {
		if (existsSync(envFile)) {
			const envContent = readFileSync(envFile, "utf-8")
			for (const line of envContent.split("\n")) {
				const match = line.match(/^([^=]+)=(.*)$/)
				if (match) {
					const key = match[1]?.trim()
					const value = match[2]?.trim()
					if (key && value !== undefined) {
						env[key] = value
					}
				}
			}
		}
	}

	if (!env.ANTHROPIC_API_KEY && !env.OPENROUTER_API_KEY) {
		console.error(
			"Error: ANTHROPIC_API_KEY or OPENROUTER_API_KEY required to run evals"
		)
		console.error("")
		console.error("Set one of:")
		console.error("  export ANTHROPIC_API_KEY=your-key")
		console.error("  export OPENROUTER_API_KEY=your-key")
		console.error("")
		console.error("Or add to your .env file in packages/agent/")
		process.exit(1)
	}

	console.log(
		"Using API key from:",
		envFiles.some((f) => existsSync(f)) ? ".env file" : "environment"
	)

	agentProcess = spawn("pnpm", ["tsx", "src/server/simple.ts"], {
		cwd: agentDir,
		env,
		stdio: "pipe",
		detached: false
	})

	agentProcess.stdout?.on("data", (data) => {
		const str = data.toString()
		if (str.includes("8454")) {
			console.log("Agent server started on port 8454")
		}
	})

	agentProcess.stderr?.on("data", (data) => {
		console.error("Agent error:", data.toString().slice(0, 200))
	})

	agentProcess.on("exit", (code) => {
		console.log("Agent exited with code:", code)
	})

	// Wait for agent to be ready
	for (let i = 0; i < 60; i++) {
		try {
			const response = await fetch("http://localhost:8454/health")
			if (response.ok) {
				console.log("Agent is ready!\n")
				return
			}
		} catch {
			// Not ready yet
		}
		await new Promise((resolve) => setTimeout(resolve, 1000))
	}

	throw new Error("Agent failed to start within 60 seconds")
}

async function stopAgent(): Promise<void> {
	if (agentProcess) {
		console.log("\nStopping agent...")
		agentProcess.kill("SIGTERM")
		await new Promise((resolve) => setTimeout(resolve, 2000))
		if (agentProcess.exitCode === null) {
			agentProcess.kill("SIGKILL")
		}
		agentProcess = null
	}
}

async function main() {
	const agentUrl = process.env.AGENT_URL || "http://localhost:8454"
	const xmtpSidecarUrl = process.env.XMTP_SIDECAR_URL || "http://localhost:8455"
	const walletsPath =
		process.env.TEST_WALLETS_PATH || resolve(__dirname, "fixtures/wallets.json")
	const resultsPath =
		process.env.RESULTS_PATH || resolve(__dirname, "results/results.json")

	const config: EvalConfig = {
		agentUrl,
		xmtpSidecarUrl,
		walletsPath,
		resultsPath,
		timeout: 60000
	}

	const runner = createTestRunner()

	// Check if agent is already running
	const existingAgent = await fetch(`${agentUrl}/api/health`)
		.then((r) => r.ok)
		.catch(() => false)

	if (!existingAgent) {
		await startAgent()
	} else {
		console.log("Using existing agent at", agentUrl, "\n")
	}

	runner.addScenario(...createBootstrappingScenarios())
	runner.addScenario(...createMessagingScenarios())
	runner.addScenario(...createAclScenarios())
	runner.addScenario(...createCapabilitiesScenarios())
	runner.addScenario(...createErrorsScenarios())

	try {
		const results = await runner.run(config)

		const failed = results.filter((r) => r.status === "failed")

		if (failed.length > 0) {
			console.error(`\n${failed.length} test(s) failed:`)
			for (const f of failed) {
				console.error(`  - ${f.scenario}: ${f.error}`)
			}
			process.exit(1)
		}
	} finally {
		await stopAgent()
	}
}

main().catch((error) => {
	console.error("Fatal error:", error)
	stopAgent()
	process.exit(1)
})
