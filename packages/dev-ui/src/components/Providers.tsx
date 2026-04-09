"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactNode, useState } from "react"
import { WalletProvider } from "./WalletProvider"

export function Providers({ children }: { children: ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 1000 * 60 * 5,
						retry: 1
					}
				}
			})
	)

	return (
		<WalletProvider>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</WalletProvider>
	)
}
