# @hybrd/cli

The `hybrid` / `hy` command-line tool for building, developing, deploying, and managing Hybrid AI agents.

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
3. **Deployment target** - Fly.io, Railway, Cloudflare, AWS, or GCP
4. **Fly.io app name** - App identifier (lowercase, numbers, hyphens)
5. **Primary region** - Closest region for deployment
6. **VM size** - Resource allocation (shared/performance CPU, RAM)
7. **Persistent storage** - Enable volume for data persistence
8. **Storage size** - Volume size in GB (if enabled)

**Generated files:**
```
my-agent/
├── package.json      # Project dependencies
├── SOUL.md           # Agent identity and behavior
├── AGENTS.md         # Repository guidelines
├── .env.example      # Environment variables template
├── .gitignore        # Git ignore rules
├── Dockerfile        # Container build instructions
├── fly.toml          # Fly.io deployment config
├── start.sh          # Start script
└── README.md         # Project documentation
```

### `hybrid build [--target]`

Build the agent bundle into `./dist/`:

```bash
hybrid build                  # Default build
hybrid build --target fly     # Fly.io target (default)
hybrid build --target spawn   # Spawn Sprite target
hybrid build --target railway # Railway target
hybrid build --target cf      # Cloudflare Workers target
```

The build:
1. Compiles `packages/agent` via `pnpm --filter hybrid/agent build`
2. Creates `./dist/` directory structure
3. Copies compiled `dist/` from the agent package
4. Copies `SOUL.md`, `AGENTS.md`, and `agent.ts` from your project root
5. Copies core skills from `packages/agent/skills/` → `.hybrid/skills/core/`
6. Copies user skills from `./skills/` → `.hybrid/skills/ext/`
7. Writes `skills/skills_lock.json` listing all installed skills
8. Generates deployment files: `package.json`, `Dockerfile`, `fly.toml`, `start.sh`

**Build output structure:**
```
dist/
├── dist/                    # Compiled agent code
│   ├── server/index.cjs     # Full Claude Code SDK server
│   ├── server/simple.cjs    # Lightweight server
├── skills/
│   ├── core/                # Built-in skills (memory)
│   ├── ext/                 # User-installed skills
│   └── skills_lock.json
├── package.json
├── Dockerfile
├── fly.toml                 # (Fly.io targets only)
├── spawn.sh                 # (Spawn targets only)
└── start.sh                 # Starts server
```

The build:
1. Compiles `packages/agent` via `pnpm --filter hybrid/agent build`
2. Creates `./dist/` directory structure
3. Copies compiled `dist/` from the agent package
4. Copies `SOUL.md`, `AGENTS.md`, and `agent.ts` from your project root
5. Copies core skills from `packages/agent/skills/` → `.hybrid/skills/core/`
6. Copies user skills from `./skills/` → `.hybrid/skills/ext/`
7. Writes `skills/skills_lock.json` listing all installed skills
8. Generates deployment files: `package.json`, `Dockerfile`, `fly.toml`, `start.sh`

**Build output structure:**
```
dist/
├── dist/                    # Compiled agent code
│   ├── server/index.cjs     # Full Claude Code SDK server
│   ├── server/simple.cjs    # Lightweight server
├── skills/
│   ├── core/                # Built-in skills (memory)
│   ├── ext/                 # User-installed skills
│   └── skills_lock.json
├── package.json
├── Dockerfile
├── fly.toml                 # (Fly.io targets only)
├── spawn.sh                 # (Spawn targets only)
└── start.sh                 # Starts server
```

### `hybrid dev`

Start the development server. Builds the agent then runs `pnpm dev` in the agent directory:

```bash
hybrid dev
```

### `hybrid deploy [platform]`

Build then deploy to a platform:

```bash
hybrid deploy          # Deploys to Fly.io (default)
hybrid deploy          # Fly.io: runs `fly deploy` from .hybrid/
hybrid deploy cf       # Cloudflare: builds packages/gateway, runs `wrangler deploy`
hybrid deploy railway  # Railway (builds only, manual deploy)
```

### `hybrid register`

Register the agent identity:

```bash
hybrid register
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

## Generated Files

### `Dockerfile` (Fly.io / Railway)

```dockerfile
FROM node:20
WORKDIR /app
COPY dist/ ./dist/
COPY skills/ ./skills/
COPY package.json .
COPY start.sh .
COPY SOUL.md .
COPY AGENTS.md .
RUN npm install
CMD ["sh", "start.sh"]
```

### `start.sh`

Runs the agent server:

```bash
node dist/server/simple.cjs
```

### `fly.toml`

Generated for Fly.io targets with appropriate service configuration.

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
    └── Generate: package.json, Dockerfile, fly.toml, start.sh

hybrid deploy
    │
    ├── hybrid build --target fly
    │
    └── fly deploy (from .hybrid/)

hybrid deploy cf
    │
    ├── pnpm --filter hybrid/gateway build
    │
    └── wrangler deploy (from packages/gateway/)
```

## Relation to Other Packages

- Builds `packages/agent` via `pnpm --filter`
- Deploys `packages/gateway` for Cloudflare Workers target
- Delegates `register` command to agent identity scripts
- The output `.hybrid/` directory is what `packages/gateway` runs inside its Docker container

## License

MIT
