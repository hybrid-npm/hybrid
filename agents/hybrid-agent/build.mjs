import { build } from "esbuild"

await build({
	entryPoints: ["src/server/index.ts"],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: "dist/server/index.js",
	minify: true
})

console.log("Build complete")
