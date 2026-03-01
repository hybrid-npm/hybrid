import { existsSync, readFileSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { normalizeWalletAddress, validateWalletAddress } from "./validate.js"

export type Role = "owner" | "guest"

export interface ACL {
	owners: string[]
}

const ACL_FILENAME = "ACL.md"

const ACL_TEMPLATE = `# Access Control

This file defines access permissions for the agent's memory system.

## Roles

| Role  | Read Shared Memory | Write Shared Memory | Read User Memory | Write User Memory |
|-------|-------------------|---------------------|------------------|-------------------|
| Owner | ✅                | ✅                  | ✅               | ✅                |
| Guest | ❌                | ❌                  | ✅               | ✅                |

### Owner
- Full access to all memory sources
- Can read and write shared/project memory
- Can read any user's memory
- Writes to OpenClaw-compatible path
- Can modify this ACL.md file via agent commands

### Guest (default for unknown wallets)
- Isolated memory only
- Full read/write access to their own user memory
- Any wallet not listed in Owners defaults to Guest

## Wallet Addresses

Addresses are case-insensitive. Use full wallet addresses (0x + 40 hex characters).

---

## Owners

`

export function parseACL(workspaceDir: string): ACL | null {
	const aclPath = join(workspaceDir, ACL_FILENAME)

	if (!existsSync(aclPath)) {
		return null
	}

	try {
		const content = readFileSync(aclPath, "utf-8")
		const owners = parseOwnerAddresses(content)
		return { owners }
	} catch {
		return null
	}
}

function parseOwnerAddresses(content: string): string[] {
	const owners: string[] = []
	const lines = content.split("\n")
	let inOwnersSection = false

	for (const line of lines) {
		const trimmed = line.trim()

		if (trimmed === "## Owners") {
			inOwnersSection = true
			continue
		}

		if (trimmed.startsWith("## ") && inOwnersSection) {
			break
		}

		if (inOwnersSection && trimmed.startsWith("- ")) {
			const address = trimmed.slice(2).split("#")[0].trim()
			if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
				owners.push(address.toLowerCase())
			}
		}
	}

	return owners
}

export function getRole(acl: ACL | null, userId: string): Role {
	if (!acl || !userId) {
		return "guest"
	}

	const normalizedUserId = normalizeWalletAddress(userId)

	if (acl.owners.includes(normalizedUserId)) {
		return "owner"
	}

	return "guest"
}

export async function addOwner(
	workspaceDir: string,
	userId: string
): Promise<{ success: boolean; message: string }> {
	const normalizedAddress = validateWalletAddress(userId)
	const aclPath = join(workspaceDir, ACL_FILENAME)

	let content: string
	if (!existsSync(aclPath)) {
		content = ACL_TEMPLATE
	} else {
		content = await readFile(aclPath, "utf-8")
	}

	const owners = parseOwnerAddresses(content)

	if (owners.includes(normalizedAddress)) {
		return { success: false, message: "Address is already an owner" }
	}

	const timestamp = new Date().toISOString().split("T")[0]
	const newLine = `- ${normalizedAddress}  # Added ${timestamp}\n`

	let newContent: string
	if (content.includes("## Owners")) {
		const lines = content.split("\n")
		let inserted = false
		const newLines: string[] = []

		for (const line of lines) {
			newLines.push(line)
			if (!inserted && line.trim() === "## Owners") {
				newLines.push("")
				newLines.push(newLine.trimEnd())
				inserted = true
			}
		}

		if (!inserted) {
			newContent = `${content}\n${newLine}`
		} else {
			newContent = newLines.join("\n")
		}
	} else {
		newContent = `${content}\n## Owners\n\n${newLine}`
	}

	await writeFile(aclPath, newContent, "utf-8")
	return { success: true, message: `Added ${normalizedAddress} as owner` }
}

export async function removeOwner(
	workspaceDir: string,
	userId: string
): Promise<{ success: boolean; message: string }> {
	const normalizedAddress = validateWalletAddress(userId)
	const aclPath = join(workspaceDir, ACL_FILENAME)

	if (!existsSync(aclPath)) {
		return { success: false, message: "ACL.md does not exist" }
	}

	const content = await readFile(aclPath, "utf-8")
	const owners = parseOwnerAddresses(content)

	if (!owners.includes(normalizedAddress)) {
		return { success: false, message: "Address is not an owner" }
	}

	const lines = content.split("\n")
	const newLines: string[] = []

	for (const line of lines) {
		const trimmed = line.trim()
		if (trimmed.startsWith("- ")) {
			const address = trimmed.slice(2).split("#")[0].trim().toLowerCase()
			if (address === normalizedAddress) {
				continue
			}
		}
		newLines.push(line)
	}

	await writeFile(aclPath, newLines.join("\n"), "utf-8")
	return { success: true, message: `Removed ${normalizedAddress} from owners` }
}

export function listOwners(acl: ACL | null): string[] {
	return acl?.owners || []
}
