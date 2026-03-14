---
name: skills-manager
description: Add or remove agent capabilities using chat commands.
---

# Skills Manager

Manage agent skills through conversation. The agent has skill management tools available.

## Tools

The agent has access to these skill management tools:

### AddSkill
Add a new skill to the agent. Owner only.

Parameters:
- `source` (required): Skill source. Can be:
  - Claw Hub slug: any skill from clawhub.com (e.g., "blog-writer-cn", "ws-agent-browser", "agenthc-market-intelligence")
  - GitHub URL: "github:owner/repo" or "github:owner/repo/skill-name"
  - NPM package: "package-name" or "@org/package"

Tip: Use SearchClawHub to find skills first, then use AddSkill with the slug.

### RemoveSkill
Remove a skill from the agent. Owner only.

Parameters:
- `name` (required): Name of the skill to remove

Note: Core skills cannot be removed.

### ListSkills
List installed and available skills from Claw Hub.

Returns:
- Installed skills (in ./skills/ directory)
- Available skills from Claw Hub (browse what's installable)

### SearchClawHub
Search for skills on Claw Hub.

Parameters:
- `query` (required): Search term (e.g., "browser", "memory", "twitter", "crypto")

Returns skills matching the query with descriptions.

## When to Use Tools

**AddSkill:**
- User says "Add the [skill] skill"
- User says "Install [skill]"
- User says "Can you use the [skill] skill?"
- User says "I want to add [skill]"

**RemoveSkill:**
- User says "Remove the [skill] skill"
- User says "Uninstall [skill]"
- User says "Stop using [skill]"

**ListSkills:**
- User says "What skills do you have?"
- User says "What skills are available?"
- User says "List my skills"
- User says "Show me what you can do"

**SearchClawHub:**
- User wants to discover skills
- User says "Find skills for X"
- User says "What skills exist for [task]?"

## Skill Sources

Users can install skills from multiple sources:

1. **Claw Hub** (recommended):
   - Use SearchClawHub to find skills
   - Use AddSkill with the slug (e.g., "blog-writer-cn", "ws-agent-browser")

2. **GitHub URLs**:
   - `github:owner/repo`
   - `github:owner/repo/skill-name`

3. **NPM packages**:
   - `package-name`
   - `@org/package`

Tip: Claw Hub has the largest selection of agent skills. Always search there first!

## Important Notes

- Only owners can add or remove skills
- Core skills (memory, scheduler, xmtp, skills-manager) cannot be removed
- When a skill is added, acknowledge to the user and briefly describe what it does
- When removing, confirm the skill was removed
