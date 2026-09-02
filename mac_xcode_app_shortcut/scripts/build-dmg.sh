#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_PATH="$PROJECT_DIR/GitMasterCompanion.xcodeproj"
BUILD_DIR="${BUILD_DIR:-$PROJECT_DIR/build}"
DERIVED_DATA="$BUILD_DIR/DerivedData"
APP_PATH="$DERIVED_DATA/Build/Products/Release/Git Master.app"
VERSION="${VERSION:-1.0.0}"
BUILD_NUMBER="${BUILD_NUMBER:-1}"
BUNDLE_IDENTIFIER="${BUNDLE_IDENTIFIER:-com.agencyai.gitmaster.companion}"
DEVELOPMENT_TEAM="${DEVELOPMENT_TEAM:-}"
CODE_SIGN_IDENTITY="${CODE_SIGN_IDENTITY:-}"
NOTARY_PROFILE="${NOTARY_PROFILE:-}"
DMG_PATH="$BUILD_DIR/Git-Master-$VERSION.dmg"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Error: the macOS app must be built on macOS."
  exit 1
fi

for command in xcodebuild codesign ditto hdiutil; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Error: required command '$command' was not found. Install full Xcode and select it with xcode-select."
    exit 1
  fi
done

if [[ ! "$VERSION" =~ ^[0-9]+([.][0-9]+){0,2}$ ]]; then
  echo "Error: VERSION must contain one to three numeric components, for example 1.2.0."
  exit 1
fi

if [[ ! "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]]; then
  echo "Error: BUILD_NUMBER must be a positive integer."
  exit 1
fi

if [[ ! "$BUNDLE_IDENTIFIER" =~ ^[A-Za-z0-9-]+([.][A-Za-z0-9-]+)+$ ]]; then
  echo "Error: BUNDLE_IDENTIFIER must be a reverse-DNS identifier."
  exit 1
fi

if [[ -n "$CODE_SIGN_IDENTITY" && -z "$DEVELOPMENT_TEAM" ]]; then
  echo "Error: DEVELOPMENT_TEAM is required when CODE_SIGN_IDENTITY is set."
  exit 1
fi

if [[ -n "$NOTARY_PROFILE" && -z "$CODE_SIGN_IDENTITY" ]]; then
  echo "Error: NOTARY_PROFILE requires a Developer ID CODE_SIGN_IDENTITY."
  exit 1
fi

mkdir -p "$BUILD_DIR"

XCODE_ARGUMENTS=(
  -project "$PROJECT_PATH"
  -scheme GitMasterCompanion
  -configuration Release
  -derivedDataPath "$DERIVED_DATA"
  clean build
  "MARKETING_VERSION=$VERSION"
  "CURRENT_PROJECT_VERSION=$BUILD_NUMBER"
  "PRODUCT_BUNDLE_IDENTIFIER=$BUNDLE_IDENTIFIER"
)

if [[ -n "$CODE_SIGN_IDENTITY" ]]; then
  XCODE_ARGUMENTS+=(
    "DEVELOPMENT_TEAM=$DEVELOPMENT_TEAM"
    "CODE_SIGN_STYLE=Manual"
    "CODE_SIGN_IDENTITY=$CODE_SIGN_IDENTITY"
    "OTHER_CODE_SIGN_FLAGS=--timestamp"
  )
elif [[ -n "$DEVELOPMENT_TEAM" ]]; then
  XCODE_ARGUMENTS+=("DEVELOPMENT_TEAM=$DEVELOPMENT_TEAM" "CODE_SIGN_STYLE=Automatic")
else
  XCODE_ARGUMENTS+=("CODE_SIGN_STYLE=Manual" "CODE_SIGN_IDENTITY=-" "CODE_SIGNING_REQUIRED=YES" "AD_HOC_CODE_SIGNING_ALLOWED=YES")
fi

xcodebuild "${XCODE_ARGUMENTS[@]}"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Error: expected app was not produced at $APP_PATH"
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$APP_PATH"

STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/git-master-dmg.XXXXXX")"
cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

ditto "$APP_PATH" "$STAGING_DIR/Git Master.app"
ln -s /Applications "$STAGING_DIR/Applications"

hdiutil create \
  -volname "Git Master" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

if [[ -n "$CODE_SIGN_IDENTITY" ]]; then
  codesign --force --timestamp --sign "$CODE_SIGN_IDENTITY" "$DMG_PATH"
  codesign --verify --verbose=2 "$DMG_PATH"
fi

hdiutil verify "$DMG_PATH"

if [[ -n "$NOTARY_PROFILE" ]]; then
  if ! command -v xcrun >/dev/null 2>&1; then
    echo "Error: xcrun is required for notarization."
    exit 1
  fi
  xcrun notarytool submit "$DMG_PATH" --keychain-profile "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$DMG_PATH"
  xcrun stapler validate "$DMG_PATH"
fi

echo "Created $DMG_PATH"
if [[ -z "$CODE_SIGN_IDENTITY" ]]; then
  echo "Signing: local ad-hoc build (not suitable for redistribution)."
elif [[ -z "$NOTARY_PROFILE" ]]; then
  echo "Signing: $CODE_SIGN_IDENTITY (not notarized)."
else
  echo "Signing: $CODE_SIGN_IDENTITY; notarization and stapling completed."
fi
echo "Drag Git Master.app from the DMG to /Applications before launching it."
echo "Do not grant permissions to or keep using the copy inside the mounted DMG."
echo "After installation, enable Git Master in Privacy & Security > Accessibility."
echo "Enable Input Monitoring as a secondary event-listener fallback, then restart the app."
