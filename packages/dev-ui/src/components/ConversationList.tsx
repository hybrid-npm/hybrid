"use client"

import { useEffect, useState } from "react"
import { useXmtp } from "../hooks/useXmtp"

export function ConversationList({
	onSelectConversation
}: {
	onSelectConversation: (id: string) => void
}) {
	const { conversations, loading, error, client } = useXmtp()
	const [agentWallet, setAgentWallet] = useState<string>("")

	useEffect(() => {
		// Fetch agent config from server (wallet address derived server-side from AGENT_WALLET_KEY)
		// Private key never leaves the server
		fetch("http://localhost:8454/api/config")
			.then((res) => res.json())
			.then((data) => {
				if (data.walletAddress) {
					setAgentWallet(data.walletAddress)
				}
				if (data.xmtpEnv) {
					;(window as any).XMTP_ENV = data.xmtpEnv
				}
			})
			.catch((err) => {
				console.error("Failed to fetch agent config:", err)
				// Fallback to window variable (for production build)
				const wallet = (window as any).AGENT_WALLET_ADDRESS
				if (wallet) {
					setAgentWallet(wallet)
				}
			})
	}, [])

	const startChatWithAgent = async () => {
		if (!client) return
		if (!agentWallet) {
			alert("Agent wallet not configured. Set AGENT_WALLET_KEY in .env")
			return
		}
		try {
			const conv = await client.conversations.createDmWithIdentifier({
				identifier: agentWallet,
				identifierKind: 0 // Ethereum
			})
			onSelectConversation(conv.id)
		} catch (err) {
			console.error("Failed to start chat:", err)
			alert(`Failed to start chat: ${err}`)
		}
	}

	if (!client) {
		return <div className="p-4 text-gray-500">Connect XMTP first</div>
	}

	if (loading) {
		return <div className="p-4 text-gray-500">Loading conversations...</div>
	}

	if (error) {
		return <div className="p-4 text-red-500">Error: {error}</div>
	}

	return (
		<div className="conversation-list flex flex-col h-full">
			<div className="p-2 border-b bg-gray-50">
				<button
					type="button"
					onClick={startChatWithAgent}
					className="w-full py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
				>
					Chat with Agent
				</button>
			</div>

			{conversations.length === 0 ? (
				<div className="p-4 text-gray-500 text-center">
					<p className="text-sm">Click above to start chatting!</p>
				</div>
			) : (
				<div className="flex-1 overflow-y-auto">
					{conversations.map((conv) => (
						<button
							type="button"
							key={conv.id}
							onClick={() => onSelectConversation(conv.id)}
							className="w-full text-left p-4 hover:bg-gray-100 border-b transition-colors"
						>
							<div className="font-medium text-gray-900 truncate">
								{String(conv.id).slice(0, 12)}...{String(conv.id).slice(-8)}
							</div>
							<div className="text-sm text-gray-500 truncate mt-1">
								{String(conv.topic) || "Direct message"}
							</div>
						</button>
					))}
				</div>
			)}
		</div>
	)
}
