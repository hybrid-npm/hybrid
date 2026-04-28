import { spawn } from "node:child_process"
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
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
let projectDir: string | null = null
let stderrLogFile: string

function createTestProject(): string {
	const templateDir = join(
		__dirname,
		"..",
		"packages",
		"cli",
		"templates",
		"agent"
	)
	const tempDir = mkdtempSync(join(tmpdir(), "hybrid-eval-"))

	mkdirSync(tempDir, { recursive: true })
	cpSync(templateDir, tempDir, { recursive: true })

	console.log(`Created test project at: ${tempDir}`)
	return tempDir
}

function cleanupTestProject() {
	if (projectDir && existsSync(projectDir)) {
		rmSync(projectDir, { recursive: true, force: true })
		console.log(`Cleaned up test project: ${projectDir}`)
	}
}

async function startAgent(projectPath: string): Promise<void> {
	console.log("Starting agent...")

	const agentDir = join(__dirname, "..", "packages", "agent")

	const rootDir = join(__dirname, "..")
	const envFiles = [
		join(agentDir, ".env"),
		join(agentDir, ".env.local"),
		join(rootDir, ".env.local"),
		join(rootDir, ".env")
	]
	const env: Record<string, string | undefined> = {
		...process.env,
		AGENT_PROJECT_ROOT: projectPath
	}

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

	agentProcess = spawn("pnpm", ["tsx", "src/server/index.ts"], {
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

	let agentOutput = ""
	// Write ALL stderr to temp file for debugging
	stderrLogFile = "/tmp/hybrid-eval-agent.log"
	try { require("node:fs").writeFileSync(stderrLogFile, "") } catch {}	agentProcess.stderr?.on("data", (data) => {
		agentOutput += data.toString()
		// Print first 1000 chars of ALL stderr for debugging
		console.error("[eval_stderr]", data.toString().slice(0, 1000).trim())
	})

	agentProcess.on("exit", (code) => {
		console.log("Agent exited with code:", code)
	})

	for (let i = 0; i < 60; i++) {
		try {
			const response = await fetch("http://localhost:8454/health")
			if (response.ok) {
				console.log("Agent is ready!\n")
		console.log("Agent stderr so far:", agentOutput.slice(-500))
				return
			}
		} catch {}
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
	const walletsPath =
		process.env.TEST_WALLETS_PATH || resolve(__dirname, "fixtures/wallets.json")
	const resultsPath =
		process.env.RESULTS_PATH || resolve(__dirname, "results/results.json")

	const config: EvalConfig = {
		agentUrl,
		walletsPath,
		resultsPath,
		timeout: 60000
	}

	const runner = createTestRunner()

	const existingAgent = await fetch(`${agentUrl}/health`)
		.then((r) => r.ok)
		.catch(() => false)

	if (!existingAgent) {
		projectDir = createTestProject()
		await startAgent(projectDir)
	} else {
		console.log("Using existing agent at", agentUrl, "\n")
	}

	runner.addScenario(...createBootstrappingScenarios())
	runner.addScenario(...createMessagingScenarios())
	runner.addScenario(...createAclScenarios())
	runner.addScenario(...createCapabilitiesScenarios())
	runner.addScenario(...createErrorsScenarios())

	try {
		// Print full agent stderr log for debugging
		const { readFileSync, existsSync } = await import("node:fs")
		if (existsSync(stderrLogFile)) {
			console.error("=== FULL AGENT STDERR ===")
			console.error(readFileSync(stderrLogFile, "utf-8"))
			console.error("=== END AGENT STDERR ===")
		}

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
		cleanupTestProject()
	}
}

main().catch((error) => {
	console.error("Fatal error:", error)
	stopAgent()
	cleanupTestProject()
	process.exit(1)
})
