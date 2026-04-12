import type { Hono } from "hono"
import { Agent } from "./agent"
import type { BehaviorRegistry } from "./behavior"

export interface Plugin<T = Record<string, never>> {
	name: string
	description?: string
	apply: (app: Hono, context: T) => void | Promise<void>
}

export interface PluginRegistry<TContext = unknown> {
	register: (plugin: Plugin<TContext>) => void
	applyAll: (app: Hono, context: TContext) => Promise<void>
}

export interface PluginContext {
	agent: Agent
	behaviors?: BehaviorRegistry
	scheduler?: unknown
}
