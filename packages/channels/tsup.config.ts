import { defineConfig } from "tsup"

export default defineConfig([
	{
		entry: ["src/index.ts"],
		format: ["cjs", "esm"],
		dts: true,
		splitting: false,
		sourcemap: true,
		clean: true,
		external: ["@xmtp/agent-sdk", "@xmtp/node-sdk", "express", "hono"]
	},
	{
		entry: { "adapters/xmtp/index": "src/adapters/xmtp/index.ts" },
		format: ["cjs", "esm"],
		dts: true,
		splitting: false,
		sourcemap: true,
		external: ["@xmtp/agent-sdk", "@xmtp/node-sdk", "express", "hono"]
	}
])
