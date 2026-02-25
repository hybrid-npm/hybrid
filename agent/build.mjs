import { build } from "esbuild"

await Promise.all([
	build({
		entryPoints: ["src/server/simple.ts"],
		outfile: "dist/server/index.cjs",
		bundle: true,
		platform: "node",
		target: "node22",
		format: "cjs",
		external: ["@xmtp/*", "viem", "@anthropic-ai/*"]
	}),
	build({
		entryPoints: ["src/sidecar.ts"],
		outfile: "dist/sidecar/index.cjs",
		bundle: true,
		platform: "node",
		target: "node22",
		format: "cjs",
		external: ["@xmtp/*", "viem"]
	})
])

console.log("Build complete")
