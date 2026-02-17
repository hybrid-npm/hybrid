import "./docs.css"
import { DocsLayout } from "fumadocs-ui/layouts/docs"
import type { ReactNode } from "react"
import { source } from "@/app/source"

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<DocsLayout
			tree={source.pageTree}
			nav={{
				title: (
					<div className="flex items-center gap-2">
						<img
							src="/hybrid.svg"
							alt="Hybrid"
							className="h-6 w-auto"
						/>
						<span className="font-semibold">hybrid</span>
					</div>
				),
				url: "/"
			}}
			sidebar={{
				enabled: true,
				collapsible: true,
				tabs: false,
				defaultOpenLevel: 2
			}}
			links={[
				{
					text: "Home",
					url: "/"
				},
				{
					text: "GitHub",
					url: "https://github.com/ian/hybrid",
					external: true
				},
				{
					text: "Discord",
					url: "https://discord.gg/2GVrTwR4XT",
					external: true
				}
			]}
		>
			{children}
		</DocsLayout>
	)
}
