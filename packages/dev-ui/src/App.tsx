import React from "react"
import { ChatWindow } from "./components/ChatWindow"
import { ConversationList } from "./components/ConversationList"
import { Providers } from "./components/Providers"
import { WalletConnect } from "./components/WalletConnect"
import { useXmtp } from "./hooks/useXmtp"

function ChatContent() {
	const params = new URLSearchParams(window.location.search)
	const conversationId = params.get("chat") || ""
	const { client, loading, connectXmtp, error } = useXmtp()

	return (
		<>
			<header className="bg-white shadow">
				<div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
					<h1 className="text-xl font-bold text-gray-900">Hybrid Dev Chat</h1>
					<WalletConnect />
				</div>
			</header>

			<main
				className="max-w-6xl mx-auto"
				style={{ height: "calc(100vh - 80px)" }}
			>
				<div className="bg-white rounded-lg shadow-lg overflow-hidden h-full">
					<div className="flex h-full">
						<aside className="w-80 border-r overflow-hidden flex flex-col">
							<div className="p-4 border-b bg-gray-50">
								{client ? (
									<p className="text-green-600 text-sm">XMTP Connected</p>
								) : (
									<button
										type="button"
										onClick={connectXmtp}
										disabled={loading}
										className="w-full py-2 px-4 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
									>
										{loading ? "Connecting..." : "Connect XMTP"}
									</button>
								)}
								{error && <p className="text-red-500 text-sm mt-2">{error}</p>}
							</div>
							<ConversationList
								onSelectConversation={(id) => {
									window.history.pushState({}, "", `?chat=${id}`)
									window.location.reload()
								}}
							/>
						</aside>

						<main className="flex-1 overflow-hidden">
							<ChatWindow conversationId={conversationId} />
						</main>
					</div>
				</div>
			</main>
		</>
	)
}

function App() {
	return (
		<Providers>
			<div className="min-h-screen bg-gray-100">
				<ChatContent />
			</div>
		</Providers>
	)
}

export default App
