#!/bin/bash
# claude-wrapper.sh
# Drops privileges to 'claude' user before executing commands
# This ensures Claude CLI runs with minimal permissions

set -e

# Drop to 'claude' user and execute the command
exec sudo -u claude -- "$@"
