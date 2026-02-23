import Link from "next/link"

export default function HomePage() {
	return (
		<main className="flex flex-col items-center justify-center flex-1 text-center">
			<h1 className="text-5xl font-bold mb-4">Hybrid</h1>
			<p className="text-xl text-fd-muted-foreground mb-8 max-w-lg">
				Typescript Framework for building crypto AI Agents
			</p>
			<div className="flex gap-4">
				<Link
					href="/docs"
					className="px-6 py-3 bg-fd-primary text-fd-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
				>
					Get Started
				</Link>
				<a
					href="https://github.com/ian/hybrid"
					target="_blank"
					rel="noopener noreferrer"
					className="px-6 py-3 border border-fd-border rounded-lg font-medium hover:bg-fd-muted transition-colors"
				>
					GitHub
				</a>
			</div>
		</main>
	)
}
