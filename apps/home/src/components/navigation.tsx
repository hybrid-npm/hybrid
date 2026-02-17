import Link from "next/link"

export function Navigation() {
	return (
		<nav className="border-b border-zinc-800">
			<div className="container mx-auto px-6 py-4">
				<div className="flex items-center justify-between">
					<Link href="/" className="flex items-center gap-2">
						<img
							src="/hybrid.svg"
							alt="Hybrid"
							className="h-6 w-auto"
						/>
						<span className="font-semibold text-white">hybrid</span>
					</Link>
					<div className="flex items-center gap-8">
						<Link
							href="/docs"
							className="text-sm text-zinc-300 hover:text-white transition-colors"
						>
							Docs
						</Link>
						<a
							href="https://discord.gg/2GVrTwR4XT"
							target="_blank"
							rel="noopener noreferrer"
							className="text-sm text-zinc-300 hover:text-white transition-colors"
						>
							Discord
						</a>
						<a
							href="https://github.com/ian/hybrid"
							target="_blank"
							rel="noopener noreferrer"
							className="text-sm text-zinc-300 hover:text-white transition-colors"
						>
							GitHub
						</a>
					</div>
				</div>
			</div>
		</nav>
	)
}
