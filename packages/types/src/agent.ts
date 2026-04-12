import type {
	LanguageModel,
	TelemetrySettings,
	UIMessage,
	UIMessageStreamOnFinishCallback,
	generateText,
	streamText
} from "ai"
import type { BehaviorObject } from "./behavior"
import type { Plugin, PluginRegistry } from "./plugin"
import type { AgentRuntime } from "./runtime"
import type { AnyTool } from "./tool"

export type AgentMessage = UIMessage

export interface Agent<
	TRuntimeExtension = Record<string, never>,
	TPluginContext = unknown
> {
	/** Agent's unique identifier */
	readonly name: string
	/** Plugin registry for extending the agent's HTTP server */
	readonly plugins: PluginRegistry<TPluginContext>

	/**
	 * Generates a text completion using the agent's configuration.
	 * @param messages - Conversation messages to generate from
	 * @param options - Generation options including runtime context
	 * @returns Generated text completion result
	 */
	generate(
		messages: AgentMessage[],
		options: GenerateOptions<TRuntimeExtension>
	): Promise<Awaited<ReturnType<typeof generateText>>>

	/**
	 * Streams a text completion using the agent's configuration.
	 * @param messages - Conversation messages to generate from
	 * @param options - Streaming options including runtime context
	 * @returns Streaming response that can be consumed
	 */
	stream(
		messages: AgentMessage[],
		options: StreamOptions<TRuntimeExtension>
	): Promise<Response>

	/**
	 * Gets the agent's configuration for debugging and inspection.
	 * @returns Object containing agent configuration details
	 */
	getConfig(): {
		name: string
		hasModel: boolean
		hasTools: boolean
		hasInstructions: boolean
	}

	/**
	 * Gets the agent's instructions without running generation.
	 * Useful for external integrations that need instructions separately.
	 * @param options - Options containing runtime context and optional messages
	 * @returns Resolved instructions string
	 */
	getInstructions(options: {
		runtime: AgentRuntime & TRuntimeExtension
		messages?: AgentMessage[]
	}): Promise<string | undefined>

	/**
	 * Gets the agent's tools without running generation.
	 * Useful for external integrations that need tools separately.
	 * @param options - Options containing runtime context and optional messages
	 * @returns Resolved tools object
	 */
	getTools(options: {
		runtime: AgentRuntime & TRuntimeExtension
		messages?: AgentMessage[]
	}): Promise<Record<string, AnyTool<TRuntimeExtension>> | undefined>

	/**
	 * Creates the complete runtime context by merging base runtime with custom extension.
	 * @param baseRuntime - The base runtime context
	 * @returns Complete runtime context with custom extensions applied
	 */
	createRuntimeContext(
		baseRuntime: AgentRuntime
	): Promise<AgentRuntime & TRuntimeExtension>

	/**
	 * Registers a plugin with the agent
	 * @param plugin - The plugin to register
	 */
	use(plugin: Plugin<TPluginContext>): void

	/**
	 * Starts listening for messages and events using the agent instance.
	 * @param opts - Configuration options for the listener, excluding the agent property
	 */
	listen(opts: Omit<ListenOptions, "agent">): Promise<void>
}

export type DefaultRuntimeExtension = Record<string, never>

export type ToolGenerator<TRuntimeExtension = DefaultRuntimeExtension> =
	(props: {
		runtime: AgentRuntime & TRuntimeExtension
		messages: AgentMessage[]
	}) =>
		| Record<string, AnyTool<TRuntimeExtension>>
		| Promise<Record<string, AnyTool<TRuntimeExtension>>>

/**
 * Configuration interface for creating an Agent instance.
 * Supports both static and dynamic configuration through functions.
 */
export interface AgentConfig<TRuntimeExtension = DefaultRuntimeExtension> {
	/** Unique identifier for the agent */
	name: string
	/** Language model to use, can be static or dynamically resolved */
	model:
		| LanguageModel
		| ((props: {
				runtime: AgentRuntime & TRuntimeExtension
		  }) => LanguageModel | Promise<LanguageModel>)
	/** Tools available to the agent, can be static or dynamically generated */
	tools?:
		| Record<string, AnyTool<TRuntimeExtension>>
		| ToolGenerator<TRuntimeExtension>
	/** Instructions for the agent, can be static or dynamically resolved */
	instructions:
		| string
		| ((props: {
				messages: AgentMessage[]
				runtime: AgentRuntime & TRuntimeExtension
		  }) => string | Promise<string>)
	/** Function to create the runtime extension, type will be inferred */
	createRuntime?: (
		runtime: AgentRuntime
	) => TRuntimeExtension | Promise<TRuntimeExtension>
	/** Maximum number of steps the agent can take */
	maxSteps?: number
	/** Maximum tokens for generation */
	maxTokens?: number
	/** Temperature for generation (0.0 to 2.0) */
	temperature?: number
	/** Error handler callback for custom error handling (e.g., Sentry) */
	onError?: (error: Error) => void | Promise<void>
}

/**
 * Options for text generation with the agent.
 * Extends AI SDK parameters while adding agent-specific options.
 */
export interface GenerateOptions<TRuntimeExtension = DefaultRuntimeExtension>
	extends Omit<
		Parameters<typeof generateText>[0],
		"model" | "tools" | "instructions" | "onFinish"
	> {
	/** Maximum tokens for generation */
	maxTokens?: number
	/** Runtime context for the agent */
	runtime: AgentRuntime & TRuntimeExtension
	/** Optional telemetry configuration */
	telemetry?: NonNullable<TelemetrySettings>
}

export interface StreamOptions<TRuntimeExtension = DefaultRuntimeExtension>
	extends Omit<
		Parameters<typeof streamText>[0],
		"model" | "tools" | "instructions" | "onFinish"
	> {
	/** Maximum tokens for generation */
	maxTokens?: number
	/** Runtime context for the agent */
	runtime: AgentRuntime & TRuntimeExtension
	/** Optional telemetry configuration */
	telemetry?: NonNullable<TelemetrySettings>
	/** Callback when streaming finishes */
	onFinish?: UIMessageStreamOnFinishCallback<AgentMessage>
}

/**
 * Options for starting the agent listener
 * @property agent - The agent instance to use
 * @property port - The port number to listen on (defaults to 8454)
 * @property plugins - Optional array of plugins to apply to the server
 * @property behaviors - Optional array of behaviors to apply to message processing
 */
export interface ListenOptions {
	agent: Agent<unknown, unknown>
	port: string
	plugins?: Plugin<unknown>[]
	behaviors?: BehaviorObject[]
}
