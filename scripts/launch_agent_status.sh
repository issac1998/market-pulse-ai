#!/usr/bin/env bash
set -euo pipefail

LABEL="${MARKET_PULSE_LAUNCHD_LABEL:-com.market-pulse-ai}"
PORT="${PORT:-5173}"

echo "LaunchAgent: ${LABEL}"
launchctl print "gui/$(id -u)/${LABEL}" 2>/dev/null || echo "not loaded"
echo
echo "Port ${PORT}:"
lsof -i ":${PORT}" -n -P || true
