/**
 * Key-based request signing for authenticated agent requests.
 *
 * Uses ECDSA (secp256k1) signatures to sign request bodies.
 * The agent server can recover the signer address from the signature
 * to verify request authenticity and set the authenticated user ID.
 */

import * as sha3 from "js-sha3"
import { sign, recoverPublicKey } from "@noble/secp256k1"

const keccak256Hex = (input: Uint8Array): string => sha3.keccak_256(input)

function hexEncode(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("hex")
}

function hexDecode(hex: string): Uint8Array {
	return new Uint8Array(Buffer.from(hex, "hex"))
}

export async function signRequestBody(
	body: string,
	privateKeyHex: string
): Promise<string> {
	const messageHash = hexDecode(keccak256Hex(new TextEncoder().encode(body)))
	const privateKeyBytes = hexDecode(privateKeyHex)

	const derSignature = sign(messageHash, privateKeyBytes, {
		prehash: false,
		format: "compact",
	}) as unknown as Uint8Array

	const v = derSignature[64]
	return hexEncode(derSignature.slice(0, 64)) + (v + 27).toString(16).padStart(2, "0")
}

export async function recoverRequestSigner(
	body: string,
	signatureHex: string
): Promise<string | null> {
	try {
		const messageHash = hexDecode(keccak256Hex(new TextEncoder().encode(body)))
		const sig = hexDecode(signatureHex)

		if (sig.length !== 65) {
			return null
		}

		const v = sig[64]
		if (v !== 27 && v !== 28) {
			return null
		}

		const canonical = new Uint8Array(sig)
		canonical[64] = v - 27

		const publicKey = recoverPublicKey(messageHash, canonical, { prehash: false })
		const pubKeyBytes = typeof publicKey === "string" ? hexDecode(publicKey) : (publicKey as Uint8Array)

		const hash = hexDecode(keccak256Hex(pubKeyBytes.slice(1)))
		const addressBytes = hash.slice(-20)

		return `0x${hexEncode(addressBytes)}`
	} catch {
		return null
	}
}
