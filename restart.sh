#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$PROJECT_DIR/.git-master-runtime"
MODE_FILE="$RUNTIME_DIR/server.mode"
PORT_FILE="$RUNTIME_DIR/server.port"

SAVED_MODE="$(tr -d '[:space:]' < "$MODE_FILE" 2>/dev/null || true)"
SAVED_PORT="$(tr -d '[:space:]' < "$PORT_FILE" 2>/dev/null || true)"
APP_MODE="${1:-${SAVED_MODE:-${GIT_MASTER_MODE:-dev}}}"
APP_PORT="${2:-${SAVED_PORT:-${GIT_MASTER_PORT:-5173}}}"

"$PROJECT_DIR/stop.sh"
exec "$PROJECT_DIR/start.sh" "$APP_MODE" "$APP_PORT"
