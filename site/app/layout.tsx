import type { Metadata } from "next"
import { Space_Grotesk } from "next/font/google"
import Script from "next/script"
import { Provider } from "./provider"
import "./globals.css"

const spaceGrotesk = Space_Grotesk({
	subsets: ["latin"],
	variable: "--font-space-grotesk",
	display: "swap"
})

export const metadata: Metadata = {
	title: "Hybrid",
	description: "Typescript Framework for building crypto AI Agents"
}

export default function RootLayout({
	children
}: {
	children: React.ReactNode
}) {
	return (
		<html lang="en" suppressHydrationWarning className={spaceGrotesk.variable}>
			<body className={spaceGrotesk.className}>
				<Script
					defer
					src="https://datafa.st/js/script.js"
					data-website-id="dfid_GQrhtCKdhmXdvkA6jL5wW"
					data-domain="hybrid.dev"
					strategy="afterInteractive"
				/>
				<Provider>{children}</Provider>
			</body>
		</html>
	)
}
