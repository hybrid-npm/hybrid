# Security Hardening Deployment Guide

## Overview

This guide covers deploying the security-hardened hybrid-agent with:
- Two-user process isolation (`app` and `claude` users)
- Memory-only secret storage
- Per-user workspace isolation
- Environment variable filtering

## Prerequisites

- Fly.io CLI installed (`flyctl`)
- Access to the `hybrid-agent` Fly.io app
- GitHub repository admin access (for branch protection)

---

## 1. GitHub Branch Protection

Configure branch protection to require security tests before merging:

1. Go to repository Settings → Branches
2. Add rule for `main` branch
3. Enable:
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
4. Add required status checks:
   - `security-audit` (from `.github/workflows/security-tests.yml`)
5. Save changes

### CLI Alternative (if you have `gh` installed):

```bash
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["security-audit"]}' \
  --field enforce_admins=true
```

---

## 2. Fly.io Deployment

### Step 1: Set Secrets

Set the wallet key as a Fly.io secret (this will be injected at runtime):

```bash
fly secrets set AGENT_WALLET_KEY="0xyourprivatekeyhere"
```

### Step 2: Deploy

```bash
cd deployments/flyio
fly deploy
```

The entrypoint script will:
1. Read `AGENT_WALLET_KEY` from environment
2. Write it to `/secrets/wallet.key` with 0400 permissions
3. Set ownership to `app:app`
4. Unset the environment variable
5. Start the server as the `app` user

### Step 3: Verify Deployment

```bash
# Check the app is running
fly status

# Check logs
fly logs

# Verify secrets are not in environment
fly ssh console -C "printenv | grep AGENT_WALLET_KEY"
# Should return nothing (secret is in file, not env)
```

---

## 3. Security Verification

After deployment, verify the security setup:

### Test 1: Check users exist
```bash
fly ssh console -C "id app && id claude"
# Expected: uid=1000(app) ... uid=1001(claude)
```

### Test 2: Check /secrets permissions
```bash
fly ssh console -C "ls -ld /secrets"
# Expected: drwx------ 1 app app ...
```

### Test 3: Check app can read secrets
```bash
fly ssh console -C "cat /secrets/wallet.key"
# Expected: Shows the wallet key
```

### Test 4: Verify data directory
```bash
fly ssh console -C "ls -la /app/data/"
# Expected: memory/, credentials/, xmtp/, workspaces/
```

---

## 4. Key Injection Methods

### Method A: Fly.io Secrets (Recommended)

Secrets are injected via environment variables and converted to files by the entrypoint:

```bash
fly secrets set AGENT_WALLET_KEY="0x..."
```

**Pros:**
- Secure injection at runtime
- Secrets never stored in image
- Easy rotation

**Cons:**
- Brief moment where key is in env (before entrypoint unsets it)

### Method B: Volume Mount (Alternative)

Pre-load the key into a persistent volume:

```bash
# Create volume if not exists
fly volumes create agent_secrets --region iad --size 1

# Mount in fly.toml
[[mounts]]
source = "agent_secrets"
destination = "/secrets"

# SSH in and create the key file
fly ssh console
echo "0x..." > /secrets/wallet.key
chmod 400 /secrets/wallet.key
chown app:app /secrets/wallet.key
```

---

## 5. Key Rotation

To rotate the private key:

```bash
# Update the secret
fly secrets set AGENT_WALLET_KEY="0xnewkey..."

# The app will automatically restart with the new key
# No code changes needed
```

---

## 6. Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                       Docker Container                          │
│                                                                 │
│   /secrets/wallet.key (0400, app:app)                          │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  0x... (private key - injected by entrypoint)          │  │
│   └─────────────────────────────────────────────────────────┘  │
│                          │                                      │
│            read only by 'app' user                              │
│                          ▼                                      │
│   ┌──────────────────┐          ┌─────────────────────┐        │
│   │   Node Server    │          │    Claude CLI       │        │
│   │   (user: app)    │  spawns  │    (user: claude)   │        │
│   │   uid: 1000      │ ───────▶  │    uid: 1001       │        │
│   └──────────────────┘          └─────────────────────┘        │
│                                                                 │
│   /app/data/ (persistent volume)                               │
│   ├── memory/users/{userId}/  ← Isolated per user              │
│   ├── credentials/             ← ACL config                    │
│   └── workspaces/{userId}/     ← User workspace symlinks       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Troubleshooting

### Issue: "WALLET_KEY not loaded" error

**Cause:** The secret was not injected or the entrypoint didn't run.

**Solution:**
```bash
# Verify secret is set
fly secrets list

# Check logs for entrypoint messages
fly logs | grep entrypoint
```

### Issue: Claude can read secrets

**Cause:** File permissions are incorrect.

**Solution:**
```bash
fly ssh console
ls -ld /secrets
ls -la /secrets/
# Should show: drwx------ for directory, -r-------- for files
```

### Issue: Permission denied for app user

**Cause:** Ownership is wrong.

**Solution:**
```bash
fly ssh console
sudo chown -R app:app /secrets
sudo chmod 700 /secrets
sudo chmod 400 /secrets/*
```

---

## 8. Rollback

If issues occur, rollback to previous deployment:

```bash
fly releases
fly rollback <version>
```

Or revert the code changes and redeploy:

```bash
git revert HEAD
fly deploy
```