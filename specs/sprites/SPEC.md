# Sprites Architecture Specification

## Overview

Two-Sprite architecture providing zero-knowledge encryption for AI agent platforms. Agent Sprite runs the user's AI agent with full filesystem access, while Vault Sprite holds encryption keys in memory-only, accessible only via HTTP API.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    YOUR PLATFORM                                           │
│                                                                                           │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────────────────┐ │
│  │  Orchestration  │    │    Database     │    │         User Dashboard              │ │
│  │  • Create Sprites    │  • User metadata    │  • Sign in with wallet              │ │
│  │  • List Sprites     │  • Billing data     │  • View agent activity              │ │
│  │  • Manage lifecycle │  • Sprite state     │  • Configure settings                │ │
│  └────────┬────────┘    └────────┬────────┘    └──────────────────┬──────────────────┘ │
│           │                      │                                 │                     │
└───────────│──────────────────────│─────────────────────────────────│─────────────────────┘
            │                      │                                 │
            │    SPRITES API       │                                 │
            ▼                      ▼                                 ▼
    ┌─────────────────────────────────────────────────────────────────────────────────────┐
    │                         SPRITES INFRASTRUCTURE                                       │
    │                              (per-user)                                              │
    │                                                                                    │
    │   ┌─────────────────────────────────────────────────────────────────────────────┐   │
    │   │                           AGENT SPRITE                                      │   │
    │   │   ┌─────────────────────────────────────────────────────────────────────┐  │   │
    │   │   │                     User's AI Agent                                 │  │   │
    │   │   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │  │   │
    │   │   │  │ Claude Code │  │  Sessions   │  │   Tools    │  │ Plugins  │ │  │   │
    │   │   │  │  (can do   │  │  (encrypted)│  │            │  │          │ │  │   │
    │   │   │  │ anything!)  │  │             │  │            │  │          │ │  │   │
    │   │   │  └─────────────┘  └──────┬──────┘  └─────────────┘  └──────────┘ │  │   │
    │   │   │                          │                                   │  │   │
    │   │   │                          ▼                                   │  │   │
    │   │   │                  ┌───────────────┐                           │  │   │
    │   │   │                  │ AgentStorage  │                           │  │   │
    │   │   │                  │  (wrapper)    │                           │  │   │
    │   │   │                  └───────┬───────┘                           │  │   │
    │   │   │                          │                                   │  │   │
    │   │   └──────────────────────────│───────────────────────────────────┘  │   │
    │   │                              │                                       │   │
    │   │   /home/sprite/agent/  ◄────┘                                       │   │
    │   │   ├── workspace/       (filesystem access)                          │   │
    │   │   ├── sessions/        (encrypted by Vault)                        │   │
    │   │   ├── data/            (encrypted by Vault)                        │   │
    │   │   └── ...                                                         │   │
    │   │                                                                      │   │
    │   └──────────────────────────────────────────────────────────────────────┘   │
    │                                       │                                         │
    │                                       │ HTTP (API only)                        │
    │                                       │ No filesystem access                   │
    │                                       ▼                                         │
    │   ┌──────────────────────────────────────────────────────────────────────┐   │
    │   │                           VAULT SPRITE                                │   │
    │   │   ┌────────────────────────────────────────────────────────────────┐  │   │
    │   │   │                      Vault Service                           │  │   │
    │   │   │                                                                 │  │   │
    │   │   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │  │   │
    │   │   │   │  /encrypt   │  │  /decrypt   │  │   /sign     │           │  │   │
    │   │   │   │  endpoint   │  │  endpoint   │  │  endpoint   │           │  │   │
    │   │   │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘           │  │   │
    │   │   │          │                 │                 │                   │  │   │
    │   │   │          └─────────────────┼─────────────────┘                   │  │   │
    │   │   │                            ▼                                    │  │   │
    │   │   │                    ┌───────────────┐                            │  │   │
    │   │   │                    │  Key Manager  │                            │  │   │
    │   │   │                    │  (IN MEMORY)  │                            │  │   │
    │   │   │                    │               │                            │  │   │
    │   │   │                    │  • Keys only  │                            │  │   │
    │   │   │                    │    in RAM      │                            │  │   │
    │   │   │                    │  • Never to   │                            │  │   │
    │   │   │                    │    disk        │                            │  │   │
    │   │   │                    │  • Lost on    │                            │  │   │
    │   │   │                    │    restart    │                            │  │   │
    │   │   │                    └───────────────┘                            │  │   │
    │   │   │                                                                 │  │   │
    │   │   └────────────────────────────────────────────────────────────────┘  │   │
    │   │                                                                      │   │
    │   └──────────────────────────────────────────────────────────────────────┘   │
    │                                                                                    │
    └──────────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              USER ONBOARDING                                            │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  1. User connects wallet                                                                 │
│     ┌──────────┐     ┌────────────────┐     ┌──────────────────┐                      │
│     │  Wallet  │────►│  Your Platform │────►│  Generate random │                      │
│     │          │     │                │     │  challenge       │                      │
│     └──────────┘     └────────────────┘     └──────────────────┘                      │
│                                                                          │             │
│  2. User signs challenge                                                 ▼             │
│     ┌──────────┐     ┌────────────────┐     ┌──────────────────┐                      │
│     │  Wallet  │────►│  Your Platform │────►│  Derive key:    │                      │
│     │          │     │                │     │  key = hash(sig)│                      │
│     └──────────┘     └────────────────┘     └──────────────────┘                      │
│                                                                          │             │
│  3. Provision Sprites                                                     ▼             │
│     ┌────────────────┐     ┌────────────────┐     ┌──────────────────┐                  │
│     │  Your Platform │────►│   Create       │────►│   Initialize    │                  │
│     │                │     │  Vault Sprite  │     │  Vault with key │                  │
│     └────────────────┘     └────────────────┘     └──────────────────┘                  │
│                                                                          │             │
│                                              ┌────────────────┐                            │
│                                              │   Create       │                            │
│                                              │  Agent Sprite │                            │
│                                              └────────────────┘                            │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              AGENT OPERATION                                             │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  Save session (encrypted):                                                               │
│  ┌────────────┐    ┌─────────────┐    ┌─────────────┐    ┌────────────────────┐        │
│  │   Agent    │───►│ AgentStorage│───►│   Vault     │───►│  Encrypt with     │        │
│  │   asks to  │    │   calls    │    │   /encrypt │    │  key (in memory)  │        │
│  │  save data │    │   Vault    │    │   endpoint │    │                   │        │
│  └────────────┘    └─────────────┘    └─────────────┘    └────────────────────┘        │
│                                              │                                         │
│                                              ▼                                         │
│                                    ┌─────────────────┐                                  │
│                                    │  Return        │                                  │
│                                    │  encrypted     │                                  │
│                                    │  blob          │                                  │
│                                    └─────────────────┘                                  │
│                                              │                                         │
│  ┌────────────┐    ┌─────────────┐          │                                          │
│  │   Write    │◄───│   Agent     │◄────────┘                                          │
│  │  to disk   │    │  receives   │                                               │
│  │  (encrypted│    │  encrypted  │                                               │
│  │   blob)    │    │  blob       │                                               │
│  └────────────┘    └─────────────┘                                               │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                COLD START                                               │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  1. User request hits Agent Sprite                                                    │
│     ┌──────────┐     ┌────────────────┐                                                │
│     │   HTTP   │────►│  Agent Sprite │                                                │
│     │  Request │     │   wakes up    │                                                │
│     └──────────┘     └────────────────┘                                                │
│                                  │                                                      │
│                                  ▼                                                      │
│     2. Agent calls Vault                                                               │
│     ┌──────────┐     ┌────────────────┐     ┌──────────────────┐                    │
│     │   Agent   │────►│   Vault Sprite │────►│  Key not in      │                    │
│     │  requests │     │   wakes up     │     │  memory!         │                    │
│     │  key      │     │                │     │                  │                    │
│     └──────────┘     └────────────────┘     └──────────────────┘                    │
│                                    │                                                  │
│                                    ▼                                                  │
│     3. Vault returns: "need auth"                                                    │
│     ┌──────────┐     ┌────────────────┐     ┌──────────────────┐                    │
│     │   Agent   │◄────│   Vault       │◄────│  Return:         │                    │
│     │  receives │     │               │     │  401 Not Init    │                    │
│     │  401      │     │               │     │                  │                    │
│     └──────────┘     └────────────────┘     └──────────────────┘                    │
│                                  │                                                      │
│     4. User re-authenticates                                                          │
│                                  ▼                                                      │
│     ┌──────────┐     ┌────────────────┐     ┌──────────────────┐                    │
│     │  Wallet  │────►│  Platform      │────►│  Derive key      │                    │
│     │  signs   │     │  gets sig     │     │  from sig        │                    │
│     └──────────┘     └────────────────┘     └──────────────────┘                    │
│                                        │                                              │
│                                        ▼                                              │
│     5. Key restored to Vault                                                          │
│     ┌────────────────┐     ┌────────────────┐                                        │
│     │  Platform     │────►│  Call Vault   │                                        │
│     │  calls Vault  │     │  /reinit      │                                        │
│     │  /reinit      │     │               │                                        │
│     └────────────────┘     └────────────────┘                                        │
│                                  │                                                      │
│                                  ▼                                                      │
│     6. Agent can now encrypt/decrypt                                                  │
│     ┌──────────┐     ┌────────────────┐     ┌──────────────────┐                    │
│     │   Agent   │────►│   Vault       │────►│  Encryption     │                    │
│     │  retries  │     │  has key now  │     │  works!         │                    │
│     │  operation │     │               │     │                  │                    │
│     └──────────┘     └────────────────┘     └──────────────────┘                    │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              THREAT MODEL                                              │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  WHAT WE PROTECT AGAINST:                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                                 │  │
│  │  1. Platform operator reading user data                                         │  │
│  │     └─► SOLUTION: Keys never stored, only in user Sprites                        │  │
│  │                                                                                 │  │
│  │  2. Agent AI exfiltrating encryption keys                                       │  │
│  │     └─► SOLUTION: Keys in separate Vault Sprite, HTTP API only                  │  │
│  │                                                                                 │  │
│  │  3. Disk compromise (server theft, etc)                                         │  │
│  │     └─► SOLUTION: Keys only in memory, encrypted at rest in object storage      │  │
│  │                                                                                 │  │
│  │  4. Malicious agent reading other users' data                                   │  │
│  │     └─► SOLUTION: Each user has separate Sprites, isolated VMs                 │  │
│  │                                                                                 │  │
│  │  5. Platform being compelled to reveal data                                     │  │
│  │     └─► SOLUTION: We literally cannot - keys are in user Sprites               │  │
│  │                                                                                 │  │
│  └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                         │
│  ATTACK SURFACE:                                                                       │
│                                                                                         │
│  ┌────────────────────────────────────┐    ┌─────────────────────────────────────┐   │
│  │         YOUR PLATFORM               │    │         SPRITES INFRASTRUCTURE       │   │
│  │                                    │    │                                     │   │
│  │  ┌──────────┐   ┌──────────┐      │    │  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │Database   │   │Auth      │      │    │  │Agent Sprite │  │Vault Sprite │  │   │
│  │  │(metadata) │   │(wallet)  │      │    │  │(user data) │  │(keys only)  │  │   │
│  │  └────┬─────┘   └────┬─────┘      │    │  └──────┬──────┘  └──────┬──────┘  │   │
│  │       │              │             │    │         │                │         │   │
│  │       │              │             │    │         │                │         │   │
│  │       ▼              ▼             │    │         ▼                ▼         │   │
│  │  ┌─────────────────────────────────┤    │  ┌─────────────────────────────┐   │   │
│  │  │  CAN SEE: User IDs, billing   │    │  │   CAN SEE:                  │   │   │
│  │  │  CANNOT SEE: Agent data       │    │  │   Agent: Files, sessions   │   │   │
│  │  └─────────────────────────────────┘    │  │   Vault: Nothing (keys in  │   │   │
│  │                                        │  │          memory only)        │   │   │
│  │                                        │  │   CANNOT SEE:               │   │   │
│  │                                        │  │   Platform: Agent data      │   │   │
│  │                                        │  │   Vault: Platform has no    │   │   │
│  │                                        │  │          access             │   │   │
│  │                                        │  └─────────────────────────────┘   │   │
│  │                                        │                                     │   │
│  └────────────────────────────────────────┴────────────────────────────────────┘   │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              COMPONENTS                                                 │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ┌───────────────────────────────────────────────────────────────────────────────┐   │
│  │                              VAULT SPRITE                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │  vault-service.ts                                                      │  │   │
│  │  │                                                                        │  │   │
│  │  │  Express Server (port 8080)                                           │  │   │
│  │  │                                                                        │  │   │
│  │  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │  │   │
│  │  │  │ POST /init     │  │ POST /encrypt │  │ POST /decrypt │            │  │   │
│  │  │  │ Initialize     │  │ AES-256-GCM   │  │ AES-256-GCM   │            │  │   │
│  │  │  │ with key       │  │ Encrypt       │  │ Decrypt       │            │  │   │
│  │  │  └────────────────┘  └────────────────┘  └────────────────┘            │  │   │
│  │  │                                                                        │  │   │
│  │  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │  │   │
│  │  │  │ POST /sign    │  │ GET /status    │                              │  │   │
│  │  │  │ Sign message  │  │ Health check   │                              │  │   │
│  │  │  └────────────────┘  └────────────────┘                              │  │   │
│  │  │                                                                        │  │   │
│  │  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │  │ Key Manager (in-memory)                                        │  │   │
│  │  │  │ • encryptionKey: Buffer | null                                │  │   │
│  │  │  │ • initialized: boolean                                        │  │   │
│  │  │  │ • Lost on SIGTERM (intentional)                              │  │   │
│  │  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  │  │                                                                        │  │   │
│  │  └─────────────────────────────────────────────────────────────────────────┘  │   │
│  │                                                                                 │
│  └────────────────────────────────────────────────────────────────────────────────┘  │
│                                    │                                                   │
│                                    │ HTTP API                                           │
│                                    ▼                                                   │
│  ┌────────────────────────────────────────────────────────────────────────────────┐   │
│  │                            AGENT SPRITE                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │  agent-storage.ts                                                     │  │   │
│  │  │                                                                        │  │   │
│  │  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐           │  │   │
│  │  │  │ VaultStorage   │  │ EncryptedFile  │  │  AgentStorage │           │  │   │
│  │  │  │ (HTTP client) │  │ Storage        │  │ (high-level)  │           │  │   │
│  │  │  │               │  │ (file wrapper) │  │               │           │  │   │
│  │  │  │ • encrypt()   │  │ • write()     │  │ • saveSession │           │  │   │
│  │  │  │ • decrypt()   │  │ • read()      │  │ • loadSession │           │  │   │
│  │  │  │ • sign()      │  │ • writeJSON() │  │ • set()       │           │  │   │
│  │  │  │ • isReady()   │  │ • readJSON()  │  │ • get()       │           │  │   │
│  │  │  └────────────────┘  └────────────────┘  └────────────────┘           │  │   │
│  │  │                                                                        │  │   │
│  │  └─────────────────────────────────────────────────────────────────────────┘  │   │
│  │                                                                                 │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │  agent.ts                                                             │  │   │
│  │  │                                                                        │  │   │
│  │  │  • Initializes AgentStorage                                            │  │   │
│  │  │  • Runs AI agent (Claude Code, etc)                                   │  │   │
│  │  │  • Processes user requests                                            │  │   │
│  │  │  • Saves encrypted sessions via AgentStorage                          │  │   │
│  │  │                                                                        │  │   │
│  │  └─────────────────────────────────────────────────────────────────────────┘  │   │
│  │                                                                                 │
│  └────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Agent Sprite

The AI agent execution environment. Has full filesystem access but cannot access Vault's memory or keys.

**Location**: `/home/sprite/agent/`

**Responsibilities**:
- Run Claude Code or other AI agent
- Manage user workspace files
- Call Vault API for encryption/decryption
- Execute user commands

**Filesystem**:
```
/home/sprite/agent/
├── workspace/        # User's working files (not encrypted)
├── sessions/        # Encrypted session data
├── data/           # Encrypted application data
└── ...            # Full filesystem access
```

### 2. Vault Sprite

Key management service. Holds encryption keys in memory only, never writes to disk.

**Location**: `/home/sprite/vault/`

**Responsibilities**:
- Hold user encryption keys in memory
- Provide HTTP API for encrypt/decrypt/sign
- Never persist keys to disk
- Authenticate user requests

**API Endpoints**:
| Method | Path | Description |
|--------|------|-------------|
| POST | `/init` | Initialize vault with user's encryption key |
| POST | `/encrypt` | Encrypt data with user's key |
| POST | `/decrypt` | Decrypt data with user's key |
| POST | `/sign` | Sign a message with user's key |
| GET | `/status` | Health check, returns initialization state |
| POST | `/reinit` | Re-initialize after cold start |

## Security Properties

| Threat | Protected? | How |
|--------|-----------|-----|
| Agent reads filesystem | ✅ | Can't read Vault's memory |
| Agent deletes files | ✅ | Keys still in Vault |
| Agent exfiltrates key | ✅ | Impossible - key never leaves Vault |
| Sprite compromised | ✅ | Agent can be nuked, keys safe in Vault |
| Platform access keys | ✅ | Impossible - keys in user Sprites |
| Vault Sprite shutdown | ✅ | Keys lost (intentional - key only in memory) |
| Disk theft | ✅ | Keys in memory only |
| Platform compelled to reveal | ✅ | Physically impossible |

## Key Management

### Key Derivation

Keys are derived from user's wallet signature at runtime, never stored:

```typescript
// On first run
const challenge = await api.getChallenge(userId);
const signature = await userWallet.signMessage(challenge);
const encryptionKey = keccak256(signature);
```

### Cold Start Flow

When Sprites wake from idle:

```
1. User makes request to Agent Sprite
2. Agent Sprite wakes (cold start)
3. Vault Sprite wakes (cold start)
4. Agent calls Vault: "give me keys"
5. Vault returns: "need authentication"
6. User signs message with wallet
7. Keys restored to Vault memory
8. Agent can now encrypt/decrypt
```

## Storage Encryption

### What Gets Encrypted

| Data Type | Encrypted? | How |
|-----------|------------|-----|
| Agent session data | ✅ Yes | Agent calls Vault API |
| Agent workspace files | ❌ No | User's choice |
| Agent logs | ❌ No | User's choice |

## Cost Estimation

Based on [Sprites pricing](https://sprites.dev/):

| Resource | Rate | Agent (4hr) | Vault (4hr) | Total/Day |
|----------|------|-------------|-------------|-----------|
| CPU | $0.07/CPU-hr | 2 CPU-hr × $0.07 = $0.14 | 0.5 CPU-hr × $0.07 = $0.04 | $0.18 |
| Memory | $0.04375/GB-hr | 2 GB-hr × $0.04375 = $0.09 | 0.5 GB-hr × $0.04375 = $0.02 | $0.11 |
| Storage | $0.000027/GB-hr | 10 GB × $0.000027 × 4hr = $0.001 | 1 GB × $0.000027 × 4hr = $0.0001 | $0.001 |
| **Total** | | | | **~$0.29** |

Monthly (30 days): **~$9/month** at 4 hours active/day

## Deployment

### Creating User Sprites

```typescript
async function provisionUser(userId: string) {
  // 1. Create Vault Sprite
  const vaultSprite = await sprites.create(`vault-${userId}`);
  
  // 2. Initialize vault with user's key
  const { challenge } = await api.getChallenge(userId);
  const signature = await userWallet.signMessage(challenge);
  const encryptionKey = keccak256(signature);
  
  await vaultSprite.exec(`npm start -- --init ${encryptionKey}`);
  
  // 3. Create Agent Sprite
  const agentSprite = await sprites.create(`agent-${userId}`);
  
  // 4. Configure agent with vault URL
  await agentSprite.exec(`agent config --vault-url ${vaultSprite.url}`);
  
  return { agentSprite, vaultSprite };
}
```

### Service Startup

Vault service must start before agent:

```bash
# Start vault first
sprite-env services create vault --cmd node --args vault-service.js

# Then agent can start
node agent.js
```

## Files

```
specs/sprites/
├── SPEC.md                 # This file
├── README.md               # User documentation
├── vault-service.ts        # Vault Sprite implementation
├── agent-storage.ts        # Encrypted storage wrapper for Agent
├── agent.ts                # Example Agent entry point
├── provision.ts            # User provisioning script
├── client.ts               # CLI client for testing
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
├── Makefile                # Convenience commands
├── docker-compose.yaml     # Local development
├── vault.Dockerfile        # Vault container image
├── agent.Dockerfile        # Agent container image
├── vitest.config.ts        # Unit tests
├── vitest.integration.config.ts # Integration tests
├── vitest.e2e.config.ts   # E2E tests
└── .env.example           # Environment template
```
