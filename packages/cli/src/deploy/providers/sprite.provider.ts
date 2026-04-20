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
// Sprites.dev Provider
// ============================================================================

export const spriteProvider: DeployProvider = {
	name: "sprites",
	label: "Sprites.dev (Firecracker)",

	defaultName(projectDir: string): string {
		// Sanitize: sprites.dev names must be lowercase alphanumeric + hyphens
		return basename(projectDir)
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40)
	},

	async authCheck(): Promise<void> {
		try {
			execFileSync("sprite", ["list"], { stdio: "pipe", timeout: 5000 })
		} catch (err: any) {
			if (err.code === "ENOENT") {
				throw new Error(
					"'sprite' CLI not found.\n" +
						"   Install: https://sprites.dev/docs/install\n" +
						"   Or: npm i -g sprite-cli"
				)
			}
			throw new Error(
				`Sprite CLI authentication failed.\n   Run: sprite login\n   Error: ${err.stderr || err.message}`
			)
		}
	},

	async provision(name: string, _opts?: ProvisionOpts): Promise<string> {
		// Validate name
		if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) {
			throw new Error(
				`Invalid sprite name: ${name}\nName must start with a letter/digit and contain only letters, digits, hyphens, and underscores.`
			)
		}

		// Check if sprite already exists
		try {
			const existing = execFileSync("sprite", ["list"], {
				encoding: "utf-8"
			})
			if (existing.includes(name)) {
				return name
			}
		} catch {
			// sprite list failed for some reason, try to create anyway
		}

		console.log(`\n📦 Creating sprite: ${name}`)
		try {
			execFileSync("sprite", ["create", "-skip-console", name], {
				stdio: "inherit"
			})
		} catch {
			// May already exist (race condition) — verify
			const existing = execFileSync("sprite", ["list"], {
				encoding: "utf-8"
			})
			if (existing.includes(name)) {
				console.log(`   Sprite ${name} already exists, using it`)
				return name
			}
			throw new Error("Failed to create sprite")
		}

		// Wait for sprite to be ready
		console.log("\n⏳ Waiting for sprite to be ready...")
		for (let i = 0; i < 30; i++) {
			try {
				execFileSync("sprite", ["exec", "-s", name, "--", "echo", "ready"], {
					stdio: "pipe"
				})
				console.log("   ✓ Sprite ready")
				return name
			} catch {
				if (i % 5 === 4) {
					console.log(`   Still waiting... (${i + 1}/30)`)
				}
				await new Promise((r) => setTimeout(r, 2000))
			}
		}

		throw new Error("Sprite did not become ready in time")
	},

	async deploy(instanceId: string, distDir: string): Promise<void> {
		console.log("\n📤 Uploading build artifacts...")
		const tarPath = join(tmpdir(), `hybrid-deploy-${Date.now()}.tar.gz`)

		// Create tarball
		execFileSync("tar", ["-czf", tarPath, "-C", distDir, "."], {
			stdio: "pipe"
		})

		// Ensure /app directory exists
		execFileSync(
			"sprite",
			["exec", "-s", instanceId, "--", "mkdir", "-p", "/app"],
			{
				stdio: "pipe"
			}
		)

		// Upload and extract (retry up to 3 times)
		let uploadSuccess = false
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				execFileSync(
					"sprite",
					[
						"exec",
						"-s",
						instanceId,
						"-file",
						`${tarPath}:/tmp/hybrid-deploy.tar.gz`,
						"--",
						"tar",
						"-xzf",
						"/tmp/hybrid-deploy.tar.gz",
						"-C",
						"/app"
					],
					{ stdio: "inherit" }
				)
				uploadSuccess = true
				break
			} catch {
				if (attempt < 2) {
					console.log(`   Upload failed, retrying... (${attempt + 1}/3)`)
					await new Promise((r) => setTimeout(r, 5000))
				}
			}
		}

		// Clean up local tarball
		if (existsSync(tarPath)) {
			try {
				unlinkSync(tarPath)
			} catch {}
		}

		if (!uploadSuccess) {
			throw new Error("Failed to upload build artifacts after 3 attempts")
		}

		// Install dependencies
		console.log("\n📦 Installing dependencies...")
		execFileSync(
			"sprite",
			[
				"exec",
				"-s",
				instanceId,
				"--",
				"bash",
				"-c",
				"cd /app && npm install --production"
			],
			{ stdio: "inherit" }
		)

		// Set up and start the agent
		console.log("\n🔧 Starting agent...")
		const startupScript = `
cd /app
export NODE_ENV=production
export AGENT_PORT=8080

if [ -f /app/agent.pid ]; then
	kill $(cat /app/agent.pid) 2>/dev/null
	sleep 1
	kill -9 $(cat /app/agent.pid) 2>/dev/null
fi
fuser -k 8080/tcp 2>/dev/null
sleep 0.5

node server/index.mjs > /app/agent.log 2>&1 &
echo $! > /app/agent.pid
`
		execFileSync(
			"sprite",
			["exec", "-s", instanceId, "--", "bash", "-c", startupScript],
			{ stdio: "inherit" }
		)

		// Wait for agent to be ready
		console.log("\n⏳ Waiting for agent to start...")
		let ready = false
		for (let i = 0; i < 15; i++) {
			try {
				const result = execFileSync(
					"sprite",
					[
						"exec",
						"-s",
						instanceId,
						"--",
						"curl",
						"-s",
						"http://localhost:8080/health"
					],
					{ encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
				)
				if (result) {
					ready = true
					break
				}
			} catch {
				// Agent not ready yet
			}
			await new Promise((r) => setTimeout(r, 2000))
		}

		if (!ready) {
			console.log("   ⚠️  Agent may not be fully ready (health check timed out)")
		} else {
			console.log("   ✓ Agent running")
		}
	},

	async status(instanceId: string): Promise<InstanceStatus> {
		try {
			const output = execFileSync("sprite", ["list"], {
				encoding: "utf-8"
			})
			if (!output.includes(instanceId)) {
				return "stopped"
			}
			// Parse sprite list output to determine state
			// This is heuristic — sprites.list format may vary
			const lines = output.split("\n")
			for (const line of lines) {
				if (line.includes(instanceId)) {
					if (line.includes("sleeping") || line.includes("paused")) {
						return "sleeping"
					}
					if (line.includes("running")) {
						return "running"
					}
					if (line.includes("stopped") || line.includes("terminated")) {
						return "stopped"
					}
					return "running" // assume running if found and no explicit state
				}
			}
			return "unknown"
		} catch {
			return "unknown"
		}
	},

	async sleep(instanceId: string): Promise<void> {
		console.log(`\n💤 Sleeping sprite: ${instanceId}`)
		try {
			execFileSync("sprite", ["sleep", instanceId], { stdio: "inherit" })
			console.log("   ✓ Sprite sleeping")
		} catch (err: any) {
			throw new Error(`Failed to sleep sprite: ${err.stderr || err.message}`)
		}
	},

	async wake(instanceId: string): Promise<void> {
		console.log(`\n☀️  Waking sprite: ${instanceId}`)
		try {
			execFileSync("sprite", ["exec", "-s", instanceId, "--", "echo", "wake"], {
				stdio: "pipe"
			})
			console.log("   ✓ Sprite awake")
		} catch (err: any) {
			throw new Error(`Failed to wake sprite: ${err.stderr || err.message}`)
		}
	},

	async logs(instanceId: string, follow = true): Promise<void> {
		const args = follow
			? ["exec", "-s", instanceId, "--", "tail", "-n", "100", "-f", "/app/agent.log"]
			: ["exec", "-s", instanceId, "--", "cat", "/app/agent.log"]

		// Use execSync so Ctrl+C is handled naturally by the terminal.
		// The sprite child inherits stdio and the signal goes directly to it.
		execFileSync("sprite", args, { stdio: "inherit" })
	},

	async endpoint(instanceId: string): Promise<string> {
		try {
			// Get the actual sprite URL from the CLI (includes the unique hash)
			const output = execFileSync("sprite", ["-s", instanceId, "url"], {
				encoding: "utf-8"
			})
			// Parse "URL: https://xxx.sprites.app" from output
			const match = output.match(/URL:\s+(https:\/\/[^\s]+)/)
			if (match) {
				return match[1].replace(/\/$/, "")
			}
		} catch {
			// Fall back to old format if sprite url fails
		}
		return `https://${instanceId}.sprites.dev`
	},

	async teardown(instanceId: string): Promise<void> {
		console.log(`\n🗑️  Destroying sprite: ${instanceId}`)
		try {
			execFileSync("sprite", ["destroy", "-force", instanceId], { stdio: "inherit" })
			console.log("   ✓ Sprite destroyed")
		} catch (err: any) {
			throw new Error(`Failed to destroy sprite: ${err.stderr || err.message}`)
		}
	},

	async makePublic(instanceId: string): Promise<void> {
		try {
			execFileSync("sprite", ["-s", instanceId, "url", "update", "--auth", "public"], { stdio: "inherit" })
		} catch (err: any) {
			throw new Error(`Failed to make sprite public: ${err.stderr || err.message}`)
		}
	}
}
