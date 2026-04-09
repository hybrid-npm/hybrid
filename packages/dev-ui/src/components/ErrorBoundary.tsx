import React from "react"

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
	const [error, setError] = React.useState<Error | null>(null)

	React.useEffect(() => {
		const handleError = (event: ErrorEvent) => {
			setError(event.error)
			event.preventDefault()
		}

		window.addEventListener("error", handleError)
		return () => window.removeEventListener("error", handleError)
	}, [])

	if (error) {
		return (
			<div className="min-h-screen bg-red-50 p-8">
				<h1 className="text-2xl font-bold text-red-900 mb-4">
					Something went wrong
				</h1>
				<pre className="bg-red-100 p-4 rounded overflow-auto">
					{error.message}
					{error.stack && `\n\n${error.stack}`}
				</pre>
			</div>
		)
	}

	return children
}
