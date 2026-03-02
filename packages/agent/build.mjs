import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as esbuild from "esbuild"

const __dirname = dirname(fileURLToPath(import.meta.url))
const outdir = join(__dirname, "dist")

mkdirSync(outdir, { recursive: true })
mkdirSync(join(outdir, "server"), { recursive: true })

async function build() {
	// Build main index.ts (exports createServer)
	await esbuild.build({
		entryPoints: [join(__dirname, "src/index.ts")],
		bundle: true,
		platform: "node",
		target: "node20",
		outfile: join(outdir, "index.cjs"),
		format: "cjs",
		external: ["viem", "hono", "@hono/node-server"]
	})

	// Build server/simple.ts (default server for backward compat)
	await esbuild.build({
		entryPoints: [join(__dirname, "src/server/simple.ts")],
		bundle: true,
		platform: "node",
		target: "node20",
		outfile: join(outdir, "server/simple.cjs"),
		format: "cjs",
		external: ["viem", "hono", "@hono/node-server"]
	})

	// Build server/index.ts
	await esbuild.build({
		entryPoints: [join(__dirname, "src/server/index.ts")],
		bundle: true,
		platform: "node",
		target: "node20",
		outfile: join(outdir, "server/index.cjs"),
		format: "cjs",
		external: [
			"viem",
			"hono",
			"@hono/node-server",
			"@anthropic-ai/claude-agent-sdk",
			"@xmtp/node-sdk",
			"@xmtp/agent-sdk",
			"sql.js"
		]
	})

	// Build xmtp.ts
	await esbuild.build({
		entryPoints: [join(__dirname, "src/xmtp.ts")],
		bundle: true,
		platform: "node",
		target: "node20",
		outfile: join(outdir, "xmtp.cjs"),
		format: "cjs",
		external: [
			"viem",
			"@xmtp/agent-sdk",
			"@xmtp/node-sdk",
			"@xmtp/node-bindings"
		]
	})

	console.log("Built agent to dist/")
}

build()
