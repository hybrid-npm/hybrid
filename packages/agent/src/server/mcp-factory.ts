import { type Options, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk"
import type { McpServerConfig, McpTransportConfig } from "../config/schema.js"
import type { IdentityProvider } from "@hybrd/types"
import {
	createMemoryMcpServer,
	resolveUserRole
} from "../memory-tools.js"
import { createSkillMcpServer } from "../skills/tools.js"
import type { SchedulerService } from "@hybrd/scheduler"
import { createSchedulerTools } from "@hybrd/scheduler"

export interface McpServerFactoryParams {
	projectRoot: string
	userId: string
	scheduler?: SchedulerService
	identityProvider?: IdentityProvider
}

export async function createMcpServersFromConfig(
	params: McpServerFactoryParams,
	mcpConfigs?: McpServerConfig[]
): Promise<Options["mcpServers"]> {
	const { projectRoot, userId, scheduler, identityProvider } = params
	const { role, acl } = resolveUserRole(projectRoot, userId, identityProvider)

	const mcpServers: Options["mcpServers"] = {}

	mcpServers.memory = createMemoryMcpServer(
		projectRoot,
		userId,
		role,
		acl,
		projectRoot,
		identityProvider
	)

	if (scheduler) {
		const schedulerTools = createSchedulerTools(scheduler)
		mcpServers.scheduler = createSdkMcpServer({
			name: "scheduler",
			tools: schedulerTools
		})
	}

	mcpServers.skills = createSkillMcpServer(userId)

	if (mcpConfigs) {
		for (const config of mcpConfigs) {
			if (config.disabled) continue
			mcpServers[config.name] = await createExternalMcpServer(
				config.name,
				config.transport
			)
		}
	}

	return mcpServers
}

async function createExternalMcpServer(
	name: string,
	transport: McpTransportConfig
): Promise<Options["mcpServers"][string]> {
	switch (transport.type) {
		case "stdio":
			return createSdkMcpServer({
				name,
				command: transport.command,
				args: transport.args || [],
				env: transport.env
			} as any)
		case "sse":
			return createSdkMcpServer({
				name,
				url: transport.url,
				headers: transport.headers
			} as any)
		case "streamable-http":
			return createSdkMcpServer({
				name,
				url: transport.url,
				headers: transport.headers
			} as any)
		default:
			throw new Error(`Unknown MCP transport type: ${(transport as any).type}`)
	}
}
