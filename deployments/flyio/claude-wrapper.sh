#!/bin/bash
# claude-wrapper.sh
# Privilege-drop wrapper for the Claude Agent SDK CLI.
#
# The SDK spawns `pathToClaudeCodeExecutable` as a child process.
# By pointing that option at THIS script, every Claude CLI invocation
# runs as the unprivileged 'claude' user — which has NO access to
# /app/data/secrets/ (owned 0700 by app:app).
#
# Usage (set by server/index.ts):
#   pathToClaudeCodeExecutable = "/usr/local/bin/claude-wrapper.sh"
#
# The real CLI path is passed via CLAUDE_REAL_CLI env var.

set -e

REAL_CLI="${CLAUDE_REAL_CLI:?CLAUDE_REAL_CLI must be set}"

# Drop to 'claude' user and execute the real CLI with all original args
exec sudo -u claude -- node "$REAL_CLI" "$@"
