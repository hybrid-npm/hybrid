import { defineConfig } from "vocs"

export default defineConfig({
	title: "hybrid",
	description: "Containerized AI Agent Server powered by Claude Agent SDK",
	theme: {
		accentColor: "#F87400"
	},
	iconUrl: {
		light: "/hybrid.svg",
		dark: "/hybrid.svg"
	},
	logoUrl: {
		light: "/hybrid-logo-light.svg",
		dark: "/hybrid-logo-dark.svg"
	},
	ogImageUrl: "/og.png",
	socials: [
		{
			icon: "discord",
			link: "https://discord.gg/2GVrTwR4XT"
		},
		{
			icon: "github",
			link: "https://github.com/ian/hybrid"
		},
		{
			icon: "x",
			link: "https://twitter.com/hybrid_npm"
		}
	],
	sidebar: [
		{
			text: "Getting Started",
			items: [
				{
					text: "Overview",
					link: "/"
				},
				{
					text: "Quickstart",
					link: "/quickstart"
				},
				{
					text: "Architecture",
					link: "/architecture"
				}
			]
		},
		{
			text: "Server",
			items: [
				{
					text: "HTTP API",
					link: "/server/api"
				},
				{
					text: "SSE Protocol",
					link: "/server/sse"
				},
				{
					text: "Sub-Agents",
					link: "/server/sub-agents"
				}
			]
		},
		{
			text: "Configuration",
			items: [
				{
					text: "System Prompt",
					link: "/config/system-prompt"
				},
				{
					text: "Skills",
					link: "/config/skills"
				}
			]
		},
		{
			text: "Deployment",
			items: [
				{
					text: "Docker",
					link: "/deployment/docker"
				}
			]
		},
		{
			text: "Development",
			items: [
				{
					text: "Contributing",
					link: "/developing/contributing"
				}
			]
		}
	]
})
