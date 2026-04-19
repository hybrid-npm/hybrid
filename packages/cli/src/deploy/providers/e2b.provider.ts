import { execFileSync, spawn } from "node:child_process"
import { existsSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import type {
	DeployProvider,
	InstanceStatus,
	ProvisionOpts,
} from "../deploy-provider"

// ============================================================================
// E2B.dev Provider
//
// Uses the `e2b` npm package for sandbox management.
// Requires E2B_API_KEY environment variable.
//
// Sleep/wake: sandbox.pause() freezes state.
//             Sandbox.connect(sandboxId) resumes (auto-resumes if paused).
// ============================================================================

const DEFAULT_TEMPLATE = "base"

type SandboxInstance = any // eslint-disable-line @typescript-eslint/no-explicit-any

async function getSDK() {
	try {
		const { Sandbox } = await import("e2b")
		return Sandbox
	} catch {
		throw new Error(
			"e2b not installed.\nInstall with: npm install e2b",
		)
	}
}

function getAPIKey(): string {
	const key = process.env.E2B_API_KEY
	if (!key) {
		throw new Error(
			"E2B_API_KEY not set.\nGet your key: https://e2b.dev/dashboard?tab=keys\nSet with: export E2B_API_KEY=e2b_xxx",
		)
	}
	return key
}

const sandboxes = new Map<string, SandboxInstance>()

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
		getAPIKey()
		const Sandbox = await getSDK()
		try {
			// Try listing — Sandbox.list() returns a paginator in e2b v2
			const paginator = Sandbox.list()
			await paginator.nextItems()
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err)
			if (msg.includes("401") || msg.includes("unauthorized")) {
				throw new Error(
					"E2B API key is invalid.\nGet your key: https://e2b.dev/dashboard?tab=keys",
				)
			}
			throw new Error(`E2B connection failed: ${msg}`)
		}
	},

	async provision(name: string, _opts?: ProvisionOpts): Promise<string> {
		const Sandbox = await getSDK()

		console.log(`\n📦 Creating E2B sandbox: ${name}`)

		// Try to resume an existing paused sandbox first
		try {
			const paginator = Sandbox.list()
			let found: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
			while (paginator.hasNext) {
				const items = await paginator.nextItems()
				for (const s of items) {
					const info = s as any
					const meta = info.metadata as
						| Record<string, string>
						| undefined
					if (meta?.["hybrid-name"] === name) {
						found = info
						break
					}
					if (
						info.sandboxId === name ||
						info.sandboxId?.startsWith(name)
					) {
						found = info
						break
					}
				}
				if (found) break
			}

			if (found) {
				// connect() auto-resumes if paused
				const sandbox = await Sandbox.connect(found.sandboxId)
				sandboxes.set(name, sandbox)
				console.log(
					`   ✓ Resumed existing sandbox: ${found.sandboxId}`,
				)
				return found.sandboxId
			}
		} catch {
			// No existing sandbox, create new
		}

		// Create new sandbox — template is first positional arg in e2b v2
		const sandbox = await Sandbox.create(DEFAULT_TEMPLATE, {
			metadata: { "hybrid-name": name },
		})

		sandboxes.set(name, sandbox)
		console.log(`   ✓ Sandbox created: ${sandbox.sandboxId}`)
		return sandbox.sandboxId
	},

	async deploy(instanceId: string, distDir: string): Promise<void> {
		const sandbox = sandboxes.get(instanceId)
		if (!sandbox) {
			throw new Error(
				`Sandbox ${instanceId} not found in active sessions.\nRun 'hybrid deploy' again to reconnect.`,
			)
		}

		console.log("\n📤 Uploading build artifacts...")

		const tarPath = join(
			tmpdir(),
			`hybrid-e2b-deploy-${Date.now()}.tar.gz`,
		)
		execFileSync("tar", ["-czf", tarPath, "-C", distDir, "."], {
			stdio: "pipe",
		})

		try {
			const fs = await import("node:fs/promises")
			const tarBuffer = await fs.readFile(tarPath)
			await sandbox.files.write("/tmp/hybrid-deploy.tar.gz", tarBuffer, {
				onProgress: () => {},
			})
			console.log("   ✓ Upload complete")
		} catch (err: unknown) {
			throw new Error(
				`Upload failed: ${err instanceof Error ? err.message : String(err)}`,
			)
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
			{ timeout: 120000 },
		)

		if (result.stderr) {
			console.log(`   ⚠️  ${result.stderr.slice(0, 200)}`)
		}

		if (result.exitCode !== 0) {
			throw new Error(
				`Dependency installation failed (exit ${result.exitCode})`,
			)
		}

		// Start the agent
		console.log("\n🔧 Starting agent...")
		await sandbox.commands.run(
			"cd /home/user/app && export NODE_ENV=production AGENT_PORT=8454 && nohup node server/index.cjs > /tmp/agent.log 2>&1 & echo $! > /tmp/agent.pid",
			{ timeout: 10000 },
		)

		// Wait for agent health check
		console.log("\n⏳ Waiting for agent to start...")
		let ready = false
		for (let i = 0; i < 15; i++) {
			try {
				const health = await sandbox.commands.run(
					"curl -sf http://localhost:8454/health || echo 'not ready'",
				)
				if (health.stdout && !health.stdout.includes("not ready")) {
					ready = true
					break
				}
			} catch {
				// Not ready yet
			}
			await new Promise((r) => setTimeout(r, 2000))
		}

		if (!ready) {
			console.log(
				"   ⚠️  Agent health check timed out (may still be starting)",
			)
		} else {
			console.log("   ✓ Agent running")
		}
	},

	async status(instanceId: string): Promise<InstanceStatus> {
		const cached = sandboxes.get(instanceId)
		if (cached) {
			return "running"
		}

		try {
			const Sandbox = await getSDK()
			const paginator = Sandbox.list()
			while (paginator.hasNext) {
				const items = await paginator.nextItems()
				const found = items.find(
					(s: { sandboxId: string }) =>
						s.sandboxId === instanceId ||
						s.sandboxId?.startsWith(instanceId),
				)
				if (found) {
					const info = found as any
					if (info.status === "paused") {
						return "sleeping"
					}
					if (info.status === "running") {
						return "running"
					}
					return "running"
				}
			}
			return "stopped"
		} catch {
			return "unknown"
		}
	},

	async sleep(instanceId: string): Promise<void> {
		const sandbox = sandboxes.get(instanceId)
		if (!sandbox) {
			throw new Error(
				`Sandbox ${instanceId} not found in active sessions.\nCannot pause a sandbox that isn't connected.`,
			)
		}

		console.log(`\n💤 Pausing E2B sandbox: ${instanceId}`)
		await sandbox.pause()
		sandboxes.delete(instanceId)
		console.log("   ✓ Sandbox paused (state preserved on disk)")
	},

	async wake(instanceId: string): Promise<void> {
		const Sandbox = await getSDK()

		console.log(`\n☀️  Resuming E2B sandbox: ${instanceId}`)
		try {
			// Sandbox.connect auto-resumes paused sandboxes
			const sandbox = await Sandbox.connect(instanceId)
			sandboxes.set(instanceId, sandbox)
			console.log("   ✓ Sandbox resumed")
		} catch (err: unknown) {
			throw new Error(
				`Failed to resume sandbox: ${err instanceof Error ? err.message : String(err)}\nThe sandbox may have expired (E2B sandboxes have a maximum lifetime).`,
			)
		}
	},

	async logs(instanceId: string, follow = true): Promise<void> {
		const sandbox = sandboxes.get(instanceId)
		if (!sandbox) {
			throw new Error(
				`Sandbox ${instanceId} not found. Wake it first with: hybrid deploy wake ${instanceId}`,
			)
		}

		if (follow) {
			let offset = 0
			while (true) {
				try {
					const result = await sandbox.commands.run(
						"cat /tmp/agent.log 2>/dev/null || echo 'No logs yet'",
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
				"cat /tmp/agent.log 2>/dev/null || echo 'No logs yet'",
			)
			console.log(result.stdout || "No logs yet")
		}
	},

	async endpoint(instanceId: string): Promise<string> {
		const sandbox = sandboxes.get(instanceId)
		if (!sandbox) {
			return `https://${instanceId}-8454.e2b.dev`
		}

		try {
			const host = await sandbox.getHost(8454)
			return `https://${host}`
		} catch {
			return `https://${instanceId}-8454.e2b.dev`
		}
	},

	async teardown(instanceId: string): Promise<void> {
		const Sandbox = await getSDK()

		console.log(`\n🗑️  Destroying E2B sandbox: ${instanceId}`)
		try {
			const cached = sandboxes.get(instanceId)
			if (cached) {
				await cached.kill()
			} else {
				// Connect then kill
				const sandbox = await Sandbox.connect(instanceId)
				await sandbox.kill()
			}
			sandboxes.delete(instanceId)
			console.log("   ✓ Sandbox destroyed")
		} catch (err: unknown) {
			throw new Error(
				`Failed to destroy sandbox: ${err instanceof Error ? err.message : String(err)}`,
			)
		}
	},
}
