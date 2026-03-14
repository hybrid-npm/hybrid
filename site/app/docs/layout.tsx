import { baseOptions } from "@/lib/layout.shared"
import { source } from "@/lib/source"
import { DocsLayout } from "fumadocs-ui/layouts/docs"
import type { ReactNode } from "react"
import "fumadocs-ui/style.css"

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<DocsLayout {...baseOptions()} tree={source.getPageTree()}>
			{children}
		</DocsLayout>
	)
}
