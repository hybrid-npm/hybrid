---
title: Contributing to Hybrid
description: Quick guide to contributing to the Hybrid framework
---

# Contributing to Hybrid

Thanks for your interest in contributing to Hybrid! This guide will help you get up and running quickly.

## Quick Start

### Prerequisites

- **Node.js 22** (required)
- **pnpm** (package manager)
- **Git**

### Setup

```bash
# 1. Fork and clone the repo
git clone https://github.com/YOUR_USERNAME/hybrid.git
cd hybrid

# 2. Install dependencies
pnpm install

# 3. Build all packages
pnpm build

# 4. Run tests to make sure everything works
pnpm test
```

### Testing Your Setup

## Making Changes

### Common Workflows

**Working on core package:**
```bash
# Make your changes in packages/core/src/
cd packages/core

# Build and watch for changes
pnpm build:watch
```

**Working on CLI:**
```bash
# Make your changes in packages/cli/src/
cd packages/cli

# Test CLI commands
pnpm build
pnpm hybrid dev
```

**Working on XMTP integration:**
```bash
# Make your changes in packages/xmtp/src/
cd packages/xmtp

# Build and test
pnpm build:watch
```

### Project Structure

```
hybrid/
├── packages/
│   ├── core/           # Main framework (published as "hybrid")
│   ├── cli/            # CLI tool (bin: "hybrid")
│   ├── xmtp/           # XMTP integration (@hybrd/xmtp)
│   └── utils/          # Utilities (@hybrd/utils)
└── site/               # Documentation
```

## Code Guidelines

### Style

We use **Biome** for formatting and linting. Just run:

```bash
pnpm lint:fix
```

### Key Patterns

- ✅ Use `interfaces` over `types` for object shapes
- ❌ Never use `any` - use `unknown` instead
- ❌ No `enums` - use const objects with `as const`
- Files/folders: `kebab-case`
- Classes/interfaces: `PascalCase`
- Functions/variables: `camelCase`

### Testing

Add tests for new features:

```bash
# Run all tests
pnpm test

# Run tests for a specific package
cd packages/core
pnpm test
```

We use Vitest. Put tests next to your code or in a `test/` directory.

## Submitting Your Changes

### Before You Submit

```bash
# 1. Format and lint
pnpm lint:fix

# 2. Check types
pnpm typecheck

# 3. Run tests
pnpm test

# 4. Build everything
pnpm build
```

### Creating a Pull Request

1. **Branch naming:**
   - `feature/your-feature` - New features
   - `fix/the-bug` - Bug fixes
   - `docs/what-changed` - Documentation

2. **Commit format:**
   ```
   feat(core): add new behavior system
   fix(xmtp): resolve connection timeout
   docs(readme): update quickstart guide
   ```

3. **PR description:**
   - What does this change?
   - Why is it needed?
   - How did you test it?
   - Any breaking changes?

### What Happens Next

- CI runs tests and type checks
- A maintainer will review your PR
- We might ask for changes
- Once approved, we'll merge it!

## Reporting Issues

**Found a bug?** [Open an issue](https://github.com/ian/hybrid/issues) with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, Node version, Hybrid version)

**Have an idea?** [Start a discussion](https://github.com/ian/hybrid/discussions) first!

## Getting Help

Need help contributing?

1. Check the [documentation](https://hybrid.dev)
2. Search [existing issues](https://github.com/ian/hybrid/issues)
3. Ask in [GitHub Discussions](https://github.com/ian/hybrid/discussions)
4. Join our Discord (link in README)

## Development Tips

### Useful Commands

```bash
pnpm build              # Build all packages
pnpm build:watch        # Build in watch mode
pnpm build:packages     # Build only packages
pnpm test               # Run all tests
pnpm lint               # Check code style
pnpm lint:fix           # Fix code style
pnpm typecheck          # Check TypeScript types
pnpm clean              # Clean build artifacts
pnpm nuke               # Nuclear option - delete all node_modules
```

### Working with the Monorepo

The project uses pnpm workspaces and Turbo. Changes to packages automatically rebuild dependent packages when using `build:watch`.

### Testing Changes Locally

Link your local version to test in other projects:

```bash
cd packages/core
pnpm link --global

cd ~/your-project
pnpm link --global hybrid
```

### Environment Variables

For testing, create `.env` in your project:

```bash
OPENROUTER_API_KEY=your_key
XMTP_WALLET_KEY=0x...
XMTP_DB_ENCRYPTION_KEY=...
XMTP_ENV=dev
PORT=8454
```

Generate XMTP keys with: `pnpm hybrid keys --write`

## Code of Conduct

Be respectful, inclusive, and constructive. We're building this together!

- Use welcoming and inclusive language
- Be respectful of differing viewpoints
- Accept constructive criticism gracefully
- Focus on what's best for the community

## Recognition

Contributors are recognized in:
- Release notes
- CONTRIBUTORS.md
- Documentation credits
- Social media shoutouts

## Next Steps

- [Framework Architecture](/developing/framework) - Deep dive into core concepts
- [Using Hybrid](/using-hybrid) - Learn how to build agents
- [Tools Documentation](/tools) - Available tools and how to add new ones

---

**Ready to contribute?** Fork the repo and start hacking! 🚀
