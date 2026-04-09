# Zero-Knowledge Agent Platform on Sprites

A two-Sprite architecture providing true zero-knowledge encryption for AI agent platforms. Built on Fly.io Sprites.

## Architecture Overview

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

## Why This Architecture?

### The Problem

When running AI agents for users, you face a fundamental security dilemma:

| Approach | Problem |
|----------|---------|
| Store keys on disk | Agent can read them |
| Give agent root access | Agent can read everything |
| Use separate services | Still need to store keys somewhere |
| Trust the platform | Users must trust you |

### Our Solution

**Two Sprites = Two Trust Domains:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                      AGENT SPRITE                                    │
│  • User has root                                                   │
│  • Can read all files                                              │
│  • Can install packages                                            │
│  • CANNOT access Vault memory                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │ HTTP only
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      VAULT SPRITE                                   │
│  • Keys ONLY in memory                                             │
│  • Only exposes HTTP API                                            │
│  • No filesystem for keys                                           │
│  • CANNOT be accessed by Agent's filesystem                         │
└─────────────────────────────────────────────────────────────────────┘
```

## Security Properties

| Property | Guarantee |
|----------|-----------|
| Keys never on disk | ✅ Keys only in Vault memory |
| Platform can't read user data | ✅ Keys never leave user Sprites |
| Agent can't access keys | ✅ Only HTTP API access |
| Keys lost on restart | ✅ Intentional - cold start = re-auth |

## Threat Model

### What We Protect Against

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  1. PLATFORM OPERATOR READING USER DATA                                         │
│     Problem: Traditional hosting lets operators see everything                 │
│     Solution: Keys never stored - only in user Sprites                         │
│                                                                                 │
│  2. AGENT AI EXFILTRATING ENCRYPTION KEYS                                      │
│     Problem: AI agent has full filesystem access                                │
│     Solution: Keys in separate Vault Sprite, HTTP API only                     │
│                                                                                 │
│  3. DISK COMPROMISE (server theft, etc)                                        │
│     Problem: Stolen disks expose all data                                      │
│     Solution: Keys only in memory, encrypted at rest in object storage         │
│                                                                                 │
│  4. MALICIOUS AGENT READING OTHER USERS' DATA                                  │
│     Problem: Shared infrastructure risks cross-user access                     │
│     Solution: Each user has separate Sprites, isolated VMs                    │
│                                                                                 │
│  5. PLATFORM BEING COMPELLED TO REVEAL DATA                                    │
│     Problem: Legal requests can force data disclosure                          │
│     Solution: We literally cannot - keys are in user Sprites                   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### User Onboarding

```
1. User connects wallet
   ┌──────────┐     ┌────────────────┐     ┌──────────────────┐
   │  Wallet  │────►│  Your Platform │────►│  Generate random │
   │          │     │                │     │  challenge       │
   └──────────┘     └────────────────┘     └──────────────────┘

2. User signs challenge
   ┌──────────┐     ┌────────────────┐     ┌──────────────────┐
   │  Wallet  │────►│  Your Platform │────►│  Derive key:     │
   │          │     │                │     │  key = hash(sig)│
   └──────────┘     └────────────────┘     └──────────────────┘

3. Provision Sprites
   ┌────────────────┐     ┌────────────────┐     ┌──────────────────┐
   │  Your Platform │────►│   Create       │────►│   Initialize    │
   │                │     │  Vault Sprite  │     │  Vault with key │
   └────────────────┘     └────────────────┘     └──────────────────┘
```

### Agent Operation

```
Save session (encrypted):

Agent                    Vault
  │                        │
  │  POST /encrypt         │
  │───────────────────────►│
  │                        │
  │  Return encrypted blob │
  │◄───────────────────────│
  │                        │
  │  Write to disk         │
  │───────────────────────►
```

### Cold Start

```
1. User request → Agent wakes
2. Agent calls Vault → Vault has no key!
3. Vault returns: 401 Not Initialized
4. User re-authenticates with wallet
5. Key restored to Vault memory
6. Agent can now encrypt/decrypt
```

## API Reference

### Vault Service

All endpoints accept JSON bodies, return JSON responses.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Health check, returns initialization state |
| POST | `/init` | Initialize vault with user's encryption key |
| POST | `/reinit` | Re-initialize after cold start |
| POST | `/encrypt` | Encrypt data with user's key |
| POST | `/decrypt` | Decrypt data with user's key |
| POST | `/sign` | Sign a message with user's key |

#### GET /status

```bash
curl https://vault-user123.sprites.app/status
```

Response:
```json
{
  "initialized": true,
  "uptime": 3600
}
```

#### POST /encrypt

```bash
curl -X POST https://vault-user123.sprites.app/encrypt \
  -H "Content-Type: application/json" \
  -d '{"data": "Hello World"}'
```

Response:
```json
{
  "encrypted": "base64encodedencryptedblob..."
}
```

#### POST /decrypt

```bash
curl -X POST https://vault-user123.sprites.app/decrypt \
  -H "Content-Type: application/json" \
  -d '{"encrypted": "base64encodedencryptedblob..."}'
```

Response:
```json
{
  "decrypted": "Hello World"
}
```

## Quick Start

### 1. Install Dependencies

```bash
cd specs/sprites
npm install
```

### 2. Set Environment

```bash
export SPRITES_TOKEN=your-sprites-token
export FLY_ORG=your-org
```

### 3. Run Locally (Development)

```bash
# Terminal 1: Start Vault
npm run dev

# Terminal 2: Test with client
VAULT_URL=http://localhost:8080 npx tsx client.ts init 64-character-hex-key-here----------------
VAULT_URL=http://localhost:8080 npx tsx client.ts encrypt "Hello World"
VAULT_URL=http://localhost:8080 npx tsx client.ts status
```

### 4. Run Tests

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

## Usage Examples

### Using Encrypted Storage

```typescript
import { AgentStorage } from './agent-storage';

const storage = new AgentStorage(
  'https://vault-user123.sprites.app',
  '/home/sprite/agent/data'
);

// Save encrypted session
await storage.saveSession('session-1', {
  messages: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' }
  ],
  context: { workingDirectory: '/home/sprite/agent/workspace' }
});

// Load encrypted session  
const session = await storage.loadSession('session-1');

// Store arbitrary encrypted data
await storage.set('mykey', 'sensitive-data');
const data = await storage.get('mykey');
```

## Deployment

### Docker Images

```bash
# Build Vault image
docker build -t your-registry/vault:latest -f vault.Dockerfile .

# Build Agent image  
docker build -t your-registry/agent:latest -f agent.Dockerfile .

# Push to registry
docker push your-registry/vault:latest
docker push your-registry/agent:latest
```

### Deploy to Sprites

```bash
# Create Vault Sprite
sprite create vault-user123
sprite services create vault --cmd node --args vault-service.js

# Create Agent Sprite
sprite create agent-user123
```

## Cost

| Sprite | 4 hrs/day | 8 hrs/day | 24 hrs/day |
|--------|-----------|------------|-------------|
| Agent | ~$0.23 | ~$0.46 | ~$1.38 |
| Vault | ~$0.06 | ~$0.12 | ~$0.36 |
| **Total** | **~$0.29** | **~$0.58** | **~$1.74** |

Monthly (30 days): **$9-52/month** depending on usage

## Files

```
specs/sprites/
├── SPEC.md                 # Architecture specification
├── README.md               # This file
├── vault-service.ts        # Vault Sprite - encryption API
├── agent-storage.ts        # Encrypted storage wrapper
├── agent.ts               # Agent entry point
├── provision.ts           # User provisioning
├── client.ts             # CLI client
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
├── Makefile               # Convenience commands
├── docker-compose.yaml    # Local development
├── vault.Dockerfile       # Vault container
├── agent.Dockerfile       # Agent container
└── vitest*.config.ts     # Test configs
```

## Environment Variables

### Vault Service

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP port | `8080` |

### Agent Service

| Variable | Description | Required |
|----------|-------------|----------|
| `VAULT_URL` | Vault Sprite URL | Yes |
| `USER_ID` | User identifier | Yes |

## Troubleshooting

### Vault not initialized

```
Error: vault not initialized
```

**Solution**: User must authenticate. Call `/init` with their encryption key.

### Agent can't reach Vault

```
Error: connect ECONNREFUSED
```

**Solution**: Check `VAULT_URL` is correct and Vault Sprite is running.

### Keys lost after restart

This is **intentional**. Cold start = re-auth required.

## Alternative Approaches Considered

| Approach | Why Not Selected |
|----------|-----------------|
| Single Sprite, directory permissions | Root can bypass |
| Single Sprite, in-memory keys only | User must re-auth every time, worse UX |
| Two-Process same Sprite | Root can kill processes |
| Fly Machines + Volumes | More expensive, less isolated |
| Self-hosted | Much higher cost, more operational burden |

## License

MIT
