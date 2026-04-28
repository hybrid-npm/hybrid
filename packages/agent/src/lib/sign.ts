/**
 * Key-based request signing for authenticated agent requests.
 *
 * Uses viem to sign request bodies with a wallet private key and recover
 * the signer address for server-side authentication.
 *
 * Both sides use the EIP-191 prefixed message hash (`hashMessage`) so
 * signatures are compatible with standard web3 wallets (MetaMask, etc.).
 */
import {
	hashMessage,
	recoverMessageAddress,
	serializeSignature,
	type Signature
} from "viem"
import { sign } from "viem/accounts"

/**
 * Sign a request body with the given private key.
 * Returns an Ethereum-style hex signature (r || s || v).
 */
export async function signRequestBody(
	body: string,
	privateKey: `0x${string}`
): Promise<string> {
	// hashMessage prepends "\x19Ethereum Signed Message:\n" + length.
	const hash = hashMessage(body)
	const sig = await sign({ hash, privateKey })
	return serializeSignature(sig as Signature)
}

/**
 * Recover the wallet address that signed a request body.
 * Returns the 0x-prefixed address or null on any failure.
 */
export async function recoverRequestSigner(
	body: string,
	signatureHex: string
): Promise<`0x${string}` | null> {
	try {
		return await recoverMessageAddress({
			message: body,
			signature: signatureHex as `0x${string}`
		})
	} catch {
		return null
	}
}
