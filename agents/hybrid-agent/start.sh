#!/bin/bash
set -e

# Start agent server in background
node dist/server/index.cjs &
SERVER_PID=$!

# Give server time to start
sleep 2

# Start XMTP sidecar
node dist/xmtp.cjs &

# Wait for both processes
wait
