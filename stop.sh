#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$PROJECT_DIR/.git-master-runtime"
PID_FILE="$RUNTIME_DIR/server.pid"
MODE_FILE="$RUNTIME_DIR/server.mode"
PORT_FILE="$RUNTIME_DIR/server.port"
START_FILE="$RUNTIME_DIR/server.started-at"

if [[ ! -f "$PID_FILE" ]]; then
  echo "Git Master is not running (no PID file)."
  exit 0
fi

SERVER_PID="$(tr -d '[:space:]' < "$PID_FILE")"
if [[ ! "$SERVER_PID" =~ ^[0-9]+$ ]]; then
  echo "Ignoring invalid PID file: $PID_FILE" >&2
  rm -f "$PID_FILE" "$MODE_FILE" "$PORT_FILE" "$START_FILE"
  exit 1
fi

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "Git Master is already stopped."
  rm -f "$PID_FILE" "$MODE_FILE" "$PORT_FILE" "$START_FILE"
  exit 0
fi

EXPECTED_START="$(awk '{$1=$1};1' "$START_FILE" 2>/dev/null || true)"
CURRENT_START="$(ps -p "$SERVER_PID" -o lstart= 2>/dev/null | awk '{$1=$1};1')"
if [[ -z "$EXPECTED_START" || "$CURRENT_START" != "$EXPECTED_START" ]]; then
  echo "PID $SERVER_PID no longer matches the Git Master process recorded by start.sh; refusing to stop it." >&2
  exit 1
fi

echo "Stopping Git Master (pid $SERVER_PID)…"
kill "$SERVER_PID"

for ((ATTEMPT = 1; ATTEMPT <= 50; ATTEMPT++)); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    rm -f "$PID_FILE" "$MODE_FILE" "$PORT_FILE" "$START_FILE"
    echo "Git Master stopped."
    exit 0
  fi
  sleep 0.2
done

echo "Process did not stop gracefully; sending SIGKILL." >&2
kill -KILL "$SERVER_PID" 2>/dev/null || true
rm -f "$PID_FILE" "$MODE_FILE" "$PORT_FILE" "$START_FILE"
echo "Git Master stopped."
