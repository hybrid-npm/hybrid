import { getRandomValues } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { logger } from "@hybrd/utils"
import { ReactionCodec } from "@xmtp/content-type-reaction"
import { ReplyCodec } from "@xmtp/content-type-reply"
import { TransactionReferenceCodec } from "@xmtp/content-type-transaction-reference"
import { WalletSendCallsCodec } from "@xmtp/content-type-wallet-send-calls"
import { Client, IdentifierKind, type Signer, XmtpEnv } from "@xmtp/node-sdk"
import { fromString, toString as uint8arraysToString } from "uint8arrays"
import { http, createWalletClient, toBytes } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { revokeOldInstallations } from "../scripts/revoke-installations"
import { XmtpClient } from "./types"

// ===================================================================
// Module Setup
// ===================================================================
// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ===================================================================
// Type Definitions
// ===================================================================
interface User {
	key: `0x${string}`
	account: ReturnType<typeof privateKeyToAccount>
	wallet: any // Simplified to avoid deep type instantiation
}

// ===================================================================
// User and Signer Creation
// ===================================================================
export const createUser = (key: string): User => {
	const account = privateKeyToAccount(key as `0x${string}`)
	return {
		key: key as `0x${string}`,
		account,
		wallet: createWalletClient({
			account,
			chain: sepolia,
			transport: http()
		})
	}
}

export const createSigner = (key: string): Signer => {
	if (!key || typeof key !== "string") {
		throw new Error("XMTP wallet key must be a non-empty string")
	}
	const sanitizedKey = key.startsWith("0x") ? key : `0x${key}`
	const user = createUser(sanitizedKey)
	return {
		type: "EOA",
		getIdentifier: () => ({
			identifierKind: 0 as IdentifierKind.Ethereum, // Use numeric value to avoid ambient const enum issue
			identifier: user.account.address.toLowerCase()
		}),
		signMessage: async (message: string) => {
			const signature = await user.wallet.signMessage({
				message,
				account: user.account
			})
			return toBytes(signature)
		}
	}
}

// XMTP XmtpClient setup
// const xmtpClient: XmtpClient | null = null

// Function to clear XMTP database when hitting installation limits
async function clearXMTPDatabase(address: string, env: string) {
	logger.debug("🧹 Clearing XMTP database to resolve installation limit...")

	// Get the storage directory using the same logic as getDbPath
	const getStorageDirectory = () => {
		const customStoragePath = process.env.XMTP_STORAGE_PATH

		if (customStoragePath) {
			return path.isAbsolute(customStoragePath)
				? customStoragePath
				: path.resolve(process.cwd(), customStoragePath)
		}

		// Use existing logic as fallback
		const projectRoot =
			process.env.PROJECT_ROOT || path.resolve(__dirname, "../../..")

		return path.join(projectRoot, ".data/xmtp") // Local development
	}

	// Clear local database files
	const dbPattern = `${env}-${address}.db3`
	const storageDir = getStorageDirectory()

	// Primary storage directory
	const possiblePaths = [
		storageDir,
		// Legacy fallback paths for backward compatibility
		path.join(process.cwd(), ".data", "xmtp"),
		path.join(process.cwd(), "..", ".data", "xmtp"),
		path.join(process.cwd(), "..", "..", ".data", "xmtp")
	]

	for (const dir of possiblePaths) {
		try {
			if (fs.existsSync(dir)) {
				const files = fs.readdirSync(dir)
				const matchingFiles = files.filter(
					(file) =>
						file.includes(dbPattern) ||
						file.includes(address) ||
						file.includes(`xmtp-${env}-${address}`)
				)

				for (const file of matchingFiles) {
					const fullPath = path.join(dir, file)
					try {
						fs.unlinkSync(fullPath)
						logger.debug(`✅ Removed: ${fullPath}`)
					} catch (err) {
						logger.debug(`⚠️ Could not remove ${fullPath}:`, err)
					}
				}
			}
		} catch (err) {
			// Ignore errors when checking directories
		}
	}
}

export async function createXMTPClient(
	privateKey: string,
	opts?: {
		persist?: boolean
		maxRetries?: number
		storagePath?: string
	}
): Promise<XmtpClient> {
	const { persist = true, maxRetries = 3, storagePath } = opts ?? {}
	let attempt = 0

	// Extract common variables for error handling
	// const actualSigner = signer
	const signer = createSigner(privateKey)

	if (!signer) {
		throw new Error(
			"No signer provided and AGENT_WALLET_KEY environment variable is not set"
		)
	}

	const { AGENT_SECRET, XMTP_ENV } = process.env

	// Get the wallet address to use the correct database
	const identifier = await signer.getIdentifier()
	const address = identifier.identifier

	while (attempt < maxRetries) {
		try {
			logger.debug(
				`🔄 Attempt ${attempt + 1}/${maxRetries} to create XMTP client...`
			)

			// Always require encryption key and persistence - no stateless mode
			if (!persist) {
				throw new Error(
					"Stateless mode is not supported. XMTP client must run in persistent mode " +
						"to properly receive and process messages. Set persist: true or remove the persist option " +
						"to use the default persistent mode."
				)
			}

			if (!AGENT_SECRET) {
				throw new Error("AGENT_SECRET must be set for persistent mode")
			}

			const dbEncryptionKey = getEncryptionKeyFromHex(AGENT_SECRET)
			const dbPath = await getDbPath(
				`${XMTP_ENV || "dev"}-${address}`,
				storagePath
			)
			logger.debug(`📁 Using database path: ${dbPath}`)

			// Always create a fresh client and sync it
			const client = await Client.create(signer, {
				dbEncryptionKey,
				env: XMTP_ENV as XmtpEnv,
				dbPath,
				codecs: [
					new ReplyCodec(),
					new ReactionCodec(),
					new WalletSendCallsCodec(),
					new TransactionReferenceCodec()
				]
			})

			// Force sync conversations to ensure we have the latest data
			logger.debug("📡 Syncing conversations to ensure latest state...")
			await client.conversations.sync()

			await backupDbToPersistentStorage(
				dbPath,
				`${XMTP_ENV || "dev"}-${address}`
			)

			console.log(`Wallet: ${address}`)
			console.log(`Env: ${XMTP_ENV || "dev"}`)
			console.log(`Storage: persistent`)

			return client as unknown as XmtpClient
		} catch (error) {
			attempt++

			if (
				error instanceof Error &&
				error.message.includes("5/5 installations")
			) {
				console.log(
					`💥 Installation limit reached (attempt ${attempt}/${maxRetries})`
				)

				if (attempt < maxRetries) {
					// Get wallet address for database clearing
					const identifier = await signer.getIdentifier()
					const address = identifier.identifier

					// Extract inboxId from the error message
					const inboxIdMatch = error.message.match(/InboxID ([a-f0-9]+)/)
					const inboxId = inboxIdMatch ? inboxIdMatch[1] : undefined

					// First try to revoke old installations
					const revocationSuccess = await revokeOldInstallations(
						signer,
						inboxId
					)

					if (revocationSuccess) {
						console.log("🎯 Installations revoked, retrying connection...")
					} else {
						console.log(
							"⚠️ Installation revocation failed or not needed, clearing database..."
						)
						// Clear database as fallback
						await clearXMTPDatabase(address, process.env.XMTP_ENV || "dev")
					}

					// Wait a bit before retrying
					const delay = Math.pow(2, attempt) * 1000 // Exponential backoff
					console.log(`⏳ Waiting ${delay}ms before retry...`)
					await new Promise((resolve) => setTimeout(resolve, delay))
				} else {
					console.error(
						"❌ Failed to resolve installation limit after all retries"
					)
					console.error("💡 Possible solutions:")
					console.error("   1. Use a different wallet (generate new keys)")
					console.error("   2. Switch XMTP environments (dev <-> production)")
					console.error("   3. Wait and try again later")
					console.error("   4. Contact XMTP support for manual intervention")
					throw error
				}
			} else if (
				error instanceof Error &&
				error.message.includes("Association error: Missing identity update")
			) {
				console.log(
					`🔄 Identity association error detected (attempt ${attempt}/${maxRetries})`
				)

				if (attempt < maxRetries) {
					console.log("🔧 Attempting automatic identity refresh...")

					// Try to refresh identity by creating a persistent client first
					try {
						console.log("📝 Creating persistent client to refresh identity...")
						const tempEncryptionKey = AGENT_SECRET
							? getEncryptionKeyFromHex(AGENT_SECRET)
							: getEncryptionKeyFromHex(generateEncryptionKeyHex())
						const tempClient = await Client.create(signer, {
							dbEncryptionKey: tempEncryptionKey,
							env: XMTP_ENV as XmtpEnv,
							dbPath: await getDbPath(
								`${XMTP_ENV || "dev"}-${address}`,
								storagePath
							),
							codecs: [
								new ReplyCodec(),
								new ReactionCodec(),
								new WalletSendCallsCodec(),
								new TransactionReferenceCodec()
							]
						})

						console.log("📡 Syncing identity and conversations...")
						await tempClient.conversations.sync()

						console.log(
							"✅ Identity refresh successful, retrying original request..."
						)

						// Wait a bit before retrying
						const delay = Math.pow(2, attempt) * 1000 // Exponential backoff
						console.log(`⏳ Waiting ${delay}ms before retry...`)
						await new Promise((resolve) => setTimeout(resolve, delay))
					} catch (refreshError) {
						console.log(`❌ Identity refresh failed:`, refreshError)
						// Continue to the retry logic
					}
				} else {
					console.error(
						"❌ Failed to resolve identity association error after all retries"
					)
					console.error(
						"💡 Try running: pnpm with-env pnpm --filter @hybrd/xmtp refresh:identity"
					)
					throw error
				}
			} else {
				// For other errors, don't retry
				throw error
			}
		}
	}

	throw new Error("Max retries exceeded")
}

// ===================================================================
// Encryption Key Management
// ===================================================================
/**
 * Generate a random encryption key
 * @returns The encryption key as a hex string
 */
export const generateEncryptionKeyHex = () => {
	const uint8Array = getRandomValues(new Uint8Array(32))
	return uint8arraysToString(uint8Array, "hex")
}

/**
 * Get the encryption key from a hex string
 * @param hex - The hex string
 * @returns The encryption key as Uint8Array
 */
const getEncryptionKeyFromHex = (hex: string): Uint8Array => {
	return fromString(hex, "hex")
}

// ===================================================================
// Database Path Management
// ===================================================================
export const getDbPath = async (description = "xmtp", storagePath?: string) => {
	// Allow custom storage path via environment variable
	const customStoragePath = process.env.XMTP_STORAGE_PATH

	let volumePath: string

	if (customStoragePath) {
		// Use custom storage path if provided
		volumePath = path.isAbsolute(customStoragePath)
			? customStoragePath
			: path.resolve(process.cwd(), customStoragePath)
	} else if (storagePath) {
		volumePath = path.isAbsolute(storagePath)
			? storagePath
			: path.resolve(process.cwd(), storagePath)
	} else {
		// Use existing logic as fallback
		const projectRoot =
			process.env.PROJECT_ROOT || path.resolve(__dirname, "../../..")

		// Default storage path for local development
		volumePath = path.join(projectRoot, ".data/xmtp")
	}

	const dbPath = `${volumePath}/${description}.db3`

	if (typeof globalThis !== "undefined" && "XMTP_STORAGE" in globalThis) {
		try {
			console.log(`📦 Using Cloudflare R2 storage for: ${dbPath}`)

			const r2Bucket = (globalThis as any).XMTP_STORAGE
			const remotePath = `xmtp-databases/${description}.db3`

			try {
				const existingObject = await r2Bucket.head(remotePath)
				if (existingObject) {
					console.log(`📥 Downloading existing database from R2 storage...`)

					if (!fs.existsSync(volumePath)) {
						fs.mkdirSync(volumePath, { recursive: true })
					}

					const object = await r2Bucket.get(remotePath)
					if (object) {
						const fileData = await object.arrayBuffer()
						fs.writeFileSync(dbPath, new Uint8Array(fileData))
						console.log(`✅ Database downloaded from R2 storage`)
					}
				} else {
					console.log(`📝 No existing database found in R2 storage`)
				}
			} catch (error) {
				console.log(`⚠️ Failed to download database from R2 storage:`, error)
			}
		} catch (error) {
			console.log(`⚠️ R2 storage not available:`, error)
		}
	}

	if (!fs.existsSync(volumePath)) {
		fs.mkdirSync(volumePath, { recursive: true })
	}

	return dbPath
}

const backupDbToPersistentStorage = async (
	dbPath: string,
	description: string
) => {
	if (
		typeof globalThis !== "undefined" &&
		"XMTP_STORAGE" in globalThis &&
		fs.existsSync(dbPath)
	) {
		try {
			console.log(`📦 Backing up database to R2 storage: ${dbPath}`)

			const r2Bucket = (globalThis as any).XMTP_STORAGE
			const remotePath = `xmtp-databases/${description}.db3`

			const fileData = fs.readFileSync(dbPath)
			await r2Bucket.put(remotePath, fileData)
			console.log(`✅ Database backed up to R2 storage: ${remotePath}`)
		} catch (error) {
			console.log(`⚠️ Failed to backup database to R2 storage:`, error)
		}
	}
}

// ===================================================================
// Logging and Debugging
// ===================================================================
export const logAgentDetails = async (
	clients: XmtpClient | XmtpClient[]
): Promise<void> => {
	const clientsByAddress = Array.isArray(clients)
		? clients.reduce<Record<string, XmtpClient[]>>((acc, XmtpClient) => {
				const address = XmtpClient.accountIdentifier?.identifier ?? ""
				acc[address] = acc[address] ?? []
				acc[address].push(XmtpClient)
				return acc
			}, {})
		: {
				[clients.accountIdentifier?.identifier ?? ""]: [clients]
			}

	for (const [address, clientGroup] of Object.entries(clientsByAddress)) {
		const firstClient = clientGroup[0]
		const inboxId = firstClient?.inboxId
		const environments = clientGroup
			.map((c) => c.options?.env ?? "dev")
			.join(", ")
		console.log(`\x1b[38;2;252;76;52m
        ██╗  ██╗███╗   ███╗████████╗██████╗ 
        ╚██╗██╔╝████╗ ████║╚══██╔══╝██╔══██╗
         ╚███╔╝ ██╔████╔██║   ██║   ██████╔╝
         ██╔██╗ ██║╚██╔╝██║   ██║   ██╔═══╝ 
        ██╔╝ ██╗██║ ╚═╝ ██║   ██║   ██║     
        ╚═╝  ╚═╝╚═╝     ╚═╝   ╚═╝   ╚═╝     
      \x1b[0m`)

		const urls = [`http://xmtp.chat/dm/${address}`]

		const conversations = await firstClient?.conversations.list()

		console.log(`
    ✓ XMTP XmtpClient:
    • Address: ${address}
    • Conversations: ${conversations?.length}
    • InboxId: ${inboxId}
    • Networks: ${environments}
    ${urls.map((url) => `• URL: ${url}`).join("\n")}`)
	}
}

// ===================================================================
// Environment Validation
// ===================================================================
export function validateEnvironment(vars: string[]): Record<string, string> {
	const missing = vars.filter((v) => !process.env[v])

	if (missing.length) {
		try {
			const envPath = path.resolve(process.cwd(), ".env")
			if (fs.existsSync(envPath)) {
				const envVars = fs
					.readFileSync(envPath, "utf-8")
					.split("\n")
					.filter((line) => line.trim() && !line.startsWith("#"))
					.reduce<Record<string, string>>((acc, line) => {
						const [key, ...val] = line.split("=")
						if (key && val.length) acc[key.trim()] = val.join("=").trim()
						return acc
					}, {})

				missing.forEach((v) => {
					if (envVars[v]) process.env[v] = envVars[v]
				})
			}
		} catch (e) {
			console.error(e)
			/* ignore errors */
		}

		const stillMissing = vars.filter((v) => !process.env[v])
		if (stillMissing.length) {
			console.error("Missing env vars:", stillMissing.join(", "))
			process.exit(1)
		}
	}

	return vars.reduce<Record<string, string>>((acc, key) => {
		acc[key] = process.env[key] as string
		return acc
	}, {})
}

/**
 * Diagnose XMTP environment and identity issues (internal use only)
 */
async function diagnoseXMTPIdentityIssue(
	client: XmtpClient,
	inboxId: string,
	environment: string
): Promise<{
	canResolve: boolean
	suggestions: string[]
	details: Record<string, any>
}> {
	const suggestions: string[] = []
	const details: Record<string, any> = {
		environment,
		inboxId,
		timestamp: new Date().toISOString()
	}

	try {
		// Try to resolve the inbox state
		const inboxState = await client.preferences.inboxStateFromInboxIds([
			inboxId
		])

		if (inboxState.length === 0) {
			suggestions.push(
				`Inbox ID ${inboxId} not found in ${environment} environment`
			)
			suggestions.push(
				"Try switching XMTP_ENV to 'dev' if currently 'production' or vice versa"
			)
			suggestions.push(
				"Verify the user has created an identity on this XMTP network"
			)
			details.inboxStateFound = false
			return { canResolve: false, suggestions, details }
		}

		const inbox = inboxState[0]
		if (!inbox) {
			suggestions.push("Inbox state returned empty data")
			details.inboxStateFound = false
			return { canResolve: false, suggestions, details }
		}

		details.inboxStateFound = true
		details.identifierCount = inbox.identifiers?.length || 0

		if (!inbox.identifiers || inbox.identifiers.length === 0) {
			suggestions.push("Inbox found but has no identifiers")
			suggestions.push("This indicates incomplete identity registration")
			suggestions.push("User may need to re-register their identity on XMTP")
			details.hasIdentifiers = false
			return { canResolve: false, suggestions, details }
		}

		// Successfully resolved
		details.hasIdentifiers = true
		details.resolvedAddress = inbox.identifiers[0]?.identifier
		return {
			canResolve: true,
			suggestions: ["Identity resolved successfully"],
			details
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		details.error = errorMessage

		if (errorMessage.includes("Association error")) {
			suggestions.push("XMTP identity association error detected")
			suggestions.push(
				"Check if user exists on the correct XMTP environment (dev vs production)"
			)
			suggestions.push(
				"Identity may need to be recreated on the current environment"
			)
		}

		if (errorMessage.includes("Missing identity update")) {
			suggestions.push("Missing identity updates in XMTP network")
			suggestions.push("This can indicate network sync issues")
			suggestions.push("Wait a few minutes and retry, or recreate identity")
		}

		if (errorMessage.includes("database") || errorMessage.includes("storage")) {
			suggestions.push("XMTP local database/storage issue")
			suggestions.push("Try clearing XMTP database and resyncing")
			suggestions.push("Check .data/xmtp directory permissions")
		}

		suggestions.push("Consider testing with a fresh XMTP identity")
		return { canResolve: false, suggestions, details }
	}
}

// ===================================================================
// Enhanced Connection Management & Health Monitoring
// ===================================================================

export interface XMTPConnectionConfig {
	maxRetries?: number
	retryDelayMs?: number
	healthCheckIntervalMs?: number
	connectionTimeoutMs?: number
	reconnectOnFailure?: boolean
}

export interface XMTPConnectionHealth {
	isConnected: boolean
	lastHealthCheck: Date
	consecutiveFailures: number
	totalReconnects: number
	avgResponseTime: number
}

export class XMTPConnectionManager {
	private client: XmtpClient | null = null
	private privateKey: string
	private config: Required<XMTPConnectionConfig>
	private health: XMTPConnectionHealth
	private healthCheckTimer: NodeJS.Timeout | null = null
	private isReconnecting = false

	constructor(privateKey: string, config: XMTPConnectionConfig = {}) {
		this.privateKey = privateKey
		this.config = {
			maxRetries: config.maxRetries ?? 5,
			retryDelayMs: config.retryDelayMs ?? 1000,
			healthCheckIntervalMs: config.healthCheckIntervalMs ?? 30000,
			connectionTimeoutMs: config.connectionTimeoutMs ?? 10000,
			reconnectOnFailure: config.reconnectOnFailure ?? true
		}

		this.health = {
			isConnected: false,
			lastHealthCheck: new Date(),
			consecutiveFailures: 0,
			totalReconnects: 0,
			avgResponseTime: 0
		}
	}

	async connect(persist = false): Promise<XmtpClient> {
		if (this.client && this.health.isConnected) {
			return this.client
		}

		let attempt = 0
		while (attempt < this.config.maxRetries) {
			try {
				console.log(
					`🔄 XMTP connection attempt ${attempt + 1}/${this.config.maxRetries}`
				)

				this.client = await createXMTPClient(this.privateKey, { persist })
				this.health.isConnected = true
				this.health.consecutiveFailures = 0

				// Start health monitoring
				this.startHealthMonitoring()

				console.log("✅ XMTP client connected successfully")
				return this.client
			} catch (error) {
				attempt++
				this.health.consecutiveFailures++

				console.error(`❌ XMTP connection attempt ${attempt} failed:`, error)

				if (attempt < this.config.maxRetries) {
					const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1)
					console.log(`⏳ Retrying in ${delay}ms...`)
					await this.sleep(delay)
				}
			}
		}

		throw new Error(
			`Failed to connect to XMTP after ${this.config.maxRetries} attempts`
		)
	}

	// private async createClientWithTimeout(persist: boolean): Promise<XmtpClient> {
	//   const timeoutPromise = new Promise<never>((_, reject) => {
	//     setTimeout(
	//       () => reject(new Error("Connection timeout")),
	//       this.config.connectionTimeoutMs
	//     )
	//   })

	//   const clientPromise = createXMTPClient(this.signer, { persist })

	//   return Promise.race([clientPromise, timeoutPromise])
	// }

	private startHealthMonitoring(): void {
		if (this.healthCheckTimer) {
			clearInterval(this.healthCheckTimer)
		}

		this.healthCheckTimer = setInterval(() => {
			this.performHealthCheck()
		}, this.config.healthCheckIntervalMs)
	}

	private async performHealthCheck(): Promise<void> {
		if (!this.client) return

		const startTime = Date.now()

		try {
			// Simple health check: try to list conversations
			await this.client.conversations.list()

			const responseTime = Date.now() - startTime
			this.health.avgResponseTime =
				(this.health.avgResponseTime + responseTime) / 2
			this.health.lastHealthCheck = new Date()
			this.health.consecutiveFailures = 0
			this.health.isConnected = true

			console.log(`💓 XMTP health check passed (${responseTime}ms)`)
		} catch (error) {
			this.health.consecutiveFailures++
			this.health.isConnected = false

			console.error(`💔 XMTP health check failed:`, error)

			// Trigger reconnection if enabled
			if (this.config.reconnectOnFailure && !this.isReconnecting) {
				this.handleConnectionFailure()
			}
		}
	}

	private async handleConnectionFailure(): Promise<void> {
		if (this.isReconnecting) return

		this.isReconnecting = true
		this.health.totalReconnects++

		console.log("🔄 XMTP connection lost, attempting to reconnect...")

		try {
			this.client = null
			await this.connect()
			console.log("✅ XMTP reconnection successful")
		} catch (error) {
			console.error("❌ XMTP reconnection failed:", error)
		} finally {
			this.isReconnecting = false
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	getHealth(): XMTPConnectionHealth {
		return { ...this.health }
	}

	getClient(): XmtpClient | null {
		return this.client
	}

	async disconnect(): Promise<void> {
		if (this.healthCheckTimer) {
			clearInterval(this.healthCheckTimer)
			this.healthCheckTimer = null
		}

		this.client = null
		this.health.isConnected = false
		console.log("🔌 XMTP client disconnected")
	}
}

// Enhanced client creation with connection management
export async function createXMTPConnectionManager(
	privateKey: string,
	config?: XMTPConnectionConfig
): Promise<XMTPConnectionManager> {
	const manager = new XMTPConnectionManager(privateKey, config)
	await manager.connect()
	return manager
}

// ===================================================================
// User Address Resolution with Auto-Refresh
// ===================================================================
