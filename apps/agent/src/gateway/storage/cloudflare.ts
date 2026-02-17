import type { Sandbox } from "@cloudflare/sandbox"
import { DEFAULT_MOUNTS } from "./types"

export interface CloudflareStorageEnv {
	CLOUDFLARE_R2_ACCOUNT_ID: string
	CLOUDFLARE_R2_ACCESS_KEY_ID: string
	CLOUDFLARE_R2_SECRET_ACCESS_KEY: string
	CLOUDFLARE_R2_BUCKET_NAME: string
}

export async function mountR2Storage(
	sandbox: Sandbox,
	env: CloudflareStorageEnv,
): Promise<void> {
	const endpoint = `https://${env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
	const credentials = {
		accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
		secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
	}

	await sandbox.mountBucket(env.CLOUDFLARE_R2_BUCKET_NAME, DEFAULT_MOUNTS.documents.path, {
		endpoint,
		credentials,
		readOnly: DEFAULT_MOUNTS.documents.readOnly,
		prefix: "docs/",
	})

	await sandbox.mountBucket(env.CLOUDFLARE_R2_BUCKET_NAME, DEFAULT_MOUNTS.artifacts.path, {
		endpoint,
		credentials,
		readOnly: DEFAULT_MOUNTS.artifacts.readOnly,
		prefix: "artifacts/",
	})
}
