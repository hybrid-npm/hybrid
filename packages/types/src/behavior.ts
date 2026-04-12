import type { AgentRuntime } from "./runtime"

export interface BehaviorConfig {
	enabled?: boolean
	config?: Record<string, unknown>
}

export interface BehaviorContext<TRuntimeExtension = Record<string, never>> {
	runtime: AgentRuntime & TRuntimeExtension
	response?: string
	sendOptions?: {
		threaded?: boolean
		contentType?: string
		filtered?: boolean
		metadata?: Record<string, unknown>
	}
	next?: () => Promise<void>
	stopped?: boolean
}

export interface BehaviorObject<TRuntimeExtension = Record<string, never>> {
	id: string
	config: BehaviorConfig
	before?(context: BehaviorContext<TRuntimeExtension>): Promise<void> | void
	after?(context: BehaviorContext<TRuntimeExtension>): Promise<void> | void
}

export type Behavior<TConfig = Record<string, unknown>> = (
	config: TConfig & BehaviorConfig
) => BehaviorObject

export type BehaviorInstance = Behavior

export interface BehaviorRegistry {
	register(behavior: BehaviorObject): void
	registerAll(behaviors: BehaviorObject[]): void
	getAll(): BehaviorObject[]
	getBeforeBehaviors(): BehaviorObject[]
	getAfterBehaviors(): BehaviorObject[]
	executeBefore(context: BehaviorContext): Promise<void>
	executeAfter(context: BehaviorContext): Promise<void>
	clear(): void
}

export class BehaviorRegistryImpl implements BehaviorRegistry {
	private behaviors: BehaviorObject[] = []

	register(behavior: BehaviorObject): void {
		this.behaviors.push(behavior)
	}

	registerAll(behaviors: BehaviorObject[]): void {
		this.behaviors.push(...behaviors)
	}

	getAll(): BehaviorObject[] {
		return [...this.behaviors]
	}

	getBeforeBehaviors(): BehaviorObject[] {
		return this.behaviors.filter((behavior) => behavior.before)
	}

	getAfterBehaviors(): BehaviorObject[] {
		return this.behaviors.filter((behavior) => behavior.after)
	}

	async executeBefore(context: BehaviorContext): Promise<void> {
		const behaviors = this.getBeforeBehaviors()

		let currentIndex = 0
		const next = async (): Promise<void> => {
			if (currentIndex >= behaviors.length) {
				return
			}

			const behavior = behaviors[currentIndex]
			if (!behavior) {
				return
			}
			currentIndex++

			try {
				await behavior.before?.(context)
			} catch (error) {
				console.error(
					`Error executing before behavior "${behavior.id}":`,
					error
				)
			}
		}

		context.next = next

		await next()

		context.stopped = currentIndex < behaviors.length
	}

	async executeAfter(context: BehaviorContext): Promise<void> {
		const behaviors = this.getAfterBehaviors()

		let currentIndex = 0
		const next = async (): Promise<void> => {
			if (currentIndex >= behaviors.length) {
				return
			}

			const behavior = behaviors[currentIndex]
			if (!behavior) {
				return
			}
			currentIndex++

			try {
				await behavior.after?.(context)
			} catch (error) {
				console.error(`Error executing after behavior "${behavior.id}":`, error)
			}
		}

		context.next = next

		await next()

		context.stopped = currentIndex < behaviors.length
	}

	clear(): void {
		this.behaviors = []
	}
}
