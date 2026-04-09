"use client"

import {
	Client,
	type Conversation,
	type DecodedMessage,
	IdentifierKind,
	type Signer
} from "@xmtp/browser-sdk"
import { useEffect, useRef, useState } from "react"
import { useWallet } from "../components/WalletProvider"

export function useXmtp(): {
	client: Client | null
	conversations: Conversation[]
	messages: Record<string, DecodedMessage[]>
	loading: boolean
	error: string | null
	sendMessage: (conversationId: string, content: string) => Promise<void>
	refreshConversations: () => Promise<void>
	connectXmtp: () => Promise<void>
} {
	const { address, isConnected } = useWallet()

	const [client, setClient] = useState<Client | null>(null)
	const [conversations, setConversations] = useState<Conversation[]>([])
	const [messages, setMessages] = useState<Record<string, DecodedMessage[]>>({})
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const autoConnected = useRef(false)

	// Auto-connect on mount if wallet already connected
	useEffect(() => {
		if (address && isConnected && !client && !autoConnected.current) {
			autoConnected.current = true
			connectXmtp()
		}
	}, [address, isConnected])

	const connectXmtp = async () => {
		if (!address) {
			setError("Please connect your wallet first")
			return
		}

		setLoading(true)
		setError(null)

		try {
			const ethereum = (window as any).ethereum
			if (!ethereum) {
				throw new Error("No Ethereum provider found")
			}

			const xmtpEnv =
				(typeof window !== "undefined" && (window as any).XMTP_ENV) ||
				"production"

			const signer: Signer = {
				type: "EOA",
				getIdentifier: () => ({
					identifier: address,
					identifierKind: IdentifierKind.Ethereum
				}),
				signMessage: async (message: string): Promise<Uint8Array> => {
					const sig = await ethereum.request({
						method: "personal_sign",
						params: [message, address]
					})
					const hex = sig.startsWith("0x") ? sig.slice(2) : sig
					const bytes = new Uint8Array(hex.length / 2)
					for (let i = 0; i < bytes.length; i++) {
						bytes[i] = Number.parseInt(hex.substr(i * 2, 2), 16)
					}
					return bytes
				}
			}

			const xmtpClient = await Client.create(signer, {
				env: xmtpEnv as "dev" | "production"
			})

			console.log("XMTP Client created, setting state...")
			setClient(xmtpClient)
			setLoading(false)
			console.log("XMTP Client state set, loading conversations...")

			try {
				await refreshConversationsImpl(xmtpClient)
			} catch (convErr) {
				console.error("Failed to load conversations:", convErr)
			}
		} catch (err: any) {
			setError(err.message || "Failed to connect to XMTP")
			setLoading(false)
		}
	}

	const refreshConversationsImpl = async (client: Client) => {
		try {
			const convs = await client.conversations.list()
			setConversations(convs)

			const messagesMap: Record<string, DecodedMessage[]> = {}
			for (const conv of convs) {
				try {
					const msgs = await conv.messages()
					messagesMap[conv.id] = msgs
				} catch (err) {
					console.error(`Failed to load messages for ${conv.id}:`, err)
				}
			}
			setMessages(messagesMap)
		} catch (err) {
			console.error("Failed to load conversations:", err)
			setError("Connected to XMTP but failed to load conversations")
		}
	}

	const refreshConversations = async () => {
		if (client) {
			await refreshConversationsImpl(client)
		}
	}

	const sendMessage = async (conversationId: string, content: string) => {
		if (!client) throw new Error("XMTP client not connected")

		const conversation = conversations.find((c) => c.id === conversationId)
		if (!conversation) throw new Error("Conversation not found")

		await conversation.send(content)

		const updatedMsgs = await conversation.messages()
		setMessages((prev) => ({
			...prev,
			[conversationId]: updatedMsgs
		}))
	}

	// Note: Event listeners removed - XMTP v7 API differs

	return {
		client,
		conversations,
		messages,
		loading,
		error,
		sendMessage,
		refreshConversations,
		connectXmtp
	}
}
