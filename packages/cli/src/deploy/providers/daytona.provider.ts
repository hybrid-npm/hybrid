import { execFileSync, spawn } from "node:child_process"
import { existsSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import type {
	DeployProvider,
	InstanceStatus,
	ProvisionOpts
} from "../deploy-provider"

// ============================================================================
// Daytona Provider
//
// Uses the `daytona` CLI for workspace management.
// Daytona creates Firecracker-based dev workspaces on local or cloud providers.
//
// Sleep/wake: `daytona stop` / `daytona start` — full stop/start cycle (~30s wake)
// This is the slowest wake time of all providers.
// ============================================================================

const CLI = "daytona"

function runDaytona(args: string[]): string {
	return execFileSync(CLI, args, {
		encoding: "utf-8",
		stdio: ["pipe", "pipe", "pipe"]
	})
}

function runDaytonaInherit(args: string[]): void {
	execFileSync(CLI, args, { stdio: "inherit" })
}

export const daytonaProvider: DeployProvider = {
	name: "daytona",
	label: "Daytona.io (Firecracker / Dev Workspace)",

	defaultName(projectDir: string): string {
		return basename(projectDir)
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40)
	},

	async authCheck(): Promise<void> {
		try {
			runDaytona(["info"])
		} catch (err: any) {
			if (err.code === "ENOENT") {
				throw new Error(
					"`daytona` CLI not found.\n    " +
						"Install: https://www.daytona.io/docs/getting-started/installation/\n    " +
						"Or: curl -NF https://download.daytona.io/daytona/install.sh | sh"
				)
			}
			throw new Error(`Daytona CLI error: ${err.stderr || err.message}`)
		}
	},

	async provision(name: string, opts?: ProvisionOpts): Promise<string> {
		// Check if workspace already exists
		try {
			const existing = runDaytona(["list"])
			// Parse daytona list output to find matching workspace
			const lines = existing.split("\n")
			const found = lines.find((l) => l.includes(name))
			if (found) {
				console.log(`   ⚠️  Workspace already exists: ${name}`)
				return name
			}
		} catch {
			// No workspaces listed, create new
		}

		console.log(`\n📦 Creating Daytona workspace: ${name}`)

		// Create workspace with Node.js image
		const image = opts?.memory ? "node:20" : "node:20"
		const args = ["create", "--name", name, "--image", image]

		// Add provider flag if specified
		const provider = process.env.DAYTONA_PROVIDER
		if (provider) {
			args.push("--provider", provider)
		}

		runDaytonaInherit(args)
		console.log("   ✓ Workspace created")
		return name
	},

	async deploy(instanceId: string, distDir: string): Promise<void> {
		console.log("\n📤 Uploading build artifacts...")

		const tarPath = join(tmpdir(), `hybrid-daytona-${Date.now()}.tar.gz`)
		execFileSync("tar", ["-czf", tarPath, "-C", distDir, "."], {
			stdio: "pipe"
		})

		// Create app directory
		runDaytonaInherit([
			"code",
			instanceId,
			"--command",
			"mkdir -p /workspace/app"
		])

		// Upload tarball using daytona cp (if available) or code command
		try {
			runDaytonaInherit([
				"cp",
				tarPath,
				`${instanceId}:/workspace/app/hybrid-deploy.tar.gz`
			])
		} catch {
			// Fallback: pipe tarball to daytona code via stdin
			const { readFileSync } = await import("node:fs")
			const { spawn } = await import("node:child_process")
			const tarContent = readFileSync(tarPath)

			// Use shell pipe to avoid MAX_ARG_STRLEN limit
			const shell = spawn(
				"sh",
				[
					"-c",
					`cat | base64 -d > /workspace/app/hybrid-deploy.tar.gz`
				],
				{ stdio: ["pipe", "pipe", "pipe"] }
			)

			shell.stdin.write(tarContent.toString("base64"))
			shell.stdin.end()

			await new Promise<void>((resolve, reject) => {
				shell.on("exit", (code) => {
					if (code === 0) resolve()
					else reject(new Error(`base64 decode failed with code ${code}`))
				})
			})
		}

		// Extract and install deps
		runDaytonaInherit([
			"code",
			instanceId,
			"--command",
			"cd /workspace/app && tar -xzf hybrid-deploy.tar.gz && npm install --production"
		])

		// Clean up tarball
		if (existsSync(tarPath)) {
			try {
				unlinkSync(tarPath)
			} catch {}
		}

		// Start the agent
		console.log("\n🔧 Starting agent...")
		runDaytonaInherit([
			"code",
			instanceId,
			"--command",
			"cd /workspace/app && export NODE_ENV=production AGENT_PORT=8454 && nohup node server/index.cjs > /workspace/app/agent.log 2>&1 &"
		])

		// Wait for health check
		console.log("\n⏳ Waiting for agent to start...")
		let ready = false
		for (let i = 0; i < 15; i++) {
			try {
				const result = runDaytona([
					"code",
					instanceId,
					"--command",
					"curl -sf http://localhost:8454/health || echo not-ready"
				])
				if (result && !result.includes("not-ready")) {
					ready = true
					break
				}
			} catch {
				// Agent not ready yet
			}
			await new Promise((r) => setTimeout(r, 2000))
		}

		if (!ready) {
			console.log("   ⚠️  Agent health check timed out")
		} else {
			console.log("   ✓ Agent running")
		}
	},

	async status(instanceId: string): Promise<InstanceStatus> {
		try {
			const list = runDaytona(["list"])
			const lines = list.split("\n")
			const found = lines.find((l) => l.includes(instanceId))
			if (!found) return "stopped"

			const lower = found.toLowerCase()
			if (lower.includes("started") || lower.includes("running")) {
				return "running"
			}
			if (lower.includes("stopped")) {
				return "stopped"
			}
			return "unknown"
		} catch {
			return "unknown"
		}
	},

	async sleep(instanceId: string): Promise<void> {
		console.log(`\n💤 Stopping Daytona workspace: ${instanceId}`)
		try {
			runDaytonaInherit(["stop", instanceId])
			console.log("   ✓ Workspace stopped")
		} catch (err: any) {
			throw new Error(`Failed to stop workspace: ${err.stderr || err.message}`)
		}
	},

	async wake(instanceId: string): Promise<void> {
		console.log(`\n☀️  Starting Daytona workspace: ${instanceId}`)
		try {
			runDaytonaInherit(["start", instanceId])
			console.log("   ✓ Workspace starting (~30s)")
		} catch (err: any) {
			throw new Error(`Failed to start workspace: ${err.stderr || err.message}`)
		}
	},

	async logs(instanceId: string, follow = true): Promise<void> {
		const args = follow
			? ["code", instanceId, "--command", "tail -f /workspace/app/agent.log"]
			: ["code", instanceId, "--command", "cat /workspace/app/agent.log"]

		const child = spawn(CLI, args, { stdio: "inherit" })
		return new Promise((resolve, reject) => {
			child.on("exit", (code) => {
				if (code === 0) resolve()
				else reject(new Error(`daytona exited with code ${code}`))
			})
		})
	},

	async endpoint(instanceId: string): Promise<string> {
		// Daytona workspaces don't have public endpoints by default
		// Would need to configure port forwarding
		return `daytona://${instanceId}`
	},

	async teardown(instanceId: string): Promise<void> {
		console.log(`\n🗑️  Destroying Daytona workspace: ${instanceId}`)
		try {
			runDaytonaInherit(["remove", instanceId])
			console.log("   ✓ Workspace destroyed")
		} catch (err: any) {
			throw new Error(
				`Failed to destroy workspace: ${err.stderr || err.message}`
			)
		}
	}
}
