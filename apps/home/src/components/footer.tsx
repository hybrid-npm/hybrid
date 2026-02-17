import Link from "next/link"

export function Footer() {
	return (
		<footer className="border-t border-zinc-800 mt-32">
			<div className="container mx-auto px-6 py-12">
				<div className="flex flex-col md:flex-row items-center justify-between gap-4">
					<div className="flex items-center gap-6">
						<Link
							href="/docs"
							className="text-zinc-400 hover:text-white transition-colors text-sm"
						>
							Documentation
						</Link>
						<a
							href="https://github.com/ian/hybrid"
							className="text-zinc-400 hover:text-white transition-colors text-sm"
						>
							GitHub
						</a>
						<a
							href="https://discord.gg/2GVrTwR4XT"
							className="text-zinc-400 hover:text-white transition-colors text-sm"
						>
							Discord
						</a>
						<a
							href="https://twitter.com/hybrid_npm"
							className="text-zinc-400 hover:text-white transition-colors text-sm"
						>
							Twitter
						</a>
					</div>
					<p className="text-zinc-500 text-sm">
						Built by{" "}
						<a
							href="https://01.studio"
							className="text-zinc-400 hover:text-white transition-colors"
						>
							01
						</a>
					</p>
				</div>
			</div>
		</footer>
	)
}
