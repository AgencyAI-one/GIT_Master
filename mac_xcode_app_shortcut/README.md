# Git Master Companion for macOS

[Українська версія](README-UA.md)

Git Master Companion is the native macOS client for the Git Master web application. It is built with Swift, SwiftUI, AppKit, and WebKit and adds system-wide shortcuts, menu bar status, and launch-at-login support while Xcode, Terminal, a browser, or another application has focus.

This is a regular macOS application built with Xcode, not an Xcode extension. It remains useful while you work in Xcode, but it does not inject code into or control Xcode.

The source is self-contained in this directory, has no third-party Swift dependencies, and is covered by the repository's [MIT license](../LICENSE).

## What the companion provides

- Global, configurable push-to-talk and New Issue shortcuts.
- A reliable Right Option default that leaves Left Option shortcuts untouched.
- Hold-to-talk and double-press-to-latch recording modes.
- Live microphone and New Issue state in the macOS menu bar.
- A persistent `WKWebView` for the existing Git Master installation.
- A configurable server URL and optional launch at login.
- Accessibility and Input Monitoring diagnostics in Settings.
- Unit tests, a shared Xcode scheme, an ad-hoc DMG builder, and an optional Developer ID notarization flow.

The companion does not contain a Git Master server. Authentication, GitHub access, AI provider calls, issue data, and file uploads are still handled by the configured web installation.

## Requirements

- A Mac running macOS 13 Ventura or newer.
- Full Xcode 15 or newer. Command Line Tools alone are not enough for the Xcode project and test target.
- A running Git Master server.
- HTTPS for a remote server. Plain HTTP is accepted only for `localhost`, `127.0.0.1`, or `::1` development.

No Homebrew packages, Rust toolchain, Node.js installation, or third-party Swift packages are needed to build the native companion itself.

## Quick start from source

Start Git Master on the same Mac from the repository root:

```bash
npm install
cp .env.example .env.local
./start.sh dev 5173
```

Then open a second Terminal window:

```bash
cd mac_xcode_app_shortcut
./scripts/doctor.sh
open GitMasterCompanion.xcodeproj
```

In Xcode:

1. Select the **GitMasterCompanion** scheme and **My Mac** destination.
2. If Xcode requests signing configuration, open the app target's **Signing & Capabilities** tab and select your Personal Team or **Sign to Run Locally**.
3. Press **Run** (`Command-R`).
4. Open **Git Master → Settings** and confirm that the server URL is `http://127.0.0.1:5173`.
5. Grant the permissions described below, quit the companion completely, and launch it again.

The localhost address always refers to the Mac running the companion. If Git Master runs on another machine, configure its HTTPS URL or create a local tunnel:

```bash
ssh -L 5173:127.0.0.1:5173 user@your-development-server
```

## Using the app

The default shortcuts are:

| Action | Default shortcut | Behavior |
| --- | --- | --- |
| Voice input | Right Option | Hold while speaking and release to submit. Double-press to keep recording until the next press. |
| New issue | Command-Shift-N | Opens Git Master and starts a new issue in the currently selected repository. |

Right Option is the recommended default because it avoids the Left Option combinations commonly used for symbols and application commands. It remains configurable so people using AltGr layouts, external keyboards, or conflicting global utilities have a fallback.

To change a shortcut, open **Git Master → Settings → Global shortcuts**, click its field, and press a combination or press and release a modifier by itself. Press `Esc` to cancel. Voice input and New Issue cannot share the same binding. **Reset Shortcuts** restores Right Option and Command-Shift-N.

The web app decides what a voice command does based on the current context. Select the intended GitHub connection, repository, and Project before using the New Issue shortcut.

Closing the main window does not quit the companion. Use the menu bar item to reopen it or choose **Quit Git Master** to stop all global listeners.

### Menu bar status

| Icon | Meaning |
| --- | --- |
| `mic` | Global voice shortcut is ready. |
| `mic.fill` | Voice input is currently active. |
| `mic.slash` | The listener or required Accessibility access is unavailable. |
| `plus.square.fill` | The New Issue command has just fired. |

The menu also shows the configured shortcuts, permission state, last input source, and listener status. It is the fastest way to confirm whether a shortcut reached the native app while another application had focus.

## macOS permissions

macOS grants privacy permissions to a particular installed and signed app identity. Install or keep the app at a stable path before granting access; changing the Bundle ID, signature, or build location can create a new entry.

| Permission | Why it is used | Required? |
| --- | --- | --- |
| Accessibility | Enables the preferred passive AppKit global event monitor while another application has focus. | Required for the supported, reliable global-shortcut path. |
| Input Monitoring | Enables the listen-only Core Graphics event-tap fallback and diagnostics. | Recommended fallback; it does not replace Accessibility in the current UI. |
| Microphone | Lets the trusted Git Master page record speech in the embedded WebView. | Required only for voice input. |

Grant permissions in this order:

1. Move **Git Master.app** to `/Applications` when using a DMG.
2. Open **Git Master → Settings → macOS permissions**.
3. Click **Request Permission** or **Open Settings** next to Accessibility, then enable **Git Master** under **System Settings → Privacy & Security → Accessibility**.
4. Enable the same `/Applications/Git Master.app` under **Privacy & Security → Input Monitoring**.
5. Quit Git Master from its menu bar item and reopen it.
6. Start voice input once and approve the macOS Microphone prompt. You can later review it under **Privacy & Security → Microphone**.
7. Confirm that the menu says **Accessibility granted** and **Global shortcuts active**. Switch to another app and press Right Option; the menu bar microphone should fill immediately.

Apple's user guides describe the system controls for [Accessibility](https://support.apple.com/guide/mac-help/allow-accessibility-apps-to-access-your-mac-mh43185/mac) and [Input Monitoring](https://support.apple.com/guide/mac-help/control-access-to-input-monitoring-on-mac-mchl4cedafb6/mac).

The listener receives key codes, modifier state, and mouse-button events needed to distinguish a configured shortcut from combinations such as Option-Tab. It never consumes or rewrites those events. It does not store or transmit typed text. For diagnostics, the menu retains only the latest key code/modifier description and action source in memory until the process exits.

## Test and validate the project

Run the Xcode project diagnostic:

```bash
./scripts/doctor.sh
```

Run all native unit tests with local ad-hoc signing:

```bash
./scripts/test.sh
```

The same tests are available in Xcode with `Command-U`. The shared scheme and source-only project files are committed, while `xcuserdata`, DerivedData, test results, apps, archives, and DMGs are ignored.

## Build a local DMG

For a build used on the same Mac, no Apple Developer Program membership is required:

```bash
./scripts/build-dmg.sh
```

The script performs a clean Release build, applies an ad-hoc signature, verifies the app and disk image, and writes:

```text
build/Git-Master-1.0.0.dmg
```

Open the DMG, drag **Git Master.app** to **Applications**, eject the DMG, and launch `/Applications/Git Master.app`. Do not run or grant permissions to the copy inside the mounted DMG.

Build parameters are supplied as environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VERSION` | `1.0.0` | App marketing version and DMG filename; one to three numeric components. |
| `BUILD_NUMBER` | `1` | Numeric bundle build number. |
| `BUNDLE_IDENTIFIER` | `com.agencyai.gitmaster.companion` | Override when building a fork under a different identity. |
| `BUILD_DIR` | `build/` | DerivedData and artifact destination. |
| `DEVELOPMENT_TEAM` | empty | Enables automatic signing with a selected Apple team. |
| `CODE_SIGN_IDENTITY` | empty | Enables explicit signing, normally with a Developer ID Application identity. |
| `NOTARY_PROFILE` | empty | Submits, waits for, and staples notarization using a Keychain profile. |

Example local build with custom metadata:

```bash
VERSION=1.1.0 BUILD_NUMBER=12 \
BUNDLE_IDENTIFIER=org.example.gitmaster.companion \
./scripts/build-dmg.sh
```

## Build a public, notarized release

Public binaries should be signed with a **Developer ID Application** certificate and notarized. This requires membership in the Apple Developer Program and a Bundle ID controlled by the publisher.

Store notarization credentials once in the maintainer's login Keychain; never commit credentials or a `.p8` key:

```bash
xcrun notarytool store-credentials "git-master-notary" \
  --apple-id "APPLE_ID" \
  --team-id "TEAM_ID" \
  --password "APP_SPECIFIC_PASSWORD"
```

Build, sign, notarize, and staple the DMG:

```bash
VERSION=1.0.0 \
BUILD_NUMBER=1 \
BUNDLE_IDENTIFIER=com.example.gitmaster.companion \
DEVELOPMENT_TEAM=TEAM_ID \
CODE_SIGN_IDENTITY="Developer ID Application: Publisher Name (TEAM_ID)" \
NOTARY_PROFILE=git-master-notary \
./scripts/build-dmg.sh
```

The script verifies the app signature, signs and verifies the DMG, runs `hdiutil verify`, submits the DMG with `notarytool --wait`, and staples and validates the ticket. Apple documents this process in [Customizing the notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow).

Do not publish the default ad-hoc artifact as an official release. It is intended only for the person who built it from reviewed source.

## Security and data boundaries

- The configured server URL and shortcut bindings are stored in `UserDefaults`.
- Authentication cookies stay in the persistent WebKit data store.
- GitHub tokens, issue data, and AI provider keys remain on the Git Master server.
- User-info credentials in server URLs are rejected.
- Remote plain HTTP URLs are rejected; local loopback HTTP remains available for development.
- Microphone capture is granted only to the configured server origin.
- Cross-origin navigation opens in the default browser instead of remaining in the privileged WebView.
- Global input monitors are passive and cannot suppress or alter system input.
- The app performs no analytics and includes no third-party SDKs.

Only connect the companion to a Git Master server you trust. The configured page receives the authenticated WebKit session and, after approval, microphone audio.

For vulnerability reports, follow the repository [security policy](../SECURITY.md). Do not include real tokens, private issue content, or recordings in a public issue.

## Project structure

```text
GitMasterCompanion/             Swift application source
GitMasterCompanionTests/        Unit tests
GitMasterCompanion.xcodeproj/   Xcode project and shared scheme
scripts/doctor.sh               Xcode project diagnostic
scripts/test.sh                 Ad-hoc signed command-line test runner
scripts/build-dmg.sh            Local and notarized release builder
```

## Troubleshooting

### The global shortcut works only while Git Master is focused

This means the local monitor works but macOS is not delivering global events. Check **Accessibility** first, then **Input Monitoring**. Remove obsolete Git Master entries, add the exact `/Applications/Git Master.app`, quit from the menu bar, and reopen it. The menu must show **Accessibility granted** and **Global shortcuts active**.

Use Right Option while testing. Left Option is more likely to participate in layout and application shortcuts. If the menu's **Last event** changes but **Last shortcut** does not, reset the bindings or record a different combination.

### Microphone starts but no transcript appears

Confirm Microphone permission, verify that the Git Master server is reachable, and check that its voice provider environment variables are configured. Remote servers must use HTTPS.

### macOS says the app is damaged or from an unidentified developer

Official downloadable builds must use Developer ID signing and notarization. For an unnotarized development build, build it yourself from reviewed source. Do not bypass Gatekeeper for a binary you do not trust.

### Xcode closes while opening the project

Quit Xcode and run:

```bash
./scripts/doctor.sh
```

If the diagnostic succeeds, move only Xcode's per-user window state aside and reopen the shared project:

```bash
state_backup="$(mktemp -d "${TMPDIR:-/tmp}/git-master-xcode-state.XXXXXX")"
mv GitMasterCompanion.xcodeproj/xcuserdata "$state_backup/project-xcuserdata" 2>/dev/null || true
mv GitMasterCompanion.xcodeproj/project.xcworkspace/xcuserdata \
  "$state_backup/workspace-xcuserdata" 2>/dev/null || true
open GitMasterCompanion.xcodeproj
```

Include the complete `doctor.sh` output, macOS version, Xcode version, and reproduction steps in a bug report.

### New Issue opens the wrong repository

The native command uses the repository currently selected inside Git Master. Open the main window and select the intended connection, repository, and Project first.

## Contributing

Read the repository [contribution guide](../CONTRIBUTING.md) before opening a pull request. Changes to global input monitoring, permissions, WebKit origin checks, signing, launch at login, or microphone behavior must describe their security and privacy impact and include relevant tests.

By contributing, you agree that your contribution is licensed under the repository's [MIT license](../LICENSE).
