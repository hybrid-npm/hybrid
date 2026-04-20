// ============================================================================
// DeployProvider Interface
// ============================================================================

export type InstanceStatus =
	| "running"
	| "sleeping"
	| "stopped"
	| "provisioning"
	| "error"
	| "unknown"

export type ProviderName = "sprites" | "e2b" | "northflank" | "daytona"

export interface ProvisionOpts {
	/** Memory in MB (provider-specific defaults if omitted) */
	memory?: number
	/** vCPU count (provider-specific defaults if omitted) */
	cpus?: number
	/** Environment variables to set on the instance */
	env?: Record<string, string>
}

export interface DeployProvider {
	/** Unique provider identifier: "sprites" | "e2b" | "northflank" | "daytona" */
	readonly name: ProviderName

	/** Human-readable label for CLI prompts */
	readonly label: string

	/** Default instance name when user doesn't specify one */
	defaultName(projectDir: string): string

	/**
	 * Verify prerequisites: CLI installed, authenticated, accessible.
	 * Throws with a helpful message if requirements aren't met.
	 */
	authCheck(): Promise<void>

	/**
	 * Provision a new Firecracker microVM.
	 * Returns an instance ID or name used for subsequent operations.
	 */
	provision(name: string, opts?: ProvisionOpts): Promise<string>

	/**
	 * Push the built agent bundle (from distDir) into the running VM.
	 * Handles uploading, extracting, installing deps.
	 */
	deploy(instanceId: string, distDir: string): Promise<void>

	/**
	 * Return current lifecycle state of the instance.
	 */
	status(instanceId: string): Promise<InstanceStatus>

	/**
	 * Put the VM to sleep (pause, stop, or scale-to-zero depending on provider).
	 */
	sleep(instanceId: string): Promise<void>

	/**
	 * Wake the VM from sleep (resume, start, or trigger cold start).
	 */
	wake(instanceId: string): Promise<void>

	/**
	 * Stream logs from the agent process.
	 */
	logs(instanceId: string, follow?: boolean): Promise<void>

	/**
	 * Return the public-facing endpoint URL for the agent.
	 */
	endpoint(instanceId: string): Promise<string>

	/**
	 * Destroy the VM and all associated resources.
	 */
	teardown(instanceId: string): Promise<void>

	/**
	 * Optional: Set the sprite URL to public bypass auth wall
	 */
	makePublic?(instanceId: string): Promise<void>
}
