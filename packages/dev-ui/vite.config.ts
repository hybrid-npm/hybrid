import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [react()],
	define: {
		global: "globalThis",
		Buffer: "globalThis.Buffer"
	},
	optimizeDeps: {
		exclude: ["@xmtp/wasm-bindings", "@xmtp/browser-sdk"]
	},
	build: {
		outDir: "dist",
		emptyOutDir: true
	},
	preview: {
		port: 8456,
		strictPort: true
	}
})
