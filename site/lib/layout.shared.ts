import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"

export function baseOptions(): BaseLayoutProps {
	return {
		nav: {
			title: "Hybrid"
		},
		githubUrl: "https://github.com/ian/hybrid",
		links: [
			{
				text: "Discord",
				url: "https://discord.gg/2GVrTwR4XT"
			},
			{
				text: "Twitter",
				url: "https://twitter.com/hybrid_npm"
			}
		]
	}
}
