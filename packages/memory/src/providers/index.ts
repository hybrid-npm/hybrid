import type {
	EmbeddingProviderOptions,
	EmbeddingProviderResult
} from "./types.js"

const DEFAULT_MODEL = "text-embedding-3-small"

export async function createEmbeddingProvider(
	options: EmbeddingProviderOptions
): Promise<EmbeddingProviderResult> {
	const requestedProvider = options.provider

	const createProvider = async (id: string) => {
		if (id === "openai") {
			return createOpenAiProvider(options)
		}
		if (id === "gemini") {
			return createGeminiProvider(options)
		}
		if (id === "voyage") {
			return createVoyageProvider(options)
		}
		if (id === "mistral") {
			return createMistralProvider(options)
		}
		if (id === "local") {
			return createLocalProvider(options)
		}
		return createOpenAiProvider(options)
	}

	if (requestedProvider === "auto") {
		const providers = ["openai", "gemini", "voyage", "mistral"]
		for (const provider of providers) {
			try {
				const result = await createProvider(provider)
				return { ...result, requestedProvider }
			} catch {
				continue
			}
		}
		return {
			provider: null,
			requestedProvider,
			providerUnavailableReason: "No embedding provider available"
		}
	}

	try {
		const result = await createProvider(requestedProvider)
		return { ...result, requestedProvider }
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err)
		if (
			options.fallback &&
			options.fallback !== "none" &&
			options.fallback !== requestedProvider
		) {
			try {
				const fallbackResult = await createProvider(options.fallback)
				return {
					...fallbackResult,
					requestedProvider,
					fallbackFrom: requestedProvider as
						| "openai"
						| "gemini"
						| "voyage"
						| "mistral"
						| "local",
					fallbackReason: reason
				}
			} catch {
				return {
					provider: null,
					requestedProvider,
					fallbackFrom: requestedProvider as
						| "openai"
						| "gemini"
						| "voyage"
						| "mistral"
						| "local",
					providerUnavailableReason: reason
				}
			}
		}
		return {
			provider: null,
			requestedProvider,
			providerUnavailableReason: reason
		}
	}
}

async function createOpenAiProvider(
	options: EmbeddingProviderOptions
): Promise<EmbeddingProviderResult> {
	const { OpenAI } = await import("openai")
	const apiKey = options.remote?.apiKey || process.env.OPENAI_API_KEY
	if (!apiKey) {
		throw new Error("No API key found for OpenAI")
	}
	const client = new OpenAI({
		apiKey,
		baseURL: options.remote?.baseUrl
	})
	const model = options.model || DEFAULT_MODEL

	return {
		provider: {
			id: "openai",
			model,
			maxInputTokens: 8191,
			embedQuery: async (text: string) => {
				const response = await client.embeddings.create({
					model,
					input: text
				})
				return response.data[0]?.embedding || []
			},
			embedBatch: async (texts: string[]) => {
				const response = await client.embeddings.create({
					model,
					input: texts
				})
				return response.data.map((d) => d.embedding)
			}
		},
		requestedProvider: options.provider
	}
}

async function createGeminiProvider(
	options: EmbeddingProviderOptions
): Promise<EmbeddingProviderResult> {
	const apiKey = options.remote?.apiKey || process.env.GEMINI_API_KEY
	if (!apiKey) {
		throw new Error("No API key found for Gemini")
	}
	const baseUrl =
		options.remote?.baseUrl ||
		"https://generativelanguage.googleapis.com/v1beta"
	const model = options.model || "gemini-embedding-001"

	return {
		provider: {
			id: "gemini",
			model,
			maxInputTokens: 2048,
			embedQuery: async (text: string) => {
				const response = await fetch(
					`${baseUrl}/models/${model}:embedContent`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${apiKey}`
						},
						body: JSON.stringify({ content: { parts: [{ text }] } })
					}
				)
				const data = (await response.json()) as {
					embedding?: { values?: number[] }
				}
				return data.embedding?.values || []
			},
			embedBatch: async (texts: string[]) => {
				const results = await Promise.all(
					texts.map(async (text) => {
						const response = await fetch(
							`${baseUrl}/models/${model}:embedContent`,
							{
								method: "POST",
								headers: {
									"Content-Type": "application/json",
									Authorization: `Bearer ${apiKey}`
								},
								body: JSON.stringify({ content: { parts: [{ text }] } })
							}
						)
						const data = (await response.json()) as {
							embedding?: { values?: number[] }
						}
						return data.embedding?.values || []
					})
				)
				return results
			}
		},
		requestedProvider: options.provider
	}
}

async function createVoyageProvider(
	options: EmbeddingProviderOptions
): Promise<EmbeddingProviderResult> {
	const apiKey = options.remote?.apiKey || process.env.VOYAGE_API_KEY
	if (!apiKey) {
		throw new Error("No API key found for Voyage")
	}
	const baseUrl = options.remote?.baseUrl || "https://api.voyageai.com/v1"
	const model = options.model || "voyage-4-large"

	return {
		provider: {
			id: "voyage",
			model,
			maxInputTokens: 32000,
			embedQuery: async (text: string) => {
				const response = await fetch(`${baseUrl}/embeddings`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${apiKey}`
					},
					body: JSON.stringify({ input: text, model })
				})
				const data = (await response.json()) as {
					data?: Array<{ embedding: number[] }>
				}
				return data.data?.[0]?.embedding || []
			},
			embedBatch: async (texts: string[]) => {
				const response = await fetch(`${baseUrl}/embeddings`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${apiKey}`
					},
					body: JSON.stringify({ input: texts, model })
				})
				const data = (await response.json()) as {
					data?: Array<{ embedding: number[] }>
				}
				return data.data?.map((d) => d.embedding) || []
			}
		},
		requestedProvider: options.provider
	}
}

async function createMistralProvider(
	options: EmbeddingProviderOptions
): Promise<EmbeddingProviderResult> {
	const apiKey = options.remote?.apiKey || process.env.MISTRAL_API_KEY
	if (!apiKey) {
		throw new Error("No API key found for Mistral")
	}
	const baseUrl = options.remote?.baseUrl || "https://api.mistral.ai/v1"
	const model = options.model || "mistral-embed"

	return {
		provider: {
			id: "mistral",
			model,
			maxInputTokens: 32000,
			embedQuery: async (text: string) => {
				const response = await fetch(`${baseUrl}/embeddings`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${apiKey}`
					},
					body: JSON.stringify({ input: text, model })
				})
				const data = (await response.json()) as {
					data?: Array<{ embedding: number[] }>
				}
				return data.data?.[0]?.embedding || []
			},
			embedBatch: async (texts: string[]) => {
				const response = await fetch(`${baseUrl}/embeddings`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${apiKey}`
					},
					body: JSON.stringify({ input: texts, model })
				})
				const data = (await response.json()) as {
					data?: Array<{ embedding: number[] }>
				}
				return data.data?.map((d) => d.embedding) || []
			}
		},
		requestedProvider: options.provider
	}
}

async function createLocalProvider(
	_options: EmbeddingProviderOptions
): Promise<EmbeddingProviderResult> {
	throw new Error("Local embeddings require node-llama-cpp package")
}
