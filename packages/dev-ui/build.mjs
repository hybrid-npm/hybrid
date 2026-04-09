import { cpSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Root is the package directory (packages/dev-ui)
const packageDir = __dirname
const srcDir = join(packageDir, "src")
const publicDir = join(packageDir, "public")
const distDir = join(packageDir, "dist")
const outputDir = join(distDir, "public")

async function bundle() {
	console.log("\n📦 Building dev UI...\n")

	// Clean and create dist directories
	if (existsSync(distDir)) {
		const { rmSync } = await import("node:fs")
		rmSync(distDir, { recursive: true, force: true })
	}
	mkdirSync(outputDir, { recursive: true })

	// Bundle JSX to JavaScript using esbuild
	await build({
		entryPoints: [join(srcDir, "main.tsx")],
		bundle: true,
		outfile: join(outputDir, "main.js"),
		format: "esm",
		target: "es2020",
		jsx: "automatic",
		jsxImportSource: "react",
		loader: {
			".js": "jsx",
			".jsx": "jsx",
			".ts": "ts",
			".tsx": "tsx"
		},
		resolveExtensions: [".jsx", ".js", ".ts", ".tsx", ".json"],
		sourcemap: false,
		minify: true,
		define: {
			"process.env.NODE_ENV": '"production"',
			"process.env.XMTP_ENV": JSON.stringify(
				process.env.XMTP_ENV || "production"
			)
		},
		plugins: [
			{
				name: "copy-public",
				setup(build) {
					build.onEnd(async (result) => {
						if (result.errors.length > 0) return

						// Copy static assets from public/
						if (existsSync(publicDir)) {
							cpSync(publicDir, outputDir, { recursive: true })
						}

						console.log("✅ Build complete!")
						console.log(`   Output: ${distDir}\n`)
					})
				}
			}
		]
	}).catch((err) => {
		console.error("Build failed:", err)
		process.exit(1)
	})
}

bundle()
