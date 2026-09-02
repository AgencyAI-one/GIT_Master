#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_PATH="$PROJECT_DIR/GitMasterCompanion.xcodeproj"
PBX_PATH="$PROJECT_PATH/project.pbxproj"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This diagnostic must run on macOS."
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild was not found. Install Xcode and select it with xcode-select."
  exit 1
fi

DUPLICATE_IDS="$(
  perl -0777 -ne 'while (/^\s*([A-F0-9]{24})(?: \/\*.*?\*\/)? = \{\s*isa =/mg) { print "$1\n" }' "$PBX_PATH" \
    | sort \
    | uniq -d
)"

if [[ -n "$DUPLICATE_IDS" ]]; then
  echo "Duplicate PBX object IDs were found:"
  echo "$DUPLICATE_IDS"
  exit 1
fi

echo "PBX object IDs: OK"

echo "Xcode installation:"
xcode-select -p
xcodebuild -version

echo
echo "Reading the project without opening the Xcode UI:"
xcodebuild -list -project "$PROJECT_PATH"

echo
echo "Project metadata is readable. You should see GitMasterCompanion under Targets and Schemes."
