import { networkInterfaces } from "node:os"

let cachedUrl: string | null = null

export async function getPublicUrl(port = 8454): Promise<string> {
	if (cachedUrl) return cachedUrl

	// Priority order:
	// 1. FLY_PUBLIC_IP env var (set by Fly.io)
	// 2. Fly.io metadata API
	// 3. STUN (public IP detection)
	// 4. Local network IP
	// 5. localhost fallback

	// 1. Fly.io environment variable
	if (process.env.FLY_PUBLIC_IP) {
		cachedUrl = `http://${process.env.FLY_PUBLIC_IP}:${port}`
		return cachedUrl
	}

	// 2. Fly.io metadata API
	try {
		const url = await tryFlyMetadata(port)
		if (url) {
			cachedUrl = url
			return cachedUrl
		}
	} catch {
		// Not on Fly.io, continue
	}

	// 3. STUN for public IP
	try {
		const url = await tryStun(port)
		if (url) {
			cachedUrl = url
			return cachedUrl
		}
	} catch {
		// STUN failed, continue
	}

	// 4. Local network IP
	const localIp = getLocalIp()
	if (localIp) {
		cachedUrl = `http://${localIp}:${port}`
		return cachedUrl
	}

	// 5. Fallback to localhost
	cachedUrl = `http://localhost:${port}`
	return cachedUrl
}

async function tryFlyMetadata(port: number): Promise<string | null> {
	// Fly.io provides metadata at a special internal endpoint
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), 2000)

	try {
		const res = await fetch("http://flyio-local-6pn/_internal/metadata", {
			signal: controller.signal
		})
		clearTimeout(timeout)

		if (!res.ok) return null

		const metadata = (await res.json()) as Record<string, string>
		const publicIp = metadata.FLY_PUBLIC_IP || metadata.public_ip

		if (publicIp) {
			return `http://${publicIp}:${port}`
		}
	} catch {
		clearTimeout(timeout)
	}

	return null
}

async function tryStun(port: number): Promise<string | null> {
	// Use STUN to detect public IP
	// STUN is a standard protocol for NAT traversal
	// Google provides free STUN servers
	const stunServers = [
		"stun:stun.l.google.com:19302",
		"stun:stun1.l.google.com:19302",
		"stun:stun2.l.google.com:19302"
	]

	for (const stunServer of stunServers) {
		try {
			const publicIp = await queryStun(stunServer)
			if (publicIp) {
				return `http://${publicIp}:${port}`
			}
		} catch {
			// Try next server
		}
	}

	return null
}

async function queryStun(stunServer: string): Promise<string | null> {
	return new Promise((resolve, reject) => {
		const { createSocket } = require("node:dgram")
		const socket = createSocket("udp4")

		const timeout = setTimeout(() => {
			socket.close()
			reject(new Error("STUN timeout"))
		}, 3000)

		socket.on("error", (err: Error) => {
			clearTimeout(timeout)
			socket.close()
			reject(err)
		})

		socket.on("message", (msg: Buffer) => {
			clearTimeout(timeout)
			try {
				const publicIp = parseStunResponse(msg)
				socket.close()
				resolve(publicIp)
			} catch (err) {
				socket.close()
				reject(err)
			}
		})

		// Parse STUN server address
		const [host, portStr] = stunServer.replace("stun:", "").split(":")
		const port = Number.parseInt(portStr, 10) || 3478

		// Send STUN binding request
		const stunRequest = createStunRequest()
		socket.send(stunRequest, port, host)
	})
}

function createStunRequest(): Buffer {
	// STUN binding request
	// Message type: 0x0001 (Binding Request)
	// Message length: 0x0000 (no attributes)
	// Transaction ID: 12 random bytes
	const buf = Buffer.alloc(20)
	buf.writeUInt16BE(0x0001, 0) // Message type
	buf.writeUInt16BE(0x0000, 2) // Message length
	// Transaction ID (12 bytes)
	for (let i = 4; i < 20; i++) {
		buf[i] = Math.floor(Math.random() * 256)
	}
	return buf
}

function parseStunResponse(msg: Buffer): string | null {
	// STUN response format:
	// 2 bytes: message type (should be 0x0101 for binding response)
	// 2 bytes: message length
	// 12 bytes: transaction ID
	// 4 bytes: attribute type (should be 0x0020 for XOR-MAPPED-ADDRESS)
	// 2 bytes: attribute length
	// 1 byte: reserved (0x00)
	// 1 byte: address family (0x01 for IPv4)
	// 2 bytes: port
	// 4 bytes: IP address

	if (msg.length < 28) return null

	const messageType = msg.readUInt16BE(0)
	if (messageType !== 0x0101) return null

	// Find XOR-MAPPED-ADDRESS attribute
	let offset = 20
	while (offset < msg.length - 4) {
		const attrType = msg.readUInt16BE(offset)
		const attrLen = msg.readUInt16BE(offset + 2)

		if (attrType === 0x0020) {
			// XOR-MAPPED-ADDRESS
			const family = msg[offset + 4 + 1]
			if (family === 0x01) {
				// IPv4
				const xoredPort = msg.readUInt16BE(offset + 4 + 2)
				const port = xoredPort ^ 0x0001 // XOR with magic cookie

				const xoredIp = msg.slice(offset + 4 + 4, offset + 4 + 8)
				const magicCookie = Buffer.from([0x21, 0x12, 0xa4, 0x42])
				const ip = [
					xoredIp[0] ^ magicCookie[0],
					xoredIp[1] ^ magicCookie[1],
					xoredIp[2] ^ magicCookie[2],
					xoredIp[3] ^ magicCookie[3]
				].join(".")

				return ip
			}
		}

		offset += 4 + attrLen
		// Attributes are padded to 4-byte boundaries
		if (attrLen % 4 !== 0) {
			offset += 4 - (attrLen % 4)
		}
	}

	return null
}

function getLocalIp(): string | null {
	const nets = networkInterfaces()

	for (const name of Object.keys(nets)) {
		const netList = nets[name]
		if (!netList) continue

		for (const net of netList) {
			// Skip internal and non-IPv4 addresses
			if (net.internal || net.family !== "IPv4") continue

			// Prefer 192.168.x.x or 10.x.x.x ranges
			if (net.address.startsWith("192.168.") || net.address.startsWith("10.")) {
				return net.address
			}
		}
	}

	// Return any non-internal IPv4 address
	for (const name of Object.keys(nets)) {
		const netList = nets[name]
		if (!netList) continue

		for (const net of netList) {
			if (!net.internal && net.family === "IPv4") {
				return net.address
			}
		}
	}

	return null
}

export function clearCachedUrl(): void {
	cachedUrl = null
}
