import { execFileSync } from "node:child_process"
import { existsSync, unlinkSync } from "node:fs"
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

// In-process cache — populated during deploy, used for subsequent ops
// in the same CLI invocation.
const sandboxes = new Map<string, SandboxInstance>()

/** Look up a sandbox by name or ID via the E2B API. Works across CLI invocations. */
async function findSandbox(name: string): Promise<SandboxInstance | null> {
	const Sandbox = await getSDK()
	const paginator = Sandbox.list()
	while (paginator.hasNext) {
		const items = await paginator.nextItems()
		for (const s of items) {
			const info = (s as unknown) as Record<string, unknown>
			const meta = info.metadata as
				| Record<string, string>
				| undefined
			if (
				meta?.["hybrid-name"] === name ||
				info.sandboxId === name ||
				(info.sandboxId as string)?.startsWith(name)
			) {
				return s as SandboxInstance
			}
		}
	}
	return null
}

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

/** Get a sandbox instance, trying cache first then API lookup. */
async function getSandbox(name: string): Promise<SandboxInstance | null> {
	const cached = sandboxes.get(name)
	if (cached) return cached

	const found = await findSandbox(name)
	if (!found) return null

	const Sandbox = await getSDK()
	const sandbox = await Sandbox.connect((found as any).sandboxId)
	sandboxes.set(name, sandbox)
	return sandbox
}

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

		const existing = await findSandbox(name)
		if (existing) {
			const sandbox = await Sandbox.connect(
				(existing as any).sandboxId,
			)
			sandboxes.set(name, sandbox)
			console.log(
				`   ✓ Resumed existing sandbox: ${(existing as any).sandboxId}`,
			)
			return (existing as any).sandboxId
		}

		const sandbox = await Sandbox.create(DEFAULT_TEMPLATE, {
			metadata: { "hybrid-name": name },
		})

		sandboxes.set(name, sandbox)
		console.log(`   ✓ Sandbox created: ${sandbox.sandboxId}`)
		return sandbox.sandboxId
	},

	async deploy(instanceId: string, distDir: string): Promise<void> {
		const sandbox = await getSandbox(instanceId)
		if (!sandbox) {
			throw new Error(
				`Sandbox ${instanceId} not found.\nRun 'hybrid deploy' again to reconnect.`,
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

		console.log("\n🔧 Starting agent...")
		await sandbox.commands.run(
			"cd /home/user/app && export NODE_ENV=production AGENT_PORT=8454 && nohup node server/index.cjs > /tmp/agent.log 2>&1 & echo $! > /tmp/agent.pid",
			{ timeout: 10000 },
		)

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
		const sandbox = await getSandbox(instanceId)
		if (sandbox) return "running"

		const info = await findSandbox(instanceId)
		if (!info) return "stopped"
		const status = (info as any).status as string
		if (status === "paused") return "sleeping"
		if (status === "running") return "running"
		return "unknown"
	},

	async sleep(instanceId: string): Promise<void> {
		const sandbox = await getSandbox(instanceId)
		if (!sandbox) {
			throw new Error(
				`Sandbox ${instanceId} not found.\nRun 'hybrid deploy' again to reconnect.`,
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
		const sandbox = await getSandbox(instanceId)
		if (!sandbox) {
			throw new Error(
				`Sandbox ${instanceId} not found.\nRun 'hybrid deploy' again to reconnect.`,
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
		if (!sandbox) return `https://${instanceId}-8454.e2b.dev`

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
