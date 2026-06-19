#!/bin/bash
# Z Store dev launcher — runs static-only dev server.
# Usage: bash scripts/dev.sh [port]
cd "$(dirname "$0")/.."
PORT="${1:-3002}"
echo "Starting Z Store dev server on port $PORT ..."
exec node scripts/dev-server.js "$PORT"
