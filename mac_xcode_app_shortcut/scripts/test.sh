#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DERIVED_DATA="$PROJECT_DIR/build/DerivedData-Tests"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "Error: Xcode command-line tools are required."
  exit 1
fi

xcodebuild \
  -project "$PROJECT_DIR/GitMasterCompanion.xcodeproj" \
  -scheme GitMasterCompanion \
  -configuration Debug \
  -derivedDataPath "$DERIVED_DATA" \
  -destination "platform=macOS" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY=- \
  CODE_SIGNING_REQUIRED=YES \
  AD_HOC_CODE_SIGNING_ALLOWED=YES \
  test
