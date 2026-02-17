import "@fontsource-variable/inter"
import type { Metadata } from "next"
import { RootProvider } from "fumadocs-ui/provider/next"
import "./globals.css"

export const metadata: Metadata = {
	title: {
		default: "Hybrid - Containerized AI Agent Server",
		template: "%s | Hybrid"
	},
	description:
		"Containerized AI Agent Server powered by Claude Agent SDK. Deploy intelligent agents with HTTP API, SSE streaming, and sub-agent orchestration."
}

export default function RootLayout({
	children
}: {
	children: React.ReactNode
}) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body className="min-h-screen bg-black text-white antialiased">
				<RootProvider>{children}</RootProvider>
			</body>
		</html>
	)
}
