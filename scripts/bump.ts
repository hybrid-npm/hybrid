#!/usr/bin/env tsx

import { execSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

interface PackageJson {
	name: string
	version: string
	[key: string]: any
}

function bumpVersion(
	version: string,
	type: "patch" | "minor" | "major"
): string {
	const [major, minor, patch] = version.split(".").map(Number)

	switch (type) {
		case "major":
			return `${major + 1}.0.0`
		case "minor":
			return `${major}.${minor + 1}.0`
		case "patch":
			return `${major}.${minor}.${patch + 1}`
		default:
			throw new Error(`Unknown bump type: ${type}`)
	}
}

function executeGitCommand(command: string): string {
	try {
		return execSync(command, { encoding: "utf-8", stdio: "pipe" }).trim()
	} catch (error) {
		throw new Error(`Git command failed: ${command}\n${error}`)
	}
}

function gitCommitAndTag(version: string, bumpType: string) {
	console.log("\n🔄 Committing changes to git...")

	// Add all package.json changes
	executeGitCommand("git add packages/*/package.json")

	// Commit with descriptive message
	const commitMessage = `chore: bump ${bumpType} versions to ${version}`
	executeGitCommand(`git commit -m "${commitMessage}"`)
	console.log(`✅ Committed changes: ${commitMessage}`)

	// Create and push tag
	const tagName = `v${version}`
	executeGitCommand(`git tag ${tagName}`)
	console.log(`✅ Created tag: ${tagName}`)

	// Push commits and tags
	console.log("🚀 Pushing to remote...")
	executeGitCommand("git push")
	executeGitCommand("git push --tags")
	console.log("✅ Successfully pushed commits and tags to remote")
}

function bumpPackageVersions(bumpType: "patch" | "minor" | "major" = "patch") {
	try {
		// Find all package directories in the packages directory
		const packagesDir = join(process.cwd(), "packages")
		const packageDirs = readdirSync(packagesDir).filter((item) => {
			const itemPath = join(packagesDir, item)
			return statSync(itemPath).isDirectory()
		})

		console.log(`🔍 Found ${packageDirs.length} packages`)
		console.log(`📦 Bumping ${bumpType} versions...\n`)

		let newVersion = ""
		for (const dir of packageDirs) {
			const packagePath = join(packagesDir, dir, "package.json")

			// Skip directories without a package.json
			if (!existsSync(packagePath)) {
				console.log(`⏭️  ${dir}: skipped (no package.json)`)
				continue
			}

			const packageJson: PackageJson = JSON.parse(
				readFileSync(packagePath, "utf-8")
			)

			// Skip packages without a version field
			if (!packageJson.version) {
				console.log(`⏭️  ${dir}: skipped (no version field)`)
				continue
			}

			const currentVersion = packageJson.version
			newVersion = bumpVersion(currentVersion, bumpType)

			// Update the version in the package.json
			packageJson.version = newVersion

			// Write the updated package.json back
			writeFileSync(packagePath, `${JSON.stringify(packageJson, null, "\t")}\n`)

			console.log(`✅ ${packageJson.name}: ${currentVersion} → ${newVersion}`)
		}

		console.log(
			`\n🎉 Successfully bumped all packages to ${bumpType} versions!`
		)

		// Commit, tag, and push changes
		gitCommitAndTag(newVersion, bumpType)

		// Note: Examples are no longer part of the workspace and use "latest" versions
		// They will automatically get the newest published versions
	} catch (error) {
		console.error("❌ Error bumping package versions:", error)
		process.exit(1)
	}
}

// Parse command line arguments
const bumpType = (process.argv[2] as "patch" | "minor" | "major") || "patch"

if (!["patch", "minor", "major"].includes(bumpType)) {
	console.error("❌ Invalid bump type. Please use: patch, minor, or major")
	process.exit(1)
}

// Run the bump script
bumpPackageVersions(bumpType)
