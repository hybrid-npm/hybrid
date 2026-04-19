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
// Northflank Provider
//
// Uses the `nf` CLI (or direct API calls) for service management.
// Northflank deploys Docker containers on Firecracker VMs with
// auto-scale-to-zero support.
//
// Sleep/wake: Scale replicas to 0 (sleep) → inbound request triggers auto-scale to 1 (wake)
//             Platform manages the cold start automatically.
// ============================================================================

const CLI = "nf"

function runNf(args: string[]): string {
	return execFileSync(CLI, args, {
		encoding: "utf-8",
		stdio: ["pipe", "pipe", "pipe"]
	})
}

function runNfInherit(args: string[]): void {
	execFileSync(CLI, args, { stdio: "inherit" })
}

export const northflankProvider: DeployProvider = {
	name: "northflank",
	label: "Northflank (Firecracker / Auto-scale)",

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
			const result = runNf(["auth", "whoami"])
			if (!result || result.includes("not logged in")) {
				throw new Error(
					"Not authenticated with Northflank.\n    Run: nf auth login"
				)
			}
		} catch (err: any) {
			if (err.code === "ENOENT") {
				throw new Error(
					"`nf` CLI not found.\n    Install: https://docs.northflank.com/docs/cli\n    Or: npm install -g @northflank/cli"
				)
			}
			throw new Error(
				`Northflank CLI error: ${err.stderr || err.message}\nRun: nf auth login`
			)
		}
	},

	async provision(name: string, opts?: ProvisionOpts): Promise<string> {
		// Northflank provision = create a service via API
		// We use the CLI to check if a service already exists
		const projectId = process.env.NF_PROJECT_ID
		if (!projectId) {
			throw new Error(
				"NF_PROJECT_ID not set.\n    Create a project on Northflank and set: export NF_PROJECT_ID=your-project-id"
			)
		}

		// Check if service already exists
		try {
			const existing = runNf(["services", "list", "--projectId", projectId])
			if (existing.toLowerCase().includes(name)) {
				console.log(`   ✓ Service already exists: ${name}`)
				return name
			}
		} catch {
			// Service doesn't exist, create it
		}

		// Create the service using the Northflank API
		// The nf CLI doesn't support create for all service types, so we use the API
		const apiUrl = process.env.NF_API_URL || "https://api.northflank.com"
		const memory = opts?.memory || 512
		const cpus = opts?.cpus || 1

		console.log(`\n📦 Creating Northflank service: ${name}`)
		console.log(`   Project: ${projectId}`)
		console.log(`   Memory: ${memory}MB, CPUs: ${cpus}`)

		// Build the service spec JSON
		const spec = {
			name: name,
			projectId: projectId,
			type: "service",
			image: {
				image: `registry.northflank.com/${projectId}/${name}:latest`
			},
			resources: {
				instances: 1,
				containerResources: {
					cpu: {
						req: cpus,
						limit: cpus
					},
					memory: {
						req: memory,
						limit: memory
					}
				}
			},
			ports: [
				{
					name: "default",
					protocol: "HTTP",
					containerPort: 8454,
					ingress: {
						autoSubdomain: true
					}
				}
			],
			autoscaling: {
				enabled: true,
				minReplicas: 0,
				maxReplicas: 1
			}
		}

		const specPath = join(tmpdir(), `nf-spec-${Date.now()}.json`)
		const { writeFileSync } = await import("node:fs")
		writeFileSync(specPath, JSON.stringify(spec, null, 2))

		// Use nf deploy or the API to create the service
		try {
			runNfInherit(["deploy", "service", specPath])
		} finally {
			if (existsSync(specPath)) {
				try {
					unlinkSync(specPath)
				} catch {}
			}
		}

		console.log("   ✓ Service created with auto-scale-to-zero enabled")
		return name
	},

	async deploy(instanceId: string, distDir: string): Promise<void> {
		const projectId = process.env.NF_PROJECT_ID
		if (!projectId) {
			throw new Error("NF_PROJECT_ID not set.")
		}

		console.log("\n📦 Building and pushing Docker image...")

		// Build Docker image from dist
		const imageTag = `registry.northflank.com/${projectId}/${instanceId}:latest`

		// Check if docker is available
		runNf(["info"]) // Just to verify CLI works

		// Build the image
		console.log("   Building Docker image...")
		execFileSync("docker", ["build", "-t", imageTag, "."], {
			cwd: distDir,
			stdio: "inherit"
		})

		// Push the image
		console.log("   Pushing to Northflank registry...")
		execFileSync("docker", ["push", imageTag], {
			stdio: "inherit"
		})

		// Deploy/update the service with the new image
		console.log("\n🔧 Deploying service...")
		try {
			runNfInherit([
				"services",
				"set-image",
				"--projectId",
				projectId,
				"--serviceId",
				instanceId,
				"--image",
				imageTag
			])
		} catch (err: any) {
			// Service may already be deploying, ignore
			console.log("   ⚠️  Service update initiated")
		}

		// Wait for deployment to be ready
		console.log("\n⏳ Waiting for deployment to be ready...")
		for (let i = 0; i < 60; i++) {
			try {
				const status = runNf([
					"services",
					"status",
					"--projectId",
					projectId,
					"--serviceId",
					instanceId
				])
				if (
					status.toLowerCase().includes("deployed") ||
					status.toLowerCase().includes("running")
				) {
					console.log("   ✓ Service deployed")
					return
				}
			} catch {
				// Not ready yet
			}
			if (i % 10 === 9) {
				console.log(`   Still deploying... (${i + 1}/60)`)
			}
			await new Promise((r) => setTimeout(r, 5000))
		}

		console.log("   ⚠️  Deployment may still be in progress")
	},

	async status(instanceId: string): Promise<InstanceStatus> {
		const projectId = process.env.NF_PROJECT_ID
		if (!projectId) return "unknown"

		try {
			const status = runNf([
				"services",
				"status",
				"--projectId",
				projectId,
				"--serviceId",
				instanceId
			])

			const lower = status.toLowerCase()
			if (lower.includes("deployed") || lower.includes("running")) {
				return "running"
			}
			if (lower.includes("stopped") || lower.includes("paused")) {
				return "sleeping"
			}
			if (lower.includes("deploying")) {
				return "provisioning"
			}
			return "unknown"
		} catch {
			return "stopped"
		}
	},

	async sleep(instanceId: string): Promise<void> {
		const projectId = process.env.NF_PROJECT_ID
		if (!projectId) {
			throw new Error("NF_PROJECT_ID not set.")
		}

		console.log(`\n💤 Scaling Northflank service to 0: ${instanceId}`)
		try {
			runNfInherit([
				"services",
				"scale",
				"--projectId",
				projectId,
				"--serviceId",
				instanceId,
				"--replicas",
				"0"
			])
			console.log("   ✓ Service scaled to 0 (sleeping)")
		} catch (err: any) {
			throw new Error(`Failed to scale down: ${err.stderr || err.message}`)
		}
	},

	async wake(instanceId: string): Promise<void> {
		const projectId = process.env.NF_PROJECT_ID
		if (!projectId) {
			throw new Error("NF_PROJECT_ID not set.")
		}

		console.log(`\n☀️  Scaling Northflank service to 1: ${instanceId}`)
		try {
			runNfInherit([
				"services",
				"scale",
				"--projectId",
				projectId,
				"--serviceId",
				instanceId,
				"--replicas",
				"1"
			])
			console.log("   ✓ Service scaling up (may take 30-60s)")
		} catch (err: any) {
			throw new Error(`Failed to scale up: ${err.stderr || err.message}`)
		}
	},

	async logs(instanceId: string, follow = true): Promise<void> {
		const projectId = process.env.NF_PROJECT_ID
		if (!projectId) {
			throw new Error("NF_PROJECT_ID not set.")
		}

		const args = [
			"services",
			"logs",
			"--projectId",
			projectId,
			"--serviceId",
			instanceId
		]
		if (follow) args.push("--follow")

		const child = spawn(CLI, args, { stdio: "inherit" })
		return new Promise((resolve, reject) => {
			child.on("exit", (code) => {
				if (code === 0) resolve()
				else reject(new Error(`nf logs exited with code ${code}`))
			})
		})
	},

	async endpoint(instanceId: string): Promise<string> {
		const projectId = process.env.NF_PROJECT_ID
		if (!projectId) return `https://${instanceId}.northflank.app`

		try {
			// Try to get the actual URL from the service info
			const info = runNf([
				"services",
				"info",
				"--projectId",
				projectId,
				"--serviceId",
				instanceId
			])
			// Parse URL from service info
			const match = info.match(/https?:\/\/[^\s]+/i)
			if (match) return match[0]
		} catch {
			// Fallback to predicted URL
		}

		return `https://${instanceId}.${projectId}.northflank.app`
	},

	async teardown(instanceId: string): Promise<void> {
		const projectId = process.env.NF_PROJECT_ID
		if (!projectId) {
			throw new Error("NF_PROJECT_ID not set.")
		}

		console.log(`\n🗑️  Destroying Northflank service: ${instanceId}`)
		try {
			runNfInherit([
				"services",
				"delete",
				"--projectId",
				projectId,
				"--serviceId",
				instanceId,
				"--permanent"
			])
			console.log("   ✓ Service destroyed")
		} catch (err: any) {
			throw new Error(`Failed to destroy service: ${err.stderr || err.message}`)
		}
	}
}
