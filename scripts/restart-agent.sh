#!/bin/bash
set -euo pipefail

PROJECT_DIR="/Users/adam/otc-x-launcher"
RUNTIME_DIR="$PROJECT_DIR/runtime"
PROFILE_DIR="$PROJECT_DIR/chrome-profile"
ENV_FILE="$PROJECT_DIR/.env.otc-x-launcher"
AGENT_PID_FILE="$RUNTIME_DIR/agent.pid"
CHROME_PID_FILE="$RUNTIME_DIR/chrome.pid"
AGENT_LOG="$RUNTIME_DIR/agent.log"
CHROME_LOG="$RUNTIME_DIR/chrome.log"
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

mkdir -p "$RUNTIME_DIR" "$PROFILE_DIR"
set -a
source "$ENV_FILE"
set +a

stop_owned_pid() {
  local pid_file="$1"
  local required_text="$2"
  if [[ ! -f "$pid_file" ]]; then return; fi
  local pid
  pid="$(tr -cd '0-9' < "$pid_file")"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    local command
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command" == *"$required_text"* ]]; then
      kill "$pid"
      for _ in {1..20}; do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    fi
  fi
  rm -f "$pid_file"
}

stop_owned_pid "$AGENT_PID_FILE" "$PROJECT_DIR/agent/src/listener.mjs"

if ! curl --silent --fail --max-time 1 "http://127.0.0.1:${CHROME_DEBUG_PORT:-9337}/json/version" >/dev/null; then
  stop_owned_pid "$CHROME_PID_FILE" "$PROFILE_DIR"
  nohup "$CHROME_BIN" --user-data-dir="$PROFILE_DIR" --remote-debugging-port="${CHROME_DEBUG_PORT:-9337}" --no-first-run --no-default-browser-check "https://x.com/notifications/mentions" >>"$CHROME_LOG" 2>&1 &
  echo $! > "$CHROME_PID_FILE"
fi

cd "$PROJECT_DIR"
nohup /opt/homebrew/opt/node@22/bin/node "$PROJECT_DIR/agent/src/listener.mjs" >>"$AGENT_LOG" 2>&1 &
echo $! > "$AGENT_PID_FILE"
echo "OTC X listener started on PID $(cat "$AGENT_PID_FILE"); other agents were not touched."
