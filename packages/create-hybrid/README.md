# create-hybrid

Project scaffolding tool for Hybrid AI agents. Generates a complete, production-ready agent project ready to deploy to a Firecracker microVM provider.

## Usage

```bash
npm create hybrid my-agent
# or
npx create-hybrid my-agent
# or with options
npx create-hybrid my-agent --agent-name "My Agent"
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `<name>` | Project directory name | Required |
| `--agent-name` | Display name for the agent | Prompted interactively |

## Generated Project Structure

```
my-agent/
├── package.json             # Project dependencies
├── .env.example             # Environment template
├── .gitignore               # Git ignore rules
├── Dockerfile               # Container image build instructions
├── start.sh                 # Container startup script
├── SOUL.md                  # Agent personality / identity
├── AGENTS.md                # Workspace rules and guidelines
├── USER.md                  # Human profile template
└── [Template files: IDENTITY.md, TOOLS.md, BOOTSTRAP.md, HEARTBEAT.md]
```

## Getting Started

After scaffolding:

```bash
cd my-agent

# 1. Install dependencies
pnpm install

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env: add OPENROUTER_API_KEY (or ANTHROPIC_API_KEY)

# 3. Customize your agent
# Edit SOUL.md for personality
# Edit AGENTS.md for guidelines

# 4. Start local development
hybrid dev

# 5. Deploy to a Firecracker provider
hybrid deploy sprites
```

## Relation to Other Packages

- The generated project uses the same agent server pattern as `packages/agent/src/server/index.ts`
- The generated project is standalone — no dependencies on `@hybrd/*` packages
- `packages/cli`'s `hybrid init` command delegates to this package

## License

MIT
