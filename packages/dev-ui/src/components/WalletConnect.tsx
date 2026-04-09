"use client"

import { useWallet } from "./WalletProvider"

export function WalletConnect() {
	const { address, isConnected, connect, disconnect } = useWallet()

	if (isConnected) {
		return (
			<div className="wallet-connect p-4 border-b flex justify-between items-center">
				<p className="text-sm text-gray-600">
					Connected: {address?.slice(0, 10)}...{address?.slice(-8)}
				</p>
				<button
					type="button"
					onClick={disconnect}
					className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
				>
					Disconnect
				</button>
			</div>
		)
	}

	return (
		<div className="wallet-connect p-4 border-b">
			<button
				type="button"
				onClick={connect}
				className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
			>
				Connect Wallet
			</button>
		</div>
	)
}
