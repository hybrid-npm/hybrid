const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/

export function isValidWalletAddress(address: string): boolean {
	return WALLET_REGEX.test(address)
}

export function normalizeWalletAddress(address: string): string {
	return address.toLowerCase()
}

export function validateWalletAddress(address: string): string {
	if (!isValidWalletAddress(address)) {
		throw new Error(
			`Invalid wallet address: ${address}. Must be 0x followed by 40 hex characters.`
		)
	}
	return normalizeWalletAddress(address)
}
