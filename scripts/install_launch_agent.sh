#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="${MARKET_PULSE_LAUNCHD_LABEL:-com.market-pulse-ai}"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
PORT="${PORT:-5173}"
SCREEN_SESSION="${MARKET_PULSE_SCREEN_SESSION:-market-pulse-ai}"
REPLACE_SCREEN=false
ALLOW_PROTECTED_DIR=false

for arg in "$@"; do
  case "$arg" in
    --replace-screen)
      REPLACE_SCREEN=true
      ;;
    --allow-protected-dir)
      ALLOW_PROTECTED_DIR=true
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--replace-screen] [--allow-protected-dir]" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "Could not find an executable node binary. Set NODE_BIN=/absolute/path/to/node and retry." >&2
  exit 1
fi

if [[ "$ALLOW_PROTECTED_DIR" != "true" && ( "$ROOT_DIR" == "$HOME/Desktop/"* || "$ROOT_DIR" == "$HOME/Documents/"* ) ]]; then
  cat >&2 <<EOF
This project is under a macOS privacy-protected directory:
  ${ROOT_DIR}

LaunchAgent may start but hang before it can read server.mjs unless the background
process has permission. Move the project to a non-protected directory such as
~/Developer, or run with --allow-protected-dir after granting the required access.

For the current Desktop location, use:
  screen -dmS ${SCREEN_SESSION} bash -lc 'cd ${ROOT_DIR} && exec ${NODE_BIN} server.mjs'
EOF
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$ROOT_DIR/data"

if [[ "$REPLACE_SCREEN" == "true" ]] && command -v screen >/dev/null 2>&1; then
  screen -S "$SCREEN_SESSION" -X quit >/dev/null 2>&1 || true
fi

launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true

tmp="$(mktemp)"
cat >"$tmp" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${ROOT_DIR}/server.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/tmp</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>20</integer>
  <key>StandardOutPath</key>
  <string>${ROOT_DIR}/data/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${ROOT_DIR}/data/launchd.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>PORT</key>
    <string>${PORT}</string>
  </dict>
</dict>
</plist>
PLIST

mv "$tmp" "$PLIST"
chmod 644 "$PLIST"

launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true

echo "Installed and started ${LABEL}"
echo "Plist: ${PLIST}"
echo "App: http://localhost:${PORT}/"
echo "Logs: ${ROOT_DIR}/data/launchd.out.log and ${ROOT_DIR}/data/launchd.err.log"
