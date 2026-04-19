import type { DeployProvider, ProviderName } from "./deploy-provider"

type ProviderEntry = DeployProvider | (() => Promise<DeployProvider>)

const providers: Record<ProviderName, ProviderEntry | undefined> = {
	sprites: () =>
		import("./providers/sprite.provider").then((m) => m.spriteProvider),
	e2b: () => import("./providers/e2b.provider").then((m) => m.e2bProvider),
	northflank: () =>
		import("./providers/northflank.provider").then((m) => m.northflankProvider),
	daytona: () =>
		import("./providers/daytona.provider").then((m) => m.daytonaProvider)
}

export async function getProvider(name: ProviderName): Promise<DeployProvider> {
	const entry = providers[name]
	if (!entry) {
		throw new Error(
			`Provider "${name}" is not yet implemented.\nAvailable providers: sprites, e2b, northflank, daytona`
		)
	}
	if (typeof entry === "function") {
		return entry()
	}
	return entry as DeployProvider
}

export function getAvailableProviders(): ProviderName[] {
	return (Object.keys(providers) as ProviderName[]).filter(
		(n) => providers[n] != null
	)
}
