import type {
	Provider,
	ProviderConfig,
	ProviderFactory,
	ProviderRegistry,
	ProviderType
} from "../types"

/**
 * Provider Registry Implementation
 *
 * Manages registration and creation of provider instances.
 * Supports plug-and-play addition of new providers.
 *
 * @example
 * ```typescript
 * const registry = new ProviderRegistryImpl()
 *
 * // Register provider factories
 * registry.register('discord', (config) => new DiscordProvider(config))
 * registry.register('farcaster', (config) => new FarcasterProvider(config))
 *
 * // Create provider instances
 * const discord = registry.create('discord', {
 *   name: 'my-discord',
 *   type: 'discord',
 *   credentials: { token: 'xxx' }
 * })
 * ```
 */
export class ProviderRegistryImpl implements ProviderRegistry {
	private readonly factories = new Map<ProviderType, ProviderFactory>()

	register(type: ProviderType, factory: ProviderFactory): void {
		if (this.factories.has(type)) {
			throw new Error(`Provider type '${type}' is already registered`)
		}
		this.factories.set(type, factory)
	}

	create(type: ProviderType, config: ProviderConfig): Provider {
		const factory = this.factories.get(type)
		if (!factory) {
			throw new Error(
				`No provider factory registered for type '${type}'. ` +
					`Available types: ${this.getTypes().join(", ")}`
			)
		}

		const provider = factory(config)
		return provider
	}

	get(type: ProviderType): ProviderFactory | undefined {
		return this.factories.get(type)
	}

	has(type: ProviderType): boolean {
		return this.factories.has(type)
	}

	getTypes(): ProviderType[] {
		return Array.from(this.factories.keys())
	}
}
