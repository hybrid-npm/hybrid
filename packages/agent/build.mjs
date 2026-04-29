import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as esbuild from "esbuild"

const __dirname = dirname(fileURLToPath(import.meta.url))
const outdir = join(__dirname, "dist")

mkdirSync(outdir, { recursive: true })
mkdirSync(join(outdir, "server"), { recursive: true })

async function build() {
	await esbuild.build({
		entryPoints: [join(__dirname, "src/index.ts")],
		bundle: true,
		platform: "node",
		target: "node20",
		outfile: join(outdir, "index.cjs"),
		format: "cjs",
		external: ["viem", "hono", "@hono/node-server"]
	})

	await esbuild.build({
		entryPoints: [join(__dirname, "src/server/simple.ts")],
		bundle: true,
		platform: "node",
		target: "node20",
		outfile: join(outdir, "server/simple.cjs"),
		format: "cjs",
		external: ["viem", "hono", "@hono/node-server"]
	})

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
			"sql.js",
			"@mariozechner/pi-coding-agent",
			"@mariozechner/pi-ai",
			"@mariozechner/pi-agent-core",
			"@mariozechner/pi-tui",
			"@sinclair/typebox",
		]
	})

	console.log("Built agent to dist/")
}

build()
