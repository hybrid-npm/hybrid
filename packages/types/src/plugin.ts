import type { Hono } from "hono"
import { Agent } from "./agent"
import type { BehaviorRegistry } from "./behavior"
import type { HonoVariables } from "./xmtp"

/**
 * Plugin interface for extending the agent's Hono app
 *
 * @description
 * Plugins allow you to extend the agent's HTTP server with additional
 * routes, middleware, and functionality. Each plugin receives the Hono
 * app instance and can modify it as needed.
 *
 * @template T - Optional context type that can be passed to the plugin
 */
export interface Plugin<T = Record<string, never>> {
	/**
	 * Unique identifier for the plugin
	 */
	name: string

	/**
	 * Optional description of what the plugin does
	 */
	description?: string

	/**
	 * Function that applies the plugin to the Hono app
	 *
	 * @param app - The Hono app instance to extend
	 * @param context - Optional context data passed to the plugin
	 */
	apply: (
		app: Hono<{ Variables: HonoVariables }>,
		context: T
	) => void | Promise<void>
}

/**
 * Plugin registry that manages all registered plugins
 *
 * @description
 * The plugin registry allows you to register, configure, and apply
 * plugins to Hono apps. It provides a centralized way to manage
 * plugin dependencies and execution order.
 */
export interface PluginRegistry<TContext = unknown> {
	register: (plugin: Plugin<TContext>) => void
	applyAll: (
		app: Hono<{ Variables: HonoVariables }>,
		context: TContext
	) => Promise<void>
}

export interface PluginContext {
	agent: Agent
	behaviors?: BehaviorRegistry
	scheduler?: unknown
	xmtpClient?: unknown
}
