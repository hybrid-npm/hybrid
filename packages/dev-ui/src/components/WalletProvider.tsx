"use client"

import {
	ReactNode,
	createContext,
	useContext,
	useEffect,
	useState
} from "react"
import { http, createPublicClient } from "viem"
import { mainnet } from "viem/chains"

export const publicClient = createPublicClient({
	chain: mainnet,
	transport: http()
})

type WalletState = {
	address: string | null
	isConnected: boolean
	chainId: number | null
}

type WalletContextType = WalletState & {
	connect: () => Promise<void>
	disconnect: () => void
}

const WalletContext = createContext<WalletContextType | null>(null)

export function useWallet() {
	const ctx = useContext(WalletContext)
	if (!ctx) throw new Error("useWallet must be used within WalletProvider")
	return ctx
}

export function WalletProvider({ children }: { children: ReactNode }) {
	const [wallet, setWallet] = useState<WalletState>({
		address: null,
		isConnected: false,
		chainId: null
	})

	const connect = async () => {
		if (typeof window === "undefined") return

		const ethereum = (window as any).ethereum
		if (!ethereum) {
			alert("Please install MetaMask or another Web3 wallet")
			return
		}

		try {
			const accounts = await ethereum.request({ method: "eth_requestAccounts" })
			const chainId = await ethereum.request({ method: "eth_chainId" })

			setWallet({
				address: accounts[0],
				isConnected: true,
				chainId: Number.parseInt(chainId, 16)
			})
		} catch (err) {
			console.error("Failed to connect wallet:", err)
		}
	}

	const disconnect = () => {
		setWallet({
			address: null,
			isConnected: false,
			chainId: null
		})
	}

	useEffect(() => {
		if (typeof window === "undefined") return

		const ethereum = (window as any).ethereum
		if (!ethereum) return

		const handleAccountsChanged = (accounts: string[]) => {
			if (accounts.length === 0) {
				disconnect()
			} else {
				setWallet((prev) => ({ ...prev, address: accounts[0] }))
			}
		}

		const handleChainChanged = () => {
			window.location.reload()
		}

		ethereum.on("accountsChanged", handleAccountsChanged)
		ethereum.on("chainChanged", handleChainChanged)

		ethereum.request({ method: "eth_accounts" }).then((accounts: string[]) => {
			if (accounts.length > 0) {
				ethereum.request({ method: "eth_chainId" }).then((chainId: string) => {
					setWallet({
						address: accounts[0],
						isConnected: true,
						chainId: Number.parseInt(chainId, 16)
					})
				})
			}
		})

		return () => {
			ethereum.removeListener("accountsChanged", handleAccountsChanged)
			ethereum.removeListener("chainChanged", handleChainChanged)
		}
	}, [])

	return (
		<WalletContext.Provider value={{ ...wallet, connect, disconnect }}>
			{children}
		</WalletContext.Provider>
	)
}
