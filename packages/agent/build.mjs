import * as esbuild from "esbuild"
import { cpSync, mkdirSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const outdir = join(__dirname, "dist")

mkdirSync(outdir, { recursive: true })

async function build() {
  // Build server/simple.ts
  await esbuild.build({
    entryPoints: [join(__dirname, "src/server/simple.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    outfile: join(outdir, "server/simple.cjs"),
    format: "cjs",
    external: ["viem"],
  })

  // Build server/index.ts
  await esbuild.build({
    entryPoints: [join(__dirname, "src/server/index.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    outfile: join(outdir, "server/index.cjs"),
    format: "cjs",
    external: ["viem", "@anthropic-ai/claude-code", "@anthropic-ai/claude-agent-sdk"],
  })

  // Build xmtp.ts
  await esbuild.build({
    entryPoints: [join(__dirname, "src/xmtp.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    outfile: join(outdir, "xmtp.cjs"),
    format: "cjs",
    external: ["viem", "@xmtp/agent-sdk"],
  })

  console.log("Built agent to dist/")
}

build()
