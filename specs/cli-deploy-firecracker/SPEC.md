# CLI Deploy: Firecracker microVM Providers

## Overview

Hybrid agents deploy to **Firecracker microVMs** that sleep when idle and wake on demand to handle incoming messages. User picks their Firecracker provider at deploy time via `hybrid deploy [platform]`.

> **Related:** [HYBRID-140](https://linear.app/01studio/issue/HYBRID-140) — Phase 4: Firecracker microVM deployment (sleep/wake agents)

---

## Supported Platforms

| Provider       | CLI/SDK       | Sleep             | Wake                  | Notes                          |
|----------------|---------------|-------------------|-----------------------|--------------------------------|
| `sprites`      | `sprite` CLI  | `sprite sleep`    | `sprite exec` (proxy) | Reference implementation (T1)  |
| `e2b`          | `@e2b/sdk`    | `sandbox.pause()` | `sandbox.resume()`    | Native pause/resume (T1)       |
| `daytona`      | `daytona` CLI | `daytona stop`    | `daytona start`       | Slow wake ~30s (T2)            |
| `northflank`   | `nf` CLI      | auto-scale to 0   | inbound request       | Platform-managed (T1)          |

**Priority order:**
1. **sprites** — already partially implemented (PR #150), extract and formalize
2. **e2b** — strong SDK, best dev experience after sprites
3. **northflank** — production-grade, auto-scale-to-zero
4. **daytona** — dev-environment oriented, slowest wake

---

## Architecture

### Directory Structure

```
packages/cli/src/deploy/
├── deploy-provider.ts    # DeployProvider interface, types, shared utilities
├── deploy.ts             # Unified deploy orchestration (pick provider → build → provision → deploy → sleep)
├── providers/
│   ├── sprite.provider.ts     # sprites.dev adapter
│   ├── e2b.provider.ts        # e2b.dev adapter
│   ├── northflank.provider.ts # northflank adapter
│   └── daytona.provider.ts    # daytona.io adapter
└── index.ts              # Re-exports
```

The main CLI (`cli.ts`) delegates to `deploy()` with the platform string. No platform logic lives in `cli.ts`.

### DeployProvider Interface

```typescript
export interface DeployProvider {
  /** Unique provider identifier: "sprites" | "e2b" | "northflank" | "daytona" */
  readonly name: string;

  /** Human-readable label for CLI prompts */
  readonly label: string;

  /** Default instance name when user doesn't specify one */
  defaultName(projectDir: string): string;

  /**
   * Verify prerequisites: CLI installed, authenticated, accessible.
   * Throws with a helpful message if requirements aren't met.
   */
  authCheck(): Promise<void>;

  /**
   * Provision a new Firecracker microVM.
   * Returns an instance ID or name used for subsequent operations.
   */
  provision(name: string, opts?: ProvisionOpts): Promise<string>;

  /**
   * Push the built agent bundle (from distDir) into the running VM.
   * Handles uploading, extracting, installing deps.
   */
  deploy(instanceId: string, distDir: string): Promise<void>;

  /**
   * Return current lifecycle state of the instance.
   */
  status(instanceId: string): Promise<InstanceStatus>;

  /**
   * Put the VM to sleep (pause, stop, or scale-to-zero depending on provider).
   */
  sleep(instanceId: string): Promise<void>;

  /**
   * Wake the VM from sleep (resume, start, or trigger cold start).
   */
  wake(instanceId: string): Promise<void>;

  /**
   * Stream logs from the agent process.
   */
  logs(instanceId: string, follow?: boolean): Promise<void>;

  /**
   * Return the public-facing endpoint URL for the agent.
   */
  endpoint(instanceId: string): Promise<string>;

  /**
   * Destroy the VM and all associated resources.
   */
  teardown(instanceId: string): Promise<void>;
}

export interface ProvisionOpts {
  /** Memory in MB (provider-specific defaults if omitted) */
  memory?: number;
  /** vCPU count (provider-specific defaults if omitted) */
  cpus?: number;
  /** Environment variables to set on the instance */
  env?: Record<string, string>;
}

export type InstanceStatus =
  | "running"
  | "sleeping"
  | "stopped"
  | "provisioning"
  | "error"
  | "unknown";
```

### Deploy Orchestration (`deploy.ts`)

```
deploy(platform?)
  ├─ resolve platform (arg → hybrid.config.ts → interactive prompt)
  ├─ load provider by name
  ├─ provider.authCheck()     → bail if not ready
  ├─ build("firecracker")     → produce dist/
  ├─ pick instance name       (ENV → config → default)
  ├─ provider.status(name)
  │   ├─ running   → confirm reuse or force recreate
  │   └─ otherwise → provider.provision(name)
  ├─ provider.deploy(instanceId, distDir)
  └─ provider.endpoint(instanceId) → print URLs + next steps
```

### CLI Commands Added/Modified

```
hybrid deploy [platform]              Deploy to a Firecracker provider
hybrid deploy:sleep <name> [--provider sprites|e2b|...]   Put VM to sleep
hybrid deploy:wake <name>  [--provider sprites|e2b|...]   Wake VM
hybrid deploy:status <name> [--provider sprites|e2b|...]  Show VM status
hybrid deploy:logs <name> [--provider sprites|e2b|...]    Stream agent logs
hybrid deploy:teardown <name> [--all]                     Destroy VM(s)
```

Platform can be pre-selected in `hybrid.config.ts`:
```typescript
export const config = {
  deploy: {
    platform: "sprites",  // default provider
    spriteName: "my-agent", // optional instance name override
  },
}
```

Flags: `--provider <name>`, `--name <instance>`, `--force` (recreate), `--no-build` (skip build step).

---

## Provider Implementations

### 1. sprites (`sprite.provider.ts`)

**Current state:** Already implemented inline in `cli.ts` (PR #150). Needs extraction.

**Key commands:**
| Operation   | Command                                           |
|-------------|---------------------------------------------------|
| auth check  | `sprite list` (fails if not installed/authed)     |
| provision   | `sprite create -skip-console <name>`              |
| deploy      | `sprite exec -s <name> -file <tar>:/tmp/...` → extract |
| status      | `sprite list` → parse state                       |
| sleep       | `sprite sleep <name>`                             |
| wake        | `sprite exec -s <name> -- echo` (proxy wakes VM) |
| logs        | `sprite logs -s <name> -f`                        |
| endpoint    | `https://<name>.sprites.dev`                      |
| teardown    | `sprite delete <name>`                            |

**Sleep/wake model:** Sprite proxy auto-wakes on `sprite exec`. The `sprite sleep` command pauses the VM. Wake is near-instant (< 2s).

**Implementation notes:**
- Refactor existing `deploy()` code from `cli.ts` into this provider
- Extract the retry logic, tar upload, and health-check polling into reusable helpers
- Keep the `deploy()` shell script generation — useful for CI/CD

### 2. e2b (`e2b.provider.ts`)

**Key SDK calls:**
| Operation   | SDK Call                                          |
|-------------|---------------------------------------------------|
| auth check  | Check `E2B_ACCESS_TOKEN` env var                 |
| provision   | `Sandbox.create({ sandboxId: templateId })`       |
| deploy      | `sandbox.commands.run(...)` or `sandbox.files.write(...)` |
| status      | `sandbox.list()` → find by ID                    |
| sleep       | `sandbox.pause()`                                 |
| wake        | `Sandbox.resume(sandboxId)`                       |
| logs        | `sandbox.commands.run("cat /app/agent.log")`      |
| endpoint    | `sandbox.getHost(port)`                           |
| teardown    | `sandbox.kill()`                                  |

**Sleep/wake model:** First-class pause/resume in the SDK. State preserved in memory (sandbox filesystem). Wake is near-instant.

**Implementation notes:**
- Requires `@e2b/sdk` as an optional peer dependency
- Create a E2B sandbox template with agent pre-installed for faster cold starts
- The e2b CLI also works if the SDK isn't preferred

### 3. northflank (`northflank.provider.ts`)

**Key CLI commands:**
| Operation   | Command                                           |
|-------------|---------------------------------------------------|
| auth check  | `nf auth whoami`                                  |
| provision   | `nf services create` (via API for Firecracker backend) |
| deploy      | Push Docker image or `nf deploy`                  |
| status      | `nf services get <serviceId>`                     |
| sleep       | Scale replicas → 0                                |
| wake        | Scale replicas → 1 (or inbound request triggers)  |
| logs        | `nf services logs <serviceId> -f`                 |
| endpoint    | From service metadata                             |
| teardown    | `nf services delete <serviceId>`                  |

**Sleep/wake model:** Auto-scale-to-zero handled by the platform. First request after idle triggers a cold start (~5-15s).

**Implementation notes:**
- Northflank uses Docker images, so `hybrid build` needs to produce an image or the CLI builds it
- May need to use the NF API directly for Firecracker-backed services (not all CLI features support it)
- Persistent volumes survive scale-to-zero

### 4. daytona (`daytona.provider.ts`)

**Key CLI commands:**
| Operation   | Command                                           |
|-------------|---------------------------------------------------|
| auth check  | `daytona info`                                    |
| provision   | `daytona create --image node:20`                  |
| deploy      | `daytona ssh` + tar upload + extract              |
| status      | `daytona list` → parse state                      |
| sleep       | `daytona stop <name>`                             |
| wake        | `daytona start <name>`                            |
| logs        | `daytona logs <name>`                             |
| endpoint    | `daytona ports <name>`                            |
| teardown    | `daytona delete <name>`                           |

**Sleep/wake model:** Full stop/start. Wake is slow (~30s). Designed for dev environments, not serverless workloads.

**Implementation notes:**
- Daytona creates dev workspaces, not serverless functions
- Least aligned with the sleep/wake model — mark as "experimental" initially
- Still useful for local/dev scenarios where the user wants isolation

---

## Build Changes

### Current state
- `hybrid build [--target]` defaults to `firecracker`
- Already generates: `package.json`, `Dockerfile`, `start.sh`
- Generates a sprites-specific `deploy.sh` (to be removed)

### Changes needed

1. **Remove `deploy.sh`** from `build()` — each provider generates its own deploy artifacts
2. **Keep Dockerfile generic** for providers that use images (northflank, sprites can use it too)
3. **Add provider manifest** to build output — a small JSON file with provider-specific config:

```json
// dist/.hybrid-deploy.json
{
  "version": 1,
  "provider": "firecracker",
  "startCommand": "node server/index.cjs",
  "port": 8454,
  "healthPath": "/health"
}
```

---

## Sleep/Wake Trigger Flow

For the "wake on message" model to work, there needs to be a proxy/forwarder that:

1. Receives an incoming message (webhook, API call, chat event)
2. Calls `provider.wake(instanceId)` if the VM is asleep
3. Polls `provider.status(instanceId)` until "running"
4. Forwards the message to the agent endpoint
5. After idle timeout, calls `provider.sleep(instanceId)`

This is a **separate concern** from `hybrid deploy` — it's the **webhook gateway** service. Documented separately in `specs/webhook-gateway.md`.

What `hybrid deploy` does:
- Provision the VM with the right config to receive wake signals
- Set up the agent to handle the health/webhook endpoint
- Provide sleep/wake CLI commands for manual control
- Configure idle-timeout for auto-sleep (provider-specific)

---

## Error Handling & UX

### Provider not installed
```
❌ 'sprite' CLI not found.
   Install it: brew install sprites/tap/sprite
   Or: https://sprites.dev/docs/install
```

### Provider not authenticated
```
❌ Not authenticated with E2B.
   Run: export E2B_ACCESS_TOKEN=your_token
   Or: https://e2b.dev/docs/getting-started
```

### Deploy failure with retry
```
📤 Uploading build artifacts...
   Upload failed, retrying... (1/3)
   Upload failed, retrying... (2/3)
   ✅ Uploaded (3 retries)
```

### Instance name taken
```
⚠️  Instance 'my-agent' already exists.
   Use it? [Y/n]
   → Re-deploy (overwrite)
   → Create with new name
   → Cancel
```

---

## Testing Strategy

### Unit tests
- Mock `execFileSync` / `spawn` for CLI-based providers
- Mock SDK calls for e2b provider
- Test provider interface contract with a mock provider

### Integration tests
- Require real `sprite` CLI installed for sprite provider tests
- Skip if CLI not found (`describe.skipIf(!hasCli(...))`)
- E2E: `deploy → status → sleep → wake → logs → teardown`

### Manual test matrix
| Provider  | Deploy | Sleep | Wake | Logs | Status | Teardown |
|-----------|--------|-------|------|------|--------|----------|
| sprites   | ✅     | ✅    | ✅   | ✅   | ✅     | ✅       |
| e2b       |        |       |      |      |        |          |
| northflank|        |       |      |      |        |          |
| daytona   |        |       |      |      |        |          |

---

## Implementation Plan

### Phase 4a — Extract sprites provider (current PR #150 cleanup)
- [ ] Create `DeployProvider` interface in `deploy-provider.ts`
- [ ] Create `deploy.ts` orchestration
- [ ] Extract sprites logic from `cli.ts` → `sprite.provider.ts`
- [ ] Refactor `cli.ts` `deploy()` to use provider interface
- [ ] Add `deploy:sleep`, `deploy:wake`, `deploy:status`, `deploy:logs` subcommands
- [ ] Add `deploy:teardown` command
- [ ] Remove hardcoded `deploy.sh` from `build()`
- [ ] Update `hybrid.config.ts` schema

### Phase 4b — E2B provider
- [ ] Implement `e2b.provider.ts`
- [ ] Add `@e2b/sdk` as optional peer dep
- [ ] Integration tests with e2b sandbox
- [ ] Create base E2B template with agent pre-installed

### Phase 4c — Northflank provider
- [ ] Implement `northflank.provider.ts`
- [ ] Docker image build path for northflank
- [ ] Integration tests

### Phase 4d — Daytona provider
- [ ] Implement `daytona.provider.ts`
- [ ] Mark as experimental in CLI
- [ ] Basic integration tests

---

## Related Files

| File                    | Purpose                                      |
|-------------------------|----------------------------------------------|
| `packages/cli/src/cli.ts` | Main CLI entry (will delegate to `deploy/`) |
| `packages/cli/src/deploy/` | Deploy provider system (new)              |
| `ian/spawn/manifest.json` | Spawn agent registry (sprites)             |
| `ian/spawn/installers/hybrid.sh` | Spawn installer shim              |
| `deployments/spawn/Dockerfile` | Firecracker agent image              |
| `specs/sprites/`        | Sprites two-Sprite architecture spec         |
| `hybrid.config.ts`      | Project-level config (platform, instance name)|
