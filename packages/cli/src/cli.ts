#!/usr/bin/env node

const nodeVersion = process.versions.node
const [major] = nodeVersion.split(".").map(Number)
if (!major || major < 20) {
	console.error("Error: Node.js version 20 or higher is required")
	process.exit(1)
}

async function main() {
	const command = process.argv[2]

	console.log("Usage: hybrid <command>")
	console.log("")
	console.log("Commands:")
	console.log("  (no commands available)")
	console.log("")

	if (command) {
		process.exit(1)
	}
}

main().catch((error) => {
	console.error("CLI error:", error)
	process.exit(1)
})
