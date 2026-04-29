#!/bin/sh
# Clean potentially leaked secret env vars
unset WALLET_KEY WALLET_PRIVATE_KEY SECRET_KEY || true
exec "$@"
