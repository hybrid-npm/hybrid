import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

export type SecretName = never

const secrets = new Map<SecretName, string>()

function getSecretsDir(): string {
	const dataRoot = process.env.DATA_ROOT
	if (!dataRoot) {
		return ""
	}
	return join(dataRoot, "secrets")
}

function getSecretPaths(): Record<SecretName, string> {
	const secretsDir = getSecretsDir()
	if (!secretsDir) {
		return {} as Record<SecretName, string>
	}
	return {} as Record<SecretName, string>
}

export function loadSecrets(): void {
	const secretPaths = getSecretPaths()
	for (const [name, path] of Object.entries(secretPaths) as [
		SecretName,
		string
	][]) {
		if (existsSync(path)) {
			const content = readFileSync(path, "utf-8").trim()
			secrets.set(name, content)
		}
	}
}

export function getSecret(name: SecretName): string | undefined {
	return secrets.get(name)
}

export function hasSecret(name: SecretName): boolean {
	return secrets.has(name)
}

export function clearSecrets(): void {
	secrets.clear()
}
