import { build } from "esbuild"

await build({
	entryPoints: ["src/server/dev.ts", "src/gateway/dev.ts"],
	bundle: true,
	platform: "node",
	format: "esm",
	outdir: "dist/server",
	packages: "external",
	sourcemap: true,
	banner: {
		js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
	}
})

console.log("Build complete: dist/server/index.js")
