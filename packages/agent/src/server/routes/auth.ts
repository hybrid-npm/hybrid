import { getRole, parseACL } from "@hybrid/memory"
import type { Context } from "hono"

const PROJECT_ROOT = process.env.AGENT_PROJECT_ROOT || process.cwd()

interface AuthVerifyRequest {
	token?: string
	fid?: string
}

interface AuthVerifyResponse {
	fid: string
	role: "owner" | "guest"
	authenticated: boolean
}

export async function handleAuthVerify(c: Context) {
	try {
		const body = await c.req.json<AuthVerifyRequest>()
		const { token, fid: directFid } = body

		let fid: string | null = null

		// Support direct FID authentication (from MiniKit context)
		// This is less secure but useful for development/testing
		if (directFid) {
			fid = directFid
		} else if (token) {
			// Verify JWT with Farcaster Quick Auth
			// The JWT is signed by Farcaster's Quick Auth server
			const payload = await verifyQuickAuthToken(token)

			if (!payload) {
				return c.json({ error: "Invalid token" }, 401)
			}

			fid = payload.sub
		}

		if (!fid) {
			return c.json({ error: "Token or FID required" }, 400)
		}

		// Check ACL to determine role
		const acl = parseACL(PROJECT_ROOT)
		const role = getRole(acl, fid)

		const response: AuthVerifyResponse = {
			fid,
			role,
			authenticated: true
		}

		return c.json(response)
	} catch (error) {
		console.error("[auth] Error verifying token:", error)
		return c.json({ error: "Authentication failed" }, 500)
	}
}

interface QuickAuthPayload {
	iss: string
	sub: string
	aud: string
	iat: number
	exp: number
}

async function verifyQuickAuthToken(
	token: string
): Promise<QuickAuthPayload | null> {
	// Verify JWT with Farcaster Quick Auth
	// https://docs.base.org/mini-apps/features/authentication

	try {
		// Decode JWT header to get the key ID
		const [headerB64] = token.split(".")
		const header = JSON.parse(
			Buffer.from(headerB64, "base64url").toString("utf-8")
		)

		// Fetch JWK set from Farcaster
		const jwksRes = await fetch(
			"https://auth.farcaster.xyz/.well-known/jwks.json"
		)
		const jwks = (await jwksRes.json()) as {
			keys: { kid: string; kty: string; n: string; e: string; alg?: string }[]
		}

		// Find the key matching the kid in the header
		const jwk = jwks.keys.find((k: { kid: string }) => k.kid === header.kid)
		if (!jwk) {
			console.error("[auth] No matching JWK found")
			return null
		}

		// Import the public key
		const publicKey = await crypto.subtle.importKey(
			"jwk",
			jwk,
			{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
			false,
			["verify"]
		)

		// Split token into parts
		const [headerB642, payloadB64, signatureB64] = token.split(".")
		const signature = Buffer.from(signatureB64, "base64url")
		const data = new TextEncoder().encode(`${headerB642}.${payloadB64}`)

		// Verify signature
		const isValid = await crypto.subtle.verify(
			{ name: "RSASSA-PKCS1-v1_5" },
			publicKey,
			signature,
			data
		)

		if (!isValid) {
			console.error("[auth] Invalid signature")
			return null
		}

		// Decode payload
		const payload = JSON.parse(
			Buffer.from(payloadB64, "base64url").toString("utf-8")
		) as QuickAuthPayload

		// Check expiration
		if (payload.exp * 1000 < Date.now()) {
			console.error("[auth] Token expired")
			return null
		}

		// Return the FID as string
		return {
			...payload,
			sub: String(payload.sub)
		}
	} catch (error) {
		console.error("[auth] Token verification failed:", error)
		return null
	}
}

export function isOwner(fid: string): boolean {
	const acl = parseACL(PROJECT_ROOT)
	const role = getRole(acl, fid)
	return role === "owner"
}
