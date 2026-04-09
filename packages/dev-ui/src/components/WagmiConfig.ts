import { mainnet, sepolia } from "viem/chains"
import { http, createConfig } from "wagmi"

export const wagmiConfig = createConfig({
	chains: [mainnet, sepolia],
	transports: {
		[mainnet.id]: http(),
		[sepolia.id]: http()
	}
})
