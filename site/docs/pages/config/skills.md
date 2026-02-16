# Skills

Skills are specialized knowledge modules that sub-agents can load at runtime using the `Skill` tool. They provide domain-specific prompts and capabilities without changing the core agent code.

## How skills work

1. Each sub-agent declares which skill directories it can access via the `skills` field in its agent definition
2. When a sub-agent encounters a request that matches a skill's domain, it uses the `Skill` tool to load the relevant skill
3. The skill's content is injected into the sub-agent's context

## Skill directory

Skills are stored in the `apps/agent/skills/` directory and are copied into the container at build time:

```dockerfile
COPY skills/ /app/skills/
```

## Defining skills

Skills are referenced by name in sub-agent definitions. For example, the `general` sub-agent has access to skills named `general`:

```typescript
general: {
  description: "Handles general questions...",
  tools: ["Skill"],
  skills: ["general"],
  maxTurns: 100
}
```

To add a new skill, create the skill definition in the `skills/` directory and reference it in the appropriate sub-agent's `skills` array.

## Skills vs. system prompt

| | System Prompt | Skills |
|---|---|---|
| **Loaded** | Once at startup | On demand at runtime |
| **Scope** | All requests | Specific sub-agents |
| **Source** | `AGENT.md` + request `systemPrompt` | `skills/` directory |
| **Use case** | Base behavior and persona | Domain-specific knowledge |
