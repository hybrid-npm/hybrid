import { mkdir, rm } from "node:fs/promises"
import { build } from "esbuild"

await rm("dist", { recursive: true, force: true })
await mkdir("dist/server", { recursive: true })
await mkdir("dist/sidecar", { recursive: true })

await build({
	entryPoints: ["src/server/index.ts"],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: "dist/server/index.js",
	external: ["dotenv"],
	minify: false
})

await build({
	entryPoints: ["src/sidecar.ts"],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: "dist/sidecar/index.js",
	external: ["dotenv"],
	minify: false
})

console.log("Build complete")
