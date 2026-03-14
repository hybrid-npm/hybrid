export interface EmbeddingProvider {
	id: string
	model: string
	maxInputTokens?: number
	embedQuery: (text: string) => Promise<number[]>
	embedBatch: (texts: string[]) => Promise<number[][]>
}

export type EmbeddingProviderId =
	| "openai"
	| "local"
	| "gemini"
	| "voyage"
	| "mistral"
export type EmbeddingProviderRequest = EmbeddingProviderId | "auto"
export type EmbeddingProviderFallback = EmbeddingProviderId | "none"

export interface EmbeddingProviderResult {
	provider: EmbeddingProvider | null
	requestedProvider: EmbeddingProviderRequest
	fallbackFrom?: EmbeddingProviderId
	fallbackReason?: string
	providerUnavailableReason?: string
}

export interface EmbeddingProviderOptions {
	provider: EmbeddingProviderRequest
	remote?: {
		baseUrl?: string
		apiKey?: string
		headers?: Record<string, string>
	}
	model: string
	fallback: EmbeddingProviderFallback
	local?: {
		modelPath?: string
		modelCacheDir?: string
	}
}
