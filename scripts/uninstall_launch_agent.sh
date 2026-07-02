#!/usr/bin/env bash
set -euo pipefail

LABEL="${MARKET_PULSE_LAUNCHD_LABEL:-com.market-pulse-ai}"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"

echo "Uninstalled ${LABEL}"
