---
name: skills-manager
description: Open the Skills Manager mini app to add or remove agent capabilities.
---

# Skills Manager

Opens a Skills Manager mini app where the owner can browse, search, add, and remove skills.

## openSkillsManager

Opens the Skills Manager mini app for the owner to manage agent capabilities.

**When to use:**
- User asks to "add a skill"
- User asks to "remove a skill"
- User asks to "manage skills" or "configure capabilities"
- User wants to see what skills are installed
- User wants to extend the agent's abilities

**Parameters:** None

**Behavior:**
1. Detects the agent's public URL
2. Generates a link to the Skills Manager mini app
3. Sends the link for the user to open

**Example usage:**

User: "I want to add the wrangler skill"
Agent: Uses openSkillsManager to send a link to the Skills Manager where the user can browse and install skills.

User: "Can you manage your skills?"
Agent: Uses openSkillsManager to open the skills management interface.

**Important notes:**
- Only owners can add or remove skills
- Core skills cannot be removed
- The Skills Manager shows: core skills, installed extensions, and available skills from the registry
