import { execFileSync } from "node:child_process"
import { existsSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import type {
	DeployProvider,
	InstanceStatus,
	ProvisionOpts
} from "../deploy-provider"

// ============================================================================
// E2B.dev Provider
//
// Uses the `e2b` SDK npm package for sandbox management.
// Requires E2B_API_KEY environment variable.
//
// Sleep/wake: Sandbox.pause() freezes state to persistent disk.
//             Sandbox.resume(sandboxId) restores to exact state.
// ============================================================================

const DEFAULT_TEMPLATE = "hybrid" // Custom template with agent pre-installed

async function importSDK() {
	try {
		// @ts-expect-error e2b is an optional peer dependency
		const { Sandbox } = await import("e2b")
		return Sandbox
	} catch {
		throw new Error(`e2b not installed.\nInstall with: npm install e2b`)
	}
}

function getAPIKey(): string {
	const key = process.env.E2B_API_KEY
	if (!key) {
		throw new Error(
			"E2B_API_KEY not set.\nGet your key: https://e2b.dev/dashboard?tab=keys\nSet with: export E2B_API_KEY=e2b_xxx"
		)
	}
	return key
}

// Map of active sandbox instances (so we don't lose references)
const sandboxes = new Map<string, any>()

export const e2bProvider: DeployProvider = {
	name: "e2b",
	label: "E2B.dev (Firecracker)",

	defaultName(projectDir: string): string {
		return basename(projectDir)
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40)
	},

	async authCheck(): Promise<void> {
		// Check API key
		getAPIKey()

		// Check SDK installed
		try {
			await importSDK()
		} catch (err: any) {
			throw new Error(err.message)
		}

		// Try listing sandboxes to verify auth works
		const Sandbox = await importSDK()
		try {
			await Sandbox.list()
		} catch (err: any) {
			if (
				err.message?.includes("401") ||
				err.message?.includes("unauthorized")
			) {
				throw new Error(
					"E2B API key is invalid.\nGet your key: https://e2b.dev/dashboard?tab=keys"
				)
			}
			throw new Error(`E2B connection failed: ${err.message}`)
		}
	},

	async provision(name: string, _opts?: ProvisionOpts): Promise<string> {
		const Sandbox = await importSDK()
		const apiKey = getAPIKey()

		console.log(`\n📦 Creating E2B sandbox: ${name}`)

		// Try to resume an existing paused sandbox first
		try {
			// Check if there's a paused sandbox with a matching metadata label
			const list = await Sandbox.list({ limit: 50 })
			let result: any = null
			for (const s of list) {
				const meta = s.metadata as Record<string, string> | undefined
				if (meta?.["hybrid-name"] === name) {
					result = s
					break
				}
				// Fallback: match by sandbox ID suffix
				if (s.sandboxId === name || s.sandboxId?.startsWith(name)) {
					result = s
					break
				}
			}

			if (result) {
				const sandbox = await Sandbox.resume({
					sandboxId: result.sandboxId,
					apiKey
				})
				sandboxes.set(name, sandbox)
				console.log(`   ✓ Resumed existing sandbox: ${result.sandboxId}`)
				return result.sandboxId
			}
		} catch {
			// No existing sandbox, create new
		}

		// Create new sandbox
		const sandbox = await Sandbox.create({
			template: DEFAULT_TEMPLATE,
			metadata: { "hybrid-name": name },
			apiKey
		})

		sandboxes.set(name, sandbox)
		console.log(`   ✓ Sandbox created: ${sandbox.sandboxId}`)
		return sandbox.sandboxId
	},

	async deploy(instanceId: string, distDir: string): Promise<void> {
		const sandbox = sandboxes.get(instanceId)
		if (!sandbox) {
			throw new Error(
				`Sandbox ${instanceId} not found in active sessions.\nRun 'hybrid deploy' again to reconnect.`
			)
		}

		console.log("\n📤 Uploading build artifacts...")

		// Create tarball of dist
		const tarPath = join(tmpdir(), `hybrid-e2b-deploy-${Date.now()}.tar.gz`)
		execFileSync("tar", ["-czf", tarPath, "-C", distDir, "."], {
			stdio: "pipe"
		})

		// Upload tarball to sandbox
		try {
			const fs = await import("node:fs/promises")
			const tarBuffer = await fs.readFile(tarPath)
			await sandbox.files.write("/tmp/hybrid-deploy.tar.gz", tarBuffer, {
				onProgress: (p: number) => {
					if (p === 100) console.log("   ✓ Upload complete")
				}
			})
		} catch (err: any) {
			throw new Error(`Upload failed: ${err.message}`)
		} finally {
			if (existsSync(tarPath)) {
				try {
					unlinkSync(tarPath)
				} catch {}
			}
		}

		// Extract and install deps
		console.log("\n📦 Extracting and installing dependencies...")
		const result = await sandbox.commands.run(
			"cd /home/user && mkdir -p app && tar -xzf /tmp/hybrid-deploy.tar.gz -C app && cd app && npm install --production 2>&1",
			{ timeout: 120000 }
		)

		if (result.stderr) {
			console.log(`   ⚠️  ${result.stderr.slice(0, 200)}`)
		}

		if (result.exitCode !== 0) {
			throw new Error(
				`Dependency installation failed (exit ${result.exitCode})`
			)
		}

		// Start the agent
		console.log("\n🔧 Starting agent...")
		await sandbox.commands.run(
			"cd /home/user/app && export NODE_ENV=production AGENT_PORT=8454 && nohup node server/index.cjs > /tmp/agent.log 2>&1 & echo $! > /tmp/agent.pid",
			{ timeout: 10000 }
		)

		// Wait for agent health check
		console.log("\n⏳ Waiting for agent to start...")
		let ready = false
		for (let i = 0; i < 15; i++) {
			try {
				const health = await sandbox.commands.run(
					"curl -sf http://localhost:8454/health || echo 'not ready'"
				)
				if (health.stdout && !health.stdout.includes("not ready")) {
					ready = true
					break
				}
			} catch {
				// Agent not ready yet
			}
			await new Promise((r) => setTimeout(r, 2000))
		}

		if (!ready) {
			console.log("   ⚠️  Agent health check timed out (may still be starting)")
		} else {
			console.log("   ✓ Agent running")
		}
	},

	async status(instanceId: string): Promise<InstanceStatus> {
		// Check if we have the sandbox cached
		const cached = sandboxes.get(instanceId)
		if (cached) {
			return "running"
		}

		// Query E2B for sandbox state
		try {
			const Sandbox = await importSDK()
			const list = await Sandbox.list({ limit: 50 })
			const found = list.find(
				(s: any) =>
					s.sandboxId === instanceId || s.sandboxId?.startsWith(instanceId)
			)
			if (!found) {
				return "stopped"
			}
			if (found.status === "paused") {
				return "sleeping"
			}
			return "running"
		} catch {
			return "unknown"
		}
	},

	async sleep(instanceId: string): Promise<void> {
		const sandbox = sandboxes.get(instanceId)
		if (!sandbox) {
			throw new Error(
				`Sandbox ${instanceId} not found in active sessions.\nCannot pause a sandbox that isn't connected.`
			)
		}

		console.log(`\n💤 Pausing E2B sandbox: ${instanceId}`)
		await sandbox.pause()
		sandboxes.delete(instanceId)
		console.log("   ✓ Sandbox paused (state preserved on disk)")
	},

	async wake(instanceId: string): Promise<void> {
		const Sandbox = await importSDK()
		const apiKey = getAPIKey()

		console.log(`\n☀️  Resuming E2B sandbox: ${instanceId}`)
		try {
			const sandbox = await Sandbox.resume({ sandboxId: instanceId, apiKey })
			sandboxes.set(instanceId, sandbox)
			console.log("   ✓ Sandbox resumed")
		} catch (err: any) {
			throw new Error(
				`Failed to resume sandbox: ${err.message}\nThe sandbox may have expired (E2B sandboxes have a maximum lifetime).`
			)
		}
	},

	async logs(instanceId: string, follow = true): Promise<void> {
		const sandbox = sandboxes.get(instanceId)
		if (!sandbox) {
			throw new Error(
				`Sandbox ${instanceId} not found. Wake it first with: hybrid deploy wake ${instanceId}`
			)
		}

		if (follow) {
			// Tail logs by polling
			let offset = 0
			while (true) {
				try {
					const result = await sandbox.commands.run(
						`cat /tmp/agent.log 2>/dev/null || echo "No logs yet"`
					)
					const output = result.stdout || ""
					if (output.length > offset) {
						process.stdout.write(output.slice(offset))
						offset = output.length
					}
					await new Promise((r) => setTimeout(r, 2000))
				} catch {
					await new Promise((r) => setTimeout(r, 2000))
				}
			}
		} else {
			const result = await sandbox.commands.run(
				"cat /tmp/agent.log 2>/dev/null || echo 'No logs yet'"
			)
			console.log(result.stdout || "No logs yet")
		}
	},

	async endpoint(instanceId: string): Promise<string> {
		const sandbox = sandboxes.get(instanceId)
		if (!sandbox) {
			// E2B provides a predictable URL format
			return `https://${instanceId}-8454.e2b.dev`
		}

		// Get the actual host URL from the sandbox
		try {
			const host = await sandbox.getHost(8454)
			return `https://${host}`
		} catch {
			return `https://${instanceId}-8454.e2b.dev`
		}
	},

	async teardown(instanceId: string): Promise<void> {
		const Sandbox = await importSDK()

		console.log(`\n🗑️  Destroying E2B sandbox: ${instanceId}`)
		try {
			// Kill the sandbox if we have a reference
			const cached = sandboxes.get(instanceId)
			if (cached) {
				await cached.kill()
			} else {
				// Find by ID and kill
				const list = await Sandbox.list({ limit: 50 })
				const found = list.find(
					(s: any) =>
						s.sandboxId === instanceId || s.sandboxId?.startsWith(instanceId)
				)
				if (found) {
					await found.kill()
				}
			}
			sandboxes.delete(instanceId)
			console.log("   ✓ Sandbox destroyed")
		} catch (err: any) {
			throw new Error(`Failed to destroy sandbox: ${err.message}`)
		}
	}
}
