# Security Hardening Deployment Guide

## Overview

This guide covers deploying the security-hardened hybrid-agent with:
- Two-user process isolation (`app` and `claude` users)
- Memory-only secret storage (loaded from persistent volume)
- Per-user workspace isolation
- Environment variable filtering
- **No environment variable dependencies for secrets**

## Prerequisites

- Fly.io CLI installed (`flyctl`)
- Access to the `hybrid-agent` Fly.io app

---

## 1. Initial Setup (One-Time)

### Step 1: Deploy

```bash
cd deployments/flyio
fly deploy
```

### Step 2: Provision the wallet key on the persistent volume

SSH into the running machine and write the secret file directly:

```bash
fly ssh console

# Write the wallet key
echo -n "0xyourprivatekeyhere" > /app/data/secrets/wallet.key
chmod 400 /app/data/secrets/wallet.key
chown app:app /app/data/secrets/wallet.key

# Verify
ls -la /app/data/secrets/
exit
```

The file persists across deploys on the mounted volume (`agent_data` → `/app/data`).

### Step 3: Restart to pick up the key

```bash
fly apps restart
```

### Step 4: Verify

```bash
fly logs | head -50
# Should show wallet address in startup banner
```

---

## 2. Security Verification

### Check users exist
```bash
fly ssh console -C "id app && id claude"
# Expected: uid=1000(app) ... uid=1001(claude)
```

### Check secrets directory permissions
```bash
fly ssh console -C "ls -ld /app/data/secrets"
# Expected: drwx------ ... app app ...
```

### Check secret file permissions
```bash
fly ssh console -C "ls -la /app/data/secrets/"
# Expected: -r-------- ... app app ... wallet.key
```

### Verify no secrets in environment
```bash
fly ssh console -C "printenv | grep -iE 'wallet|secret|private'"
# Should return nothing
```

---

## 3. Key Rotation

```bash
fly ssh console

# Overwrite the key file
echo -n "0xnewkeyhere" > /app/data/secrets/wallet.key
chmod 400 /app/data/secrets/wallet.key
chown app:app /app/data/secrets/wallet.key
exit

# Restart to pick up the new key
fly apps restart
```

---

## 4. Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                       Docker Container                          │
│                                                                 │
│   /app/data/ (persistent volume: agent_data)                    │
│   ├── secrets/wallet.key (0400, app:app)                       │
│   │   └── read only by 'app' user, loaded into memory          │
│   ├── memory/users/{userId}/  ← isolated per user              │
│   ├── credentials/            ← ACL config                     │
│   └── workspaces/{userId}/    ← user workspace symlinks        │
│                                                                 │
│   ┌──────────────────┐          ┌─────────────────────┐        │
│   │   Node Server    │          │    Claude CLI       │        │
│   │   (user: app)    │  spawns  │    (user: claude)   │        │
│   │   uid: 1000      │ ───────▶ │    uid: 1001       │        │
│   └──────────────────┘          └─────────────────────┘        │
│         │                              │                        │
│         ├── reads /app/data/secrets/   ├── NO access to secrets │
│         └── loads key into memory      └── filtered env only    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Troubleshooting

### "WALLET_KEY not loaded" error

The secret file is missing or unreadable.

```bash
fly ssh console -C "ls -la /app/data/secrets/"
# If missing, provision it (see Step 2 above)
```

### Claude can read secrets

File permissions are incorrect.

```bash
fly ssh console
chmod 700 /app/data/secrets
chmod 400 /app/data/secrets/*
chown app:app /app/data/secrets /app/data/secrets/*
```

---

## 6. Rollback

```bash
fly releases
fly rollback <version>
```