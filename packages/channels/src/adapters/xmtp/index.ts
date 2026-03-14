import fs from "node:fs"
import path from "node:path"
import { resolveAgentSecret } from "@hybrd/xmtp"
import { readACLAllowFrom } from "@hybrid/memory"
import { createUser } from "@xmtp/agent-sdk"
import pc from "picocolors"
import { type XMTPAdapterConfig } from "./adapter.js"

const log = {
	info: (msg: string) => console.log(`${pc.magenta("[xmtp]")} ${msg}`),
	error: (msg: string) => console.error(`${pc.red("[xmtp]")} ${msg}`),
	warn: (msg: string) => console.log(`${pc.yellow("[xmtp]")} ${msg}`),
	success: (msg: string) => console.log(`${pc.green("[xmtp]")} ${msg}`)
}

const AGENT_PORT = process.env.AGENT_PORT || "8454"
const XMTP_ENV = (process.env.XMTP_ENV || "dev") as "dev" | "production"
const XMTP_ADAPTER_PORT = Number.parseInt(
	process.env.XMTP_ADAPTER_PORT || "8455",
	10
)

process.on("uncaughtException", (err) => {
	log.error(`FATAL: ${err.message}`)
	process.exit(1)
})

process.on("unhandledRejection", (reason) => {
	log.error(`FATAL: ${reason}`)
	process.exit(1)
})

function printBanner(walletAddress?: string, aclCount?: number) {
	const isHotReload = process.env.TSX_WATCH === "true"

	console.log("")
	console.log(
		pc.magenta("  ╭───────────────────────────────────────────────────╮")
	)
	console.log(
		pc.magenta("  │") +
			pc.bold(pc.white("      XMTP Channel Adapter")) +
			pc.magenta("                       │")
	)
	console.log(
		pc.magenta("  ╰───────────────────────────────────────────────────╯")
	)
	console.log("")
	console.log(
		`  ${pc.bold("Network")}    ${XMTP_ENV === "production" ? pc.green("production") : pc.cyan("dev")}`
	)
	console.log(
		`  ${pc.bold("Wallet")}     ${walletAddress ? pc.cyan(walletAddress) : pc.gray("(not configured)")}`
	)
	console.log(`  ${pc.bold("Agent")}      http://localhost:${AGENT_PORT}`)
	console.log(
		`  ${pc.bold("Trigger")}    http://127.0.0.1:${XMTP_ADAPTER_PORT}/api/trigger`
	)
	if (aclCount !== undefined) {
		const aclStatus =
			aclCount > 0
				? pc.green(`${aclCount} allowed`)
				: pc.yellow("open (no allowlist)")
		console.log(`  ${pc.bold("ACL")}        ${aclStatus}`)
	}
	console.log("")

	if (isHotReload) {
		console.log(
			`  ${pc.yellow("⚡")} Hot reload enabled - watching for changes...`
		)
	} else {
		console.log(`  ${pc.green("✓")} Listening for messages...`)
	}
	console.log("")
}

async function start() {
	const key = process.env.AGENT_WALLET_KEY

	if (!key) {
		log.warn("AGENT_WALLET_KEY not set")
		printBanner()
		await new Promise(() => {})
		return
	}

	const user = createUser(key as `0x${string}`)

	// Read ACL count for banner
	let aclCount: number | undefined
	try {
		const allowFrom = await readACLAllowFrom(process.cwd())
		aclCount = allowFrom.length
	} catch {
		// ACL doesn't exist yet, that's fine
		aclCount = 0
	}

	printBanner(user.account.address, aclCount)

	const secret = resolveAgentSecret(key)
	const dbEncryptionKey = new Uint8Array(Buffer.from(secret, "hex"))

	const dbDir = path.join(process.cwd(), ".hybrid", ".xmtp")
	if (!fs.existsSync(dbDir)) {
		fs.mkdirSync(dbDir, { recursive: true })
	}
	const dbPath = path.join(
		dbDir,
		`xmtp-${XMTP_ENV}-${user.account.address.toLowerCase().slice(0, 8)}.db3`
	)

	const config: XMTPAdapterConfig = {
		port: XMTP_ADAPTER_PORT,
		agentUrl: `http://localhost:${AGENT_PORT}`,
		xmtpEnv: XMTP_ENV,
		walletKey: key as `0x${string}`,
		dbEncryptionKey,
		dbPath,
		workspaceDir: process.cwd()
	}

	await import("./adapter.js").then(({ createXMTPAdapter }) =>
		createXMTPAdapter(config)
	)
}

start().catch((e) => {
	log.error(e.message)
	process.exit(1)
})

export {
	XMTPAdapter,
	type XMTPAdapterConfig,
	createXMTPAdapter
} from "./adapter.js"
