import type {
	AgentConfig,
	AgentRuntime,
	AnyTool,
	DefaultRuntimeExtension,
	GenerateOptions,
	Agent as IAgent,
	Plugin,
	PluginContext,
	StreamOptions,
	ToolGenerator
} from "@hybrd/types"
import { randomUUID } from "@hybrd/utils"
import {
	LanguageModel,
	UIMessage,
	convertToModelMessages,
	generateText,
	smoothStream,
	stepCountIs,
	streamText
} from "ai"
import { render } from "../lib/render"
import { ListenOptions, listen } from "../server/listen"
import { PluginRegistry as PluginRegistryImpl } from "./plugin"
import { toAISDKTools } from "./tool"

// Re-export types from @hybrd/types for backward compatibility
export type {
	AgentConfig,
	DefaultRuntimeExtension,
	GenerateOptions,
	StreamOptions,
	ToolGenerator
}

/**
 * Core Agent implementation using AI SDK 6 directly.
 * This class provides a flexible interface for creating AI agents with
 * dynamic configuration, tool support, and streaming capabilities.
 */
export class Agent<TRuntimeExtension = DefaultRuntimeExtension>
	implements IAgent<TRuntimeExtension, PluginContext>
{
	/** Agent's unique identifier */
	public readonly name: string
	/** Agent configuration */
	private readonly config: AgentConfig<TRuntimeExtension>
	/** Default parameters for text generation */
	private readonly generationDefaults: Partial<
		Pick<
			Parameters<typeof generateText>[0],
			| "model"
			| "messages"
			| "tools"
			| "toolChoice"
			| "stopWhen"
			| "maxOutputTokens"
			| "temperature"
		>
	>
	/** Default parameters for text streaming */
	private readonly streamDefaults: Partial<
		Pick<
			Parameters<typeof streamText>[0],
			| "model"
			| "messages"
			| "tools"
			| "toolChoice"
			| "stopWhen"
			| "experimental_transform"
			| "maxOutputTokens"
			| "temperature"
		>
	>
	/** Plugin registry for extending the agent's HTTP server */
	public readonly plugins: PluginRegistryImpl<PluginContext>

	/**
	 * Creates a new Agent instance with the specified configuration.
	 * @param config - Configuration object for the agent
	 */
	constructor(config: AgentConfig<TRuntimeExtension>) {
		this.name = config.name
		this.config = config
		this.plugins = new PluginRegistryImpl<PluginContext>()

		this.generationDefaults = {
			maxOutputTokens: config.maxTokens,
			temperature: config.temperature
		}

		this.streamDefaults = {
			maxOutputTokens: config.maxTokens,
			temperature: config.temperature
		}
	}

	/**
	 * Resolves dynamic configuration properties (model, tools, instructions) with runtime context.
	 * @param messages - Current conversation messages
	 * @param runtime - Runtime context for the agent
	 * @returns Resolved configuration with model, tools, and instructions
	 */
	private async resolveConfig(
		messages: UIMessage[],
		runtime: AgentRuntime & TRuntimeExtension
	): Promise<{
		model: LanguageModel
		tools?: Record<string, AnyTool<TRuntimeExtension>>
		instructions?: string
	}> {
		const props = { messages, runtime }

		const model =
			typeof this.config.model === "function"
				? await this.config.model(props)
				: this.config.model

		const tools =
			typeof this.config.tools === "function"
				? await this.config.tools(props)
				: this.config.tools

		const instructions =
			typeof this.config.instructions === "function"
				? await this.config.instructions(props)
				: this.config.instructions

		return {
			model,
			tools,
			instructions: render(instructions, runtime as Record<string, unknown>)
		}
	}

	/**
	 * Prepares messages by adding system instructions if provided.
	 * Merges instructions with existing system messages or creates new ones.
	 * @param messages - Current conversation messages
	 * @param instructions - System instructions to add
	 * @returns Messages with system instructions properly integrated
	 */
	private prepareMessages(
		messages: UIMessage[],
		instructions?: string
	): UIMessage[] {
		if (!instructions) {
			return messages
		}

		if (messages[0]?.role === "system") {
			return [
				{
					...messages[0],
					parts: [{ type: "text", text: instructions }]
				},
				...messages.slice(1)
			]
		}

		return [
			{
				role: "system",
				id: randomUUID(),
				parts: [{ type: "text", text: instructions }]
			},
			...messages
		]
	}

	/**
	 * Handles errors by logging to console and calling the onError callback if provided, then re-throws.
	 * @param error - The error to handle
	 */
	private async handleError(error: Error): Promise<never> {
		console.error(`[${this.name}] Agent error:`, error)

		if (this.config.onError) {
			try {
				await this.config.onError(error)
			} catch (handlerError) {
				console.error("Error in onError handler:", handlerError)
			}
		}
		throw error
	}

	/**
	 * Generates a text completion using the agent's configuration.
	 * @param messages - Conversation messages to generate from
	 * @param options - Generation options including runtime context
	 * @returns Generated text completion result
	 */
	async generate(
		messages: UIMessage[],
		options: GenerateOptions<TRuntimeExtension>
	): Promise<Awaited<ReturnType<typeof generateText>>> {
		try {
			const extendedRuntime = await this.createRuntimeContext(options.runtime)

			const { model, tools, instructions } = await this.resolveConfig(
				messages,
				extendedRuntime
			)

			const preparedMessages = this.prepareMessages(messages, instructions)

			const { runtime, maxTokens, telemetry, prompt, ...aiSdkOptions } = options

			const aiSDKTools = tools
				? toAISDKTools<TRuntimeExtension>(
						tools,
						extendedRuntime,
						preparedMessages
					)
				: undefined

const result = await generateText({
			...this.generationDefaults,
			...aiSdkOptions,
			model,
			messages: await convertToModelMessages(preparedMessages),
				tools: aiSDKTools,
				toolChoice:
					aiSDKTools && Object.keys(aiSDKTools).length > 0 ? "auto" : undefined,
				stopWhen: [stepCountIs(this.config.maxSteps ?? 5)],
				maxOutputTokens: maxTokens
			})

			return result
		} catch (error) {
			return await this.handleError(
				error instanceof Error ? error : new Error(String(error))
			)
		}
	}

	/**
	 * Streams a text completion using the agent's configuration.
	 * @param messages - Conversation messages to generate from
	 * @param options - Streaming options including runtime context
	 * @returns Streaming response that can be consumed
	 */
	async stream(
		messages: UIMessage[],
		options: StreamOptions<TRuntimeExtension>
	) {
		try {
			const extendedRuntime = await this.createRuntimeContext(options.runtime)

			const { model, tools, instructions } = await this.resolveConfig(
				messages,
				extendedRuntime
			)

			const preparedMessages = this.prepareMessages(messages, instructions)

			const {
				runtime,
				onFinish,
				maxTokens,
				telemetry,
				prompt,
				...aiSdkOptions
			} = options

			const aiSDKTools = tools
				? toAISDKTools<TRuntimeExtension>(
						tools,
						extendedRuntime,
						preparedMessages
					)
				: undefined

const result = await streamText({
			...this.streamDefaults,
			...aiSdkOptions,
			model,
			messages: await convertToModelMessages(preparedMessages),
				tools: aiSDKTools,
				toolChoice:
					aiSDKTools && Object.keys(aiSDKTools).length > 0 ? "auto" : undefined,
				stopWhen: [stepCountIs(this.config.maxSteps ?? 5)],
				experimental_transform: smoothStream(),
				maxOutputTokens: maxTokens
			})

			return result.toUIMessageStreamResponse({
				originalMessages: messages,
				onFinish
			})
		} catch (error) {
			return await this.handleError(
				error instanceof Error ? error : new Error(String(error))
			)
		}
	}

	/**
	 * Gets the agent's configuration for debugging and inspection.
	 * @returns Object containing agent configuration details
	 */
	getConfig() {
		return {
			name: this.name,
			hasModel: !!this.config.model,
			hasTools: !!this.config.tools,
			hasInstructions: !!this.config.instructions
		}
	}

	/**
	 * Gets the agent's instructions without running generation.
	 * Useful for external integrations that need instructions separately.
	 * @param options - Options containing runtime context and optional messages
	 * @returns Resolved instructions string
	 */
	async getInstructions(options: {
		runtime: AgentRuntime & TRuntimeExtension
		messages?: UIMessage[]
	}) {
		// Ensure runtime is properly extended with createRuntime function
		const extendedRuntime = await this.createRuntimeContext(options.runtime)

		const messages = options.messages || []
		const props = { messages, runtime: extendedRuntime }

		if (typeof this.config.instructions === "function") {
			return await this.config.instructions(props)
		}
		return this.config.instructions
	}

	/**
	 * Gets the agent's tools without running generation.
	 * Useful for external integrations that need tools separately.
	 * @param options - Options containing runtime context and optional messages
	 * @returns Resolved tools object
	 */
	async getTools(options: {
		runtime: AgentRuntime & TRuntimeExtension
		messages?: UIMessage[]
	}) {
		// Ensure runtime is properly extended with createRuntime function
		const extendedRuntime = await this.createRuntimeContext(options.runtime)

		const messages = options.messages || []
		const props = { messages, runtime: extendedRuntime }

		if (typeof this.config.tools === "function") {
			return await this.config.tools(props)
		}
		return this.config.tools
	}

	/**
	 * Creates the complete runtime context by merging base runtime with custom extension.
	 * @param baseRuntime - The base runtime context containing XMTP properties
	 * @returns Complete runtime context with custom extensions applied
	 */
	/**
	 * Creates the complete runtime context by merging base runtime with custom extension.
	 * @param baseRuntime - The base runtime context containing XMTP properties
	 * @returns Complete runtime context with custom extensions applied
	 */
	async createRuntimeContext(
		baseRuntime: AgentRuntime
	): Promise<AgentRuntime & TRuntimeExtension> {
		// Always start with the default runtime (baseRuntime)
		let completeRuntime = { ...baseRuntime } as AgentRuntime & TRuntimeExtension

		// If user provided createRuntime function, extend the default runtime
		if (this.config.createRuntime) {
			const userExtension = await this.config.createRuntime(completeRuntime)
			completeRuntime = {
				...completeRuntime,
				...userExtension
			} as AgentRuntime & TRuntimeExtension
		}

		return completeRuntime
	}

	/**
	 * Registers a plugin with the agent
	 *
	 * @param plugin - The plugin to register
	 */
	use(plugin: Plugin<PluginContext>): void {
		this.plugins.register(plugin)
	}

	/**
	 * Starts listening for messages and events using the agent instance.
	 * @param opts - Configuration options for the listener, excluding the agent property
	 */
	async listen(opts: Omit<ListenOptions, "agent">) {
		listen({ ...opts, agent: this as Agent<DefaultRuntimeExtension> })
	}
}
