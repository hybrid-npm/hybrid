---
name: skills-manager
description: Add or remove agent capabilities using hybrid CLI commands.
---

# Skills Manager

Manage agent skills using hybrid CLI commands to add or remove capabilities.

## Adding Skills

Use `hybrid skills add <skill-name>` or `hybrid clawhub install <skill-name>` to install new skills.

**When to use:**
- User asks to "add a skill"
- User asks to "install a skill"
- User wants to extend the agent's abilities

**Example:**

```bash
hybrid skills add wrangler
hybrid clawhub install wrangler
```

## Removing Skills

Use `hybrid skills remove <skill-name>` to uninstall skills.

**When to use:**
- User asks to "remove a skill"
- User asks to "uninstall a skill"

**Example:**

```bash
hybrid skills remove wrangler
```

## Listing Skills

Use `hybrid skills list` to see installed and available skills.

**When to use:**
- User wants to see what skills are installed
- User asks to "manage skills" or "configure capabilities"

**Example:**

```bash
hybrid skills list
```

**Important notes:**
- Only owners can add or remove skills
- Core skills cannot be removed
- Use `hybrid clawhub search <query>` to find available skills in the registry
