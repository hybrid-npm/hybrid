import fs from "node:fs"
import path from "node:path"

export default function (plop) {
	plop.setGenerator("packages", {
		description: "Generate README.md for all packages (except skipped ones)",
		prompts: [], // automated from package.json
		actions: () => {
			const packagesDir = path.resolve("./packages")
			const dirs = fs.readdirSync(packagesDir)

			// Add any package names or folder names you want to skip
			const skip = []

			const actions = []

			dirs.forEach((dir) => {
				const pkgJsonPath = path.join(packagesDir, dir, "package.json")

				if (fs.existsSync(pkgJsonPath)) {
					const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"))

					if (skip.includes(pkg.name) || skip.includes(dir)) {
						console.log(`⏩ Skipping ${pkg.name || dir}`)
						return
					}

					actions.push({
						type: "add",
						path: path.join(packagesDir, dir, "README.md"),
						templateFile: "readmes.hbs",
						force: true, // overwrite if README already exists
						data: {
							name: pkg.name,
							title: pkg.name || dir,
							description: pkg.description || "",
							keywords: pkg.keywords || []
						}
					})
				}
			})

			return actions
		}
	})
}
