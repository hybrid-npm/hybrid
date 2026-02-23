import type { Metadata } from "next"
import { Inter } from "next/font/google"
import Script from "next/script"
import { Provider } from "./provider"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

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
		<html lang="en" suppressHydrationWarning>
			<body className={inter.className}>
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
