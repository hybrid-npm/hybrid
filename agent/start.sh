#!/bin/bash
set -e

# Start agent server in background
node dist/server/index.js &
SERVER_PID=$!

# Give server time to start
sleep 2

# Start XMTP sidecar (runs in foreground)
node dist/sidecar/index.js &

# Wait for both processes
wait
