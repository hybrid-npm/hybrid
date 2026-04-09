import { existsSync, readFileSync, statSync } from "node:fs"
import { extname, resolve } from "node:path"
import type { MiddlewareHandler } from "hono"
import { privateKeyToAccount } from "viem/accounts"
import { getWalletKey, hasSecret, loadSecrets } from "../lib/secret-store.js"

const MINI_APP_DIR =
	process.env.MINI_APP_DIR || resolve(process.cwd(), "server", "dist")

function getWalletAddress(): string | null {
	loadSecrets()
	if (hasSecret("AGENT_WALLET_KEY")) {
		try {
			const key = getWalletKey()
			const account = privateKeyToAccount(
				key.startsWith("0x")
					? (key as `0x${string}`)
					: (`0x${key}` as `0x${string}`)
			)
			return account.address
		} catch {
			return null
		}
	}
	const key = process.env.AGENT_WALLET_KEY
	if (!key) return null
	try {
		const account = privateKeyToAccount(
			key.startsWith("0x")
				? (key as `0x${string}`)
				: (`0x${key}` as `0x${string}`)
		)
		return account.address
	} catch {
		return null
	}
}

const MIME_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".eot": "application/vnd.ms-fontobject",
	".webmanifest": "application/manifest+json"
}

export const serveMiniApp: MiddlewareHandler = async (c, next) => {
	const path = c.req.path

	// Only handle /mini/* paths
	if (!path.startsWith("/mini")) {
		return next()
	}

	// Remove /mini prefix to get the file path
	let filePath = path.slice(5) || "/"

	// Default to index.html for root or directories
	if (filePath === "/" || filePath === "") {
		filePath = "/index.html"
	}

	// Try to serve the file
	const fullPath = resolve(MINI_APP_DIR, filePath.slice(1))

	// Security: prevent directory traversal
	if (!fullPath.startsWith(resolve(MINI_APP_DIR))) {
		return c.text("Forbidden", 403)
	}

	if (existsSync(fullPath) && statSync(fullPath).isFile()) {
		const ext = extname(fullPath)
		const contentType = MIME_TYPES[ext] || "application/octet-stream"

		let content = readFileSync(fullPath)

		// Inject agent wallet address and XMTP env into HTML (server-side rendered)
		// Private key never leaves the server - only the address is exposed
		if (ext === ".html") {
			const walletAddress = getWalletAddress()
			const xmtpEnv = process.env.XMTP_ENV || "production"
			if (walletAddress) {
				const html = content.toString("utf-8")
				const injected = html.replace(
					"</body>",
					`<script>
window.AGENT_WALLET_ADDRESS = "${walletAddress}";
window.XMTP_ENV = "${xmtpEnv}";
</script></body>`
				)
				content = Buffer.from(injected)
			}
		}

		return new Response(content, {
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "public, max-age=3600"
			}
		})
	}

	// For SPA routing, serve index.html for non-file paths
	const indexPath = resolve(MINI_APP_DIR, "index.html")
	if (existsSync(indexPath)) {
		const content = readFileSync(indexPath)
		return new Response(content, {
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "public, max-age=0"
			}
		})
	}

	return c.text("Mini app not found", 404)
}

export function getMiniAppUrl(baseUrl: string, path = "/mini/skills"): string {
	return `${baseUrl}${path}`
}
