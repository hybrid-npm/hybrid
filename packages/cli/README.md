# @hybrd/cli

The `hybrid` / `hy` command-line tool for building, developing, deploying, and managing Hybrid AI agents on Firecracker microVMs.

## Installation

```bash
npm install -g @hybrd/cli
# or use directly via npx
npx hybrid <command>
```

## Commands

### `hybrid init [name]`

Initialize a new agent project with an interactive setup:

```bash
hybrid init          # Interactive mode
hybrid init my-agent # Skip name prompt
```

The init command will ask:
1. **Project name** - Directory name for the project
2. **Agent display name** - Human-readable name for the agent
3. **Deployment target** - sprites, E2B, Northflank, or Daytona

**Generated files:**
```
my-agent/
├── package.json      # Project dependencies
├── SOUL.md           # Agent identity and behavior
├── AGENTS.md         # Repository guidelines
├── .env.example      # Environment variables template
├── .gitignore        # Git ignore rules
└── Dockerfile        # Container build instructions
```

### `hybrid build [--target]`

Build the agent bundle into `./dist/`:

```bash
hybrid build                   # Default build (firecracker target)
hybrid build --target firecracker  # Firecracker microVM target
hybrid build --target cf       # Cloudflare Workers target
```

The build:
1. Compiles `packages/agent` via `pnpm --filter hybrid/agent build`
2. Creates `./dist/` directory structure
3. Copies compiled `dist/` from the agent package
4. Copies `SOUL.md`, `AGENTS.md`, and `agent.ts` from your project root
5. Copies core skills from `packages/agent/skills/` → `.hybrid/skills/core/`
6. Copies user skills from `./skills/` → `.hybrid/skills/ext/`
7. Writes `skills/skills_lock.json` listing all installed skills
8. Generates deployment files: `package.json`, `Dockerfile`, `start.sh`, deploy manifest

**Build output structure:**
```
dist/
├── dist/                    # Compiled agent code
│   ├── server/index.cjs     # Full agent server
│   ├── server/simple.cjs    # Lightweight server
├── skills/
│   ├── core/                # Built-in skills (memory)
│   ├── ext/                 # User-installed skills
│   └── skills_lock.json
├── package.json
├── Dockerfile
├── start.sh                 # Starts server
└── .hybrid-deploy.json      # Provider manifest
```

### `hybrid dev`

Start the development server:

```bash
hybrid dev
```

### `hybrid deploy [platform]`

Build then deploy to a Firecracker microVM provider:

```bash
hybrid deploy              # Deploys to default provider (sprites)
hybrid deploy sprites      # Deploy to sprites.dev
hybrid deploy e2b          # Deploy to e2b.dev
hybrid deploy northflank   # Deploy to Northflank
hybrid deploy daytona      # Deploy to Daytona
```

### `hybrid deploy sleep <name>`

Put a running Firecracker VM to sleep:

```bash
hybrid deploy sleep my-agent [--provider sprites]
```

### `hybrid deploy wake <name>`

Wake a sleeping Firecracker VM:

```bash
hybrid deploy wake my-agent [--provider sprites]
```

### `hybrid deploy status <name>`

Show VM status:

```bash
hybrid deploy status my-agent
```

### `hybrid deploy logs <name>`

Stream agent logs:

```bash
hybrid deploy logs my-agent --follow
```

### `hybrid deploy teardown <name>`

Destroy a VM and all associated resources:

```bash
hybrid deploy teardown my-agent
hybrid deploy teardown --all  # Destroy all VMs
```

### `hybrid install <source>`

Install a skill into your agent project:

```bash
# From GitHub
hybrid install github:username/repo
hybrid install github:username/repo/path/to/skill

# From npm
hybrid install @scope/skill-package

# From local path
hybrid install ./path/to/skill
```

Skills are directories containing a `SKILL.md` file with YAML frontmatter (`name`, `description`). Installed skills are copied to `./skills/` and tracked in `skills-lock.json`.

### `hybrid uninstall <name>`

Remove an installed skill:

```bash
hybrid uninstall my-skill-name
```

### `hybrid skills`

List all available skills:

```bash
hybrid skills
```

Shows core skills (from `packages/agent/skills/`) and installed extension skills (from `./skills/`), with name and description from each `SKILL.md`.

## Configuration

Pre-select your deployment provider in `hybrid.config.ts`:

```typescript
export const config = {
  deploy: {
    platform: "sprites",    // default provider
    spriteName: "my-agent", // optional instance name
  }
}
```

## Skills System

Skills are markdown-based tool definitions. Each skill is a directory with:

```
my-skill/
└── SKILL.md      # Required: YAML frontmatter + markdown content
```

**`SKILL.md` frontmatter:**
```yaml
---
name: my-skill
description: What this skill does
---
```

Skills are injected into the agent's system prompt, describing tools and capabilities the LLM can use.

**Skill sources:**

| Source | Format | Example |
|--------|--------|---------|
| GitHub | `github:user/repo[/path]` | `github:acme/skills/web-search` |
| npm | `@scope/pkg` or `pkg-name` | `@acme/weather-skill` |
| Local | `./relative/path` | `./skills/my-tool` |

## Build Pipeline

```
hybrid build
    │
    ├── pnpm --filter hybrid/agent build
    │
    ├── Create .hybrid/
    │
    ├── Copy dist/ → .hybrid/dist/
    │
    ├── Copy SOUL.md, AGENTS.md, agent.ts
    │
    ├── Copy core skills → .hybrid/skills/core/
    │
    ├── Copy ./skills/ → .hybrid/skills/ext/
    │
    ├── Write skills_lock.json
    │
    └── Generate: package.json, Dockerfile, start.sh, .hybrid-deploy.json

hybrid deploy sprites
    │
    ├── hybrid build
    │
    └── sprite deploy (provision → upload → endpoint)
```

## Relation to Other Packages

- Builds `packages/agent` via `pnpm --filter`
- Deploys `packages/gateway` for Cloudflare Workers target
- The output `.hybrid/` directory is what gets deployed into Firecracker microVMs

## License

MIT
