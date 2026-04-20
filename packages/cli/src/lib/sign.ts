import {
	generatePrivateKey,
	privateKeyToAccount,
} from "viem/accounts"
import { recoverMessageAddress } from "viem"
import { toBytes } from "viem/utils"

export type EthKeyPair = {
	privateKey: string // 0x-prefixed hex
	address: string // checksummed address
}

/**
 * Generate a new random Ethereum keypair.
 */
export function generateEthKeypair(): EthKeyPair {
	const pk = generatePrivateKey()
	const account = privateKeyToAccount(pk)
	return { privateKey: pk, address: account.address }
}

/**
 * Sign a raw message body using personal_sign style.
 * Returns signature hex with 0x prefix.
 */
export async function signRequestBody(
	body: string,
	privateKey: string,
): Promise<string> {
	const account = privateKeyToAccount(privateKey as `0x${string}`)
	return await account.signMessage({ message: { raw: toBytes(body) } })
}

/**
 * Recover the signer address from a signed message + signature.
 * Returns checksummed address, or null on failure.
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
