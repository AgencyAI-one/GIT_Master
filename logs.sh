#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$PROJECT_DIR/.git-master-runtime/server.log"
FOLLOW=true
LINE_COUNT=100

usage() {
  echo "Usage: ./logs.sh [--no-follow] [lines]"
  echo "Example: ./logs.sh --no-follow 50"
}

for ARGUMENT in "$@"; do
  case "$ARGUMENT" in
    -f|--follow) FOLLOW=true ;;
    --no-follow) FOLLOW=false ;;
    ''|*[!0-9]*) usage; exit 2 ;;
    *) LINE_COUNT="$ARGUMENT" ;;
  esac
done

if [[ ! -f "$LOG_FILE" ]]; then
  echo "No Git Master logs yet. Start the app with ./start.sh dev or ./start.sh prod."
  exit 0
fi

if [[ "$FOLLOW" == true ]]; then
  tail -n "$LINE_COUNT" -f "$LOG_FILE"
else
  tail -n "$LINE_COUNT" "$LOG_FILE"
fi
