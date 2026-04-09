import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join } from "node:path"

// __dirname is automatically provided by Node.js in CJS
const port = process.env.DEV_UI_PORT || 8456
const publicDir = join(__dirname, "public")

const mimeTypes: Record<string, string> = {
	".html": "text/html",
	".js": "text/javascript",
	".css": "text/css",
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon"
}

const server = createServer(async (req, res) => {
	const filePath = join(publicDir, req.url === "/" ? "index.html" : req.url)

	try {
		const ext = extname(filePath)
		const contentType = mimeTypes[ext] ?? "application/octet-stream"
		const content = await readFile(filePath)
		res.writeHead(200, { "Content-Type": contentType })
		res.end(content)
	} catch (err: any) {
		if (err.code === "ENOENT") {
			// SPA fallback - serve index.html for any route
			try {
				const indexHtml = await readFile(join(publicDir, "index.html"))
				res.writeHead(200, { "Content-Type": "text/html" })
				res.end(indexHtml)
			} catch {
				res.writeHead(404)
				res.end("Not found")
			}
		} else {
			res.writeHead(500)
			res.end("Server error")
		}
	}
})

server.listen(port, () => {
	console.log(`\n🚀 Dev Chat UI running at http://localhost:${port}\n`)
})
