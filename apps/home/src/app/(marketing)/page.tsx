import Link from "next/link"

export default function HomePage() {
	return (
		<main className="container mx-auto px-6 py-32">
			<div className="flex flex-col items-center text-center max-w-3xl mx-auto">
				<img
					src="/hybrid.svg"
					alt="Hybrid"
					className="h-16 w-auto mb-8"
				/>
				<h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-6">
					Containerized AI Agent Server
				</h1>
				<p className="text-lg md:text-xl text-zinc-400 mb-12 max-w-2xl">
					Deploy intelligent agents powered by Claude Agent SDK with HTTP API,
					SSE streaming, and sub-agent orchestration.
				</p>
				<div className="flex items-center gap-4">
					<Link
						href="/docs"
						className="rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-hover transition-colors"
					>
						Get Started
					</Link>
					<a
						href="https://github.com/ian/hybrid"
						target="_blank"
						rel="noopener noreferrer"
						className="rounded-lg border border-zinc-700 px-6 py-3 text-sm font-semibold text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
					>
						GitHub
					</a>
				</div>
			</div>
		</main>
	)
}
