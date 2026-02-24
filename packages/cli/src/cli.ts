#!/usr/bin/env node

const nodeVersion = process.versions.node
const [major] = nodeVersion.split(".").map(Number)
if (!major || major < 20) {
	console.error("Error: Node.js version 20 or higher is required")
	process.exit(1)
}

async function main() {
	const args = process.argv.slice(2)
	const command = args[0]

	if (command === "dev") {
		return dev(args.includes("--docker"))
	}

	if (command === "deploy") {
		return deploy()
	}

	console.log("Usage: hybrid <command>")
	console.log("")
	console.log("Commands:")
	console.log("  dev          Start development server")
	console.log("  dev --docker Start development server with Docker")
	console.log("  deploy       Deploy agent to Cloudflare Workers")
	console.log("")
	console.log("Environment Variables:")
	console.log("  CLOUDFLARE_API_TOKEN    Required for deploy")
	console.log("")

	if (command) {
		process.exit(1)
	}
}

async function dev(useDocker: boolean) {
	const { spawn } = await import("node:child_process")
	const { resolve, dirname } = await import("node:path")
	const { fileURLToPath } = await import("node:url")

	const __dirname = dirname(fileURLToPath(import.meta.url))
	const agentDir = resolve(__dirname, "../../../agent")

	await new Promise((resolve, reject) => {
		const build = spawn("pnpm", ["run", "build"], {
			cwd: agentDir,
			stdio: "inherit"
		})
		build.on("close", (code) => {
			if (code === 0) resolve(undefined)
			else reject(new Error(`Build failed with code ${code}`))
		})
	})

	if (useDocker) {
		console.log("\n🐳 Starting with Docker...\n")
		await new Promise(() => {
			spawn(
				"concurrently",
				[
					"-n",
					"container,xmtp",
					"-c",
					"blue,green",
					"docker build -t hybrid-agent . && docker run -p 3000:3000 -p 4100:4100 hybrid-agent",
					"pnpm run dev:sidecar"
				],
				{ cwd: agentDir, stdio: "inherit", shell: true }
			)
		})
	} else {
		await new Promise(() => {
			spawn(
				"concurrently",
				[
					"-n",
					"gateway,xmtp",
					"-c",
					"blue,green",
					"pnpm run dev:gateway",
					"pnpm run dev:sidecar"
				],
				{ cwd: agentDir, stdio: "inherit", shell: true }
			)
		})
	}
}

async function deploy() {
	const { spawn } = await import("node:child_process")
	const { resolve, dirname } = await import("node:path")
	const { fileURLToPath } = await import("node:url")
	const { existsSync } = await import("node:fs")

	const apiToken = process.env.CLOUDFLARE_API_TOKEN
	if (!apiToken) {
		console.error("Error: CLOUDFLARE_API_TOKEN is required")
		console.error("Usage: CLOUDFLARE_API_TOKEN=xxx hybrid deploy")
		process.exit(1)
	}

	const __dirname = dirname(fileURLToPath(import.meta.url))
	const agentDir = resolve(__dirname, "../../../agent")

	if (!existsSync(agentDir)) {
		console.error(`Error: agent directory not found at ${agentDir}`)
		process.exit(1)
	}

	console.log("Building agent...")
	await new Promise((resolve, reject) => {
		const build = spawn("pnpm", ["run", "build"], {
			cwd: agentDir,
			stdio: "inherit"
		})
		build.on("close", (code) => {
			if (code === 0) resolve(undefined)
			else reject(new Error(`Build failed with code ${code}`))
		})
	})

	console.log("Deploying to Cloudflare...")
	await new Promise((resolve, reject) => {
		const deploy = spawn("npx", ["wrangler", "deploy"], {
			cwd: agentDir,
			stdio: "inherit",
			env: { ...process.env, CLOUDFLARE_API_TOKEN: apiToken }
		})
		deploy.on("close", (code) => {
			if (code === 0) resolve(undefined)
			else reject(new Error(`Deploy failed with code ${code}`))
		})
	})

	console.log("Deploy complete!")
}

main().catch((error) => {
	console.error("CLI error:", error)
	process.exit(1)
})
