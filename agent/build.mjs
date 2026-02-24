import { build } from "esbuild"

await Promise.all([
	build({
		entryPoints: ["src/server/index.ts"],
		outfile: "dist/server/index.js",
		bundle: true,
		platform: "node",
		target: "node22",
		format: "esm",
		banner: {
			js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
		},
		external: ["@xmtp/*", "viem", "@anthropic-ai/*", "uint8arrays"]
	}),
	build({
		entryPoints: ["src/sidecar.ts"],
		outfile: "dist/sidecar/index.js",
		bundle: true,
		platform: "node",
		target: "node22",
		format: "esm",
		banner: {
			js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
		},
		external: ["@xmtp/*", "viem", "uint8arrays"]
	})
])

console.log("Build complete")
