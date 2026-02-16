#!/usr/bin/env bash
set -uo pipefail

BACKOFF=1
MAX_BACKOFF=30

while true; do
  echo "[start.sh] Starting agent-server..."
  START_TIME=$(date +%s)
  node dist/server/index.js
  EXIT_CODE=$?
  END_TIME=$(date +%s)
  RUNTIME=$((END_TIME - START_TIME))
  if [ "$RUNTIME" -gt 60 ]; then
    BACKOFF=1
  fi
  if [ "$EXIT_CODE" -eq 0 ]; then
    echo "[start.sh] agent-server exited cleanly."
    exit 0
  fi
  echo "[start.sh] agent-server exited with code $EXIT_CODE, restarting in ${BACKOFF}s..."
  sleep "$BACKOFF"
  BACKOFF=$((BACKOFF * 2))
  if [ "$BACKOFF" -gt "$MAX_BACKOFF" ]; then
    BACKOFF=$MAX_BACKOFF
  fi
done
