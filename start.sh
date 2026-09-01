#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$PROJECT_DIR/.git-master-runtime"
PID_FILE="$RUNTIME_DIR/server.pid"
MODE_FILE="$RUNTIME_DIR/server.mode"
PORT_FILE="$RUNTIME_DIR/server.port"
START_FILE="$RUNTIME_DIR/server.started-at"
LOG_FILE="$RUNTIME_DIR/server.log"
NEXT_BIN="$PROJECT_DIR/node_modules/next/dist/bin/next"
STANDALONE_SERVER="$PROJECT_DIR/.next/standalone/server.js"

APP_MODE="${1:-${GIT_MASTER_MODE:-dev}}"
APP_PORT="${2:-${GIT_MASTER_PORT:-5173}}"
APP_HOST="${GIT_MASTER_HOST:-0.0.0.0}"

usage() {
  echo "Usage: ./start.sh [dev|prod] [port]"
  echo "Example: ./start.sh prod 5173"
}

if [[ "$APP_MODE" != "dev" && "$APP_MODE" != "prod" ]]; then
  usage
  exit 2
fi

if [[ ! "$APP_PORT" =~ ^[0-9]+$ ]] || (( APP_PORT < 1 || APP_PORT > 65535 )); then
  echo "Invalid port: $APP_PORT" >&2
  exit 2
fi

mkdir -p "$RUNTIME_DIR"

if [[ -f "$PID_FILE" ]]; then
  RUNNING_PID="$(tr -d '[:space:]' < "$PID_FILE")"
  if [[ "$RUNNING_PID" =~ ^[0-9]+$ ]] && kill -0 "$RUNNING_PID" 2>/dev/null; then
    RUNNING_MODE="$(tr -d '[:space:]' < "$MODE_FILE" 2>/dev/null || true)"
    RUNNING_PORT="$(tr -d '[:space:]' < "$PORT_FILE" 2>/dev/null || true)"
    echo "Git Master is already running (pid $RUNNING_PID, ${RUNNING_MODE:-unknown} mode, port ${RUNNING_PORT:-unknown})."
    echo "Use ./restart.sh $APP_MODE $APP_PORT to restart it."
    exit 0
  fi
  rm -f "$PID_FILE" "$MODE_FILE" "$PORT_FILE" "$START_FILE"
fi

if [[ ! -x "$NEXT_BIN" ]]; then
  echo "Installing dependencies with npm ci…"
  (cd "$PROJECT_DIR" && npm ci)
fi

if [[ "$APP_MODE" == "prod" ]]; then
  echo "Building production version…"
  (cd "$PROJECT_DIR" && npm run build)
  mkdir -p "$PROJECT_DIR/.next/standalone/public" "$PROJECT_DIR/.next/standalone/.next/static"
  cp -R "$PROJECT_DIR/public/." "$PROJECT_DIR/.next/standalone/public/"
  cp -R "$PROJECT_DIR/.next/static/." "$PROJECT_DIR/.next/standalone/.next/static/"
fi

printf '\n[%s] Starting Git Master in %s mode on %s:%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$APP_MODE" "$APP_HOST" "$APP_PORT" >> "$LOG_FILE"

if [[ "$APP_MODE" == "dev" ]]; then
  NODE_ENV=development nohup node "$NEXT_BIN" dev --hostname "$APP_HOST" --port "$APP_PORT" >> "$LOG_FILE" 2>&1 &
else
  ENV_FILE_ARGUMENTS=()
  [[ -f "$PROJECT_DIR/.env" ]] && ENV_FILE_ARGUMENTS+=("--env-file-if-exists=$PROJECT_DIR/.env")
  [[ -f "$PROJECT_DIR/.env.local" ]] && ENV_FILE_ARGUMENTS+=("--env-file-if-exists=$PROJECT_DIR/.env.local")
  RESOLVED_DATABASE_PATH="$(node "${ENV_FILE_ARGUMENTS[@]}" -e 'const path = require("path"); const root = process.argv[1]; const configured = process.env.DATABASE_PATH || "./data/git-master.db"; process.stdout.write(path.isAbsolute(configured) ? configured : path.resolve(root, configured));' "$PROJECT_DIR")"
  mkdir -p "$(dirname -- "$RESOLVED_DATABASE_PATH")"
  NODE_ENV=production HOSTNAME="$APP_HOST" PORT="$APP_PORT" DATABASE_PATH="$RESOLVED_DATABASE_PATH" NEXT_TELEMETRY_DISABLED=1 nohup node "${ENV_FILE_ARGUMENTS[@]}" "$STANDALONE_SERVER" >> "$LOG_FILE" 2>&1 &
fi

SERVER_PID=$!
printf '%s\n' "$SERVER_PID" > "$PID_FILE"
printf '%s\n' "$APP_MODE" > "$MODE_FILE"
printf '%s\n' "$APP_PORT" > "$PORT_FILE"
ps -p "$SERVER_PID" -o lstart= | awk '{$1=$1};1' > "$START_FILE"

for ((ATTEMPT = 1; ATTEMPT <= 60; ATTEMPT++)); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Git Master failed to start. Recent logs:" >&2
    tail -n 30 "$LOG_FILE" >&2 || true
    rm -f "$PID_FILE" "$MODE_FILE" "$PORT_FILE" "$START_FILE"
    exit 1
  fi

  if node -e "fetch('http://127.0.0.1:${APP_PORT}/api/health').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))" >/dev/null 2>&1; then
    echo "Git Master started in $APP_MODE mode (pid $SERVER_PID)."
    echo "Open: http://localhost:$APP_PORT"
    echo "Logs: ./logs.sh"
    exit 0
  fi
  sleep 0.5
done

echo "Git Master did not become healthy within 30 seconds. See ./logs.sh" >&2
exit 1
