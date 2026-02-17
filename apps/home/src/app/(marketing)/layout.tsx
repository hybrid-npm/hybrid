import type { ReactNode } from "react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"

export default function MarketingLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<Navigation />
			{children}
			<Footer />
		</>
	)
}
