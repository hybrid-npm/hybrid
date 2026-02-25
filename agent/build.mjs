import { build } from "esbuild"

await Promise.all([
	build({
		entryPoints: ["src/server/index.ts"],
		outfile: "dist/server/index.cjs",
		bundle: true,
		platform: "node",
		target: "node22",
		format: "cjs",
		external: ["@xmtp/*", "viem", "@anthropic-ai/*", "uint8arrays"]
	}),
	build({
		entryPoints: ["src/sidecar.ts"],
		outfile: "dist/sidecar/index.cjs",
		bundle: true,
		platform: "node",
		target: "node22",
		format: "cjs",
		external: ["@xmtp/*", "viem", "uint8arrays"]
	})
])

console.log("Build complete")
