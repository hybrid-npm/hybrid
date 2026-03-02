---
name: agent-browser
description: Browser automation for navigating the web. Use when you need to browse websites, fill forms, click elements, or extract content from live web pages.
---

# Agent Browser

Browser automation CLI for web navigation and interaction.

## Installation

```bash
npm install -g agent-browser
```

## Core Workflow

1. **Open** a URL
2. **Snapshot** to get interactive elements with refs (@e1, @e2, etc.)
3. **Interact** using refs
4. **Re-snapshot** after navigation or DOM changes

## Essential Commands

```bash
# Navigate
agent-browser open <url>

# Get interactive elements with refs
agent-browser snapshot -i

# Interact (use refs from snapshot)
agent-browser click @e1
agent-browser fill @e1 "text"
agent-browser type @e1 "text"

# Get information
agent-browser get text @e1
agent-browser get url
agent-browser get title

# Wait
agent-browser wait --load networkidle
agent-browser wait @e1

# Capture
agent-browser screenshot
agent-browser screenshot --full

# Close browser
agent-browser close
```

## Example: Fetch Page Content

```bash
agent-browser open https://example.com && agent-browser wait --load networkidle && agent-browser snapshot -i
```

## Example: Form Submission

```bash
agent-browser open https://example.com/login
agent-browser snapshot -i
agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password"
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser snapshot -i
```

## Important

- **Chain commands with `&&`** for efficiency
- **Refs are invalidated on page changes** - always re-snapshot after navigation
- **Always close the browser** when done: `agent-browser close`
