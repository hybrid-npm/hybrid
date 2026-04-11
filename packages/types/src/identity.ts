export type IdentityType = "wallet" | "api-key" | "oauth" | "email" | "custom"

export interface Identity {
	id: string
	type: IdentityType
	displayName?: string
	metadata?: Record<string, unknown>
}

export interface IdentityProvider {
	readonly name: string
	readonly type: IdentityType
	validate(raw: string): Promise<Identity | null>
	format(identity: Identity): string
}

export interface WalletIdentityProvider extends IdentityProvider {
	readonly type: "wallet"
	validate(raw: string): Promise<Identity | null>
}

export interface ApiKeyIdentityProvider extends IdentityProvider {
	readonly type: "api-key"
	validate(raw: string): Promise<Identity | null>
}

export interface OAuthIdentityProvider extends IdentityProvider {
	readonly type: "oauth"
	validate(raw: string): Promise<Identity | null>
}
