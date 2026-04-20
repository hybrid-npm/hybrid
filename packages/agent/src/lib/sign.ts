import {
	generatePrivateKey,
	privateKeyToAccount,
} from "viem/accounts"
import { recoverMessageAddress } from "viem"
import { toBytes } from "viem/utils"

export type EthKeyPair = {
	privateKey: string // 0x-prefixed hex
	address: string // 0x-prefixed checksummed address
}

/**
 * Generate a new random Ethereum private key.
 */
export function generateEthKeypair(): EthKeyPair {
	const pk = generatePrivateKey()
	const account = privateKeyToAccount(pk)
	return {
		privateKey: pk,
		address: account.address,
	}
}

/**
 * Sign a raw message body as raw bytes (personal_sign style).
 * Returns the raw signature hex (with 0x prefix).
 */
export async function signRequestBody(
	body: string,
	privateKey: string,
): Promise<string> {
	const account = privateKeyToAccount(privateKey as `0x${string}`)
	return await account.signMessage({ message: { raw: toBytes(body) } })
}

/**
 * Recover the Ethereum address from a signed request body + signature.
 * Returns the checksummed address, or null if recovery fails.
 */
export async function recoverRequestSigner(
	body: string,
	signature: string,
): Promise<string | null> {
	try {
		return await recoverMessageAddress({
			message: { raw: toBytes(body) },
			signature: signature as `0x${string}`,
		})
	} catch {
		return null
	}
}
