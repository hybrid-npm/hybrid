import Link from "next/link"

export default function HomePage() {
	return (
		<main className="flex flex-col items-center justify-center flex-1 text-center px-4">
			<h1 className="text-5xl font-semibold tracking-tight mb-4">Hybrid</h1>
			<p className="text-lg opacity-60 mb-10 max-w-md leading-relaxed">
				Typescript Framework for building crypto AI Agents
			</p>
			<div className="flex gap-3">
				<Link
					href="/docs"
					className="px-5 py-2.5 bg-white text-black rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
				>
					Get Started
				</Link>
				<a
					href="https://github.com/ian/hybrid"
					target="_blank"
					rel="noopener noreferrer"
					className="px-5 py-2.5 border border-white/10 rounded-lg font-medium text-sm hover:bg-white/5 transition-colors"
				>
					GitHub
				</a>
			</div>
		</main>
	)
}
