import { defineConfig } from "tsup"

export default defineConfig({
	entry: {
		index: "src/index.ts",
		behaviors: "src/behaviors/index.ts",
		tools: "src/tools/index.ts",
		scheduler: "src/scheduler.ts",
		types: "src/types.ts"
	},
	format: ["cjs", "esm"],
	dts: true,
	splitting: false,
	sourcemap: true,
	clean: true,
	outDir: "dist",
	target: "es2020"
})
