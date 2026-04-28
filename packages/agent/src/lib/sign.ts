/**
 * Key-based request signing for authenticated agent requests.
 *
 * Uses ECDSA (secp256k1) signatures to sign request bodies.
 * The agent server can recover the signer address from the signature
 * to verify request authenticity and set the authenticated user ID.
 */

import * as sha3 from "js-sha3"
import * as secp from "@noble/secp256k1"

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

	// v3: sign with format "recovered" returns 65-byte Uint8Array: r(32) || s(32) || recovery(1)
	const sig = secp.sign(messageHash, privateKeyBytes, {
		prehash: false,
		format: "recovered"
	}) as Uint8Array

	const v = sig[64] + 27 // Ethereum encoding: recovery 0->27, 1->28
	return hexEncode(sig).slice(0, 128) + v.toString(16).padStart(2, "0")
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

		// V is the last byte (27 or 28 for Ethereum encoding)
		const v = sig[64]
		if (v !== 27 && v !== 28) {
			return null
		}

		// v3: recoverPublicKey(signature, message, opts) — signature first
		const publicKey = secp.recoverPublicKey(sig, messageHash, {
			prehash: false,
		})

		// publicKey is a Uint8Array (compressed 33-byte format)
		const pubKeyBytes = typeof publicKey === "string"
			? hexDecode(publicKey)
			: (publicKey as Uint8Array)

		// Uncompress to compute Ethereum address
		// Signature.fromCompact + withRecoveryBit pattern in v3 uses toRawBytes
		// For eth address: keccak256 of uncompressed pub key (65 bytes), take last 20
		// Compressed key is 33 bytes starting with 02 or 03
		// We need to decompress: use the elliptic point decompression
		// Actually, simplest way: use the verify approach
		// The recoverPublicKey already returns the correct pubkey

		// For Ethereum address we need the uncompressed (65-byte) pubkey
		// The v3 API doesn't expose pointToBytes easily, but we can get it
		// from the verify/recover mechanism. Let's try a different approach.

		// Use secp256k1 point decompression
		const hash = hexDecode(keccak256Hex(decoder.decompress(pubKeyBytes)))
		const addressBytes = hash.slice(-20)

		return `0x${hexEncode(addressBytes)}`
	} catch {
		return null
	}
}

// Minimal secp256k1 point decompression
// Compressed: 0x02 (even y) or 0x03 (odd y) + x coordinate (32 bytes)
// Uncompressed: 0x04 + x + y
const decoder = {
	decompress(compressed: Uint8Array): Uint8Array {
		if (compressed.length !== 33) return compressed // already uncompressed
		const x = decodeBig(compressed.slice(1, 33))
		const prefix = compressed[0]
		const yIsOdd = prefix === 0x03
		const y = getYForX(x, yIsOdd)
		const result = new Uint8Array(65)
		result[0] = 0x04
		encodeBig(x, result, 1)
		encodeBig(y, result, 33)
		return result
	}
}

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn
const B = 0x0000000000000000000000000000000000000000000000000000000000000007n

function decodeBig(buf: Uint8Array): bigint {
	return BigInt(`0x${Buffer.from(buf).toString("hex")}`)
}

function encodeBig(n: bigint, buf: Uint8Array, offset: number) {
	const hex = n.toString(16).padStart(64, "0")
	const bytes = Buffer.from(hex, "hex")
	buf.set(bytes, offset)
}

function mod(a: bigint, m: bigint): bigint {
	return ((a % m) + m) % m
}

function sqrtMod(n: bigint, p: bigint): bigint {
	// Tonelli-Shanks for p = 3 mod 4
	return mod(n ** ((p + 1n) / 4n), p)
}

function getYForX(x: bigint, yIsOdd: boolean): bigint {
	const y2 = mod(x ** 3n + B, P)
	let y = sqrtMod(y2, P)
	if ((y % 2n === 1n) !== yIsOdd) {
		y = P - y
	}
	return y
}
