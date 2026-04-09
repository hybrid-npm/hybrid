"use client"

import { useEffect, useRef, useState } from "react"
import { useXmtp } from "../hooks/useXmtp"

export function ChatWindow({ conversationId }: { conversationId: string }) {
	const { messages, sendMessage, conversations } = useXmtp()
	const [input, setInput] = useState("")
	const [sending, setSending] = useState(false)
	const messagesEndRef = useRef<HTMLDivElement>(null)

	const conversationMessages = messages[conversationId] || []
	const conversation = conversations.find((c) => c.id === conversationId)

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
	}, [conversationMessages])

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!input.trim() || sending) return

		setSending(true)
		try {
			await sendMessage(conversationId, input.trim())
			setInput("")
		} catch (err: any) {
			alert(`Failed to send: ${err.message}`)
		} finally {
			setSending(false)
		}
	}

	if (!conversation) {
		return (
			<div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-500">
				Select a conversation to start chatting
			</div>
		)
	}

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="p-4 border-b bg-white">
				<h2 className="font-semibold text-gray-900">
					{conversation.peerInboxId.slice(0, 12)}...
					{conversation.peerInboxId.slice(-8)}
				</h2>
				<p className="text-sm text-gray-500">
					{conversation.topic || "Direct message"}
				</p>
			</div>

			{/* Messages */}
			<div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
				{conversationMessages.map((msg) => {
					// Note: In a real implementation, we'd determine sender from msg.senderInboxId
					// For simplicity, we'll assume alternating or based on current wallet
					return (
						<div key={msg.id} className="flex flex-col">
							<div className="text-xs text-gray-500 mb-1">
								{new Date(msg.sentAt).toLocaleTimeString()}
							</div>
							<div className="max-w-xs lg:max-w-md px-4 py-2 rounded-lg bg-white border shadow-sm">
								<p className="text-gray-900 whitespace-pre-wrap">
									{msg.content as string}
								</p>
							</div>
						</div>
					)
				})}
				<div ref={messagesEndRef} />
			</div>

			{/* Input */}
			<form onSubmit={handleSubmit} className="p-4 border-t bg-white">
				<div className="flex gap-2">
					<input
						type="text"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder="Type a message..."
						className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						disabled={sending}
					/>
					<button
						type="submit"
						disabled={sending || !input.trim()}
						className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{sending ? "..." : "Send"}
					</button>
				</div>
			</form>
		</div>
	)
}
