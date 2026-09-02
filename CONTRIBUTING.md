# Contributing

Thank you for improving Git Master.

## Setup

1. Fork and clone the repository.
2. Install Node.js 22+ and run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Run `npm run dev`.

Desktop work additionally requires stable Rust and the platform packages from the official [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). Start the Next.js server on port 5173, then run `npm run desktop:dev`.

Native macOS companion work requires a Mac with full Xcode 15 or newer. Its source, shared scheme, permission model, local signing flow, and release instructions are documented in [`mac_xcode_app_shortcut/README.md`](mac_xcode_app_shortcut/README.md). Validate native changes with:

```bash
cd mac_xcode_app_shortcut
./scripts/doctor.sh
./scripts/test.sh
./scripts/build-dmg.sh
```

The demo workspace requires no GitHub or OpenAI credentials. Use a dedicated test repository and narrowly scoped token for integration work.

## Quality bar

Before opening a pull request:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run desktop:check
```

Run `npm run test:e2e` for UI flows. `desktop:check` formats and tests the Rust companion and needs Tauri's native build prerequisites. Add tests for behavioral changes, document new environment variables, and keep provider keys on the server. A pull request that changes GitHub permissions, webhook handling, native input access, token handling, uploads, or external AI data flow must explain its security impact.

The native macOS scripts use ad-hoc signing by default and need no Apple account. Do not include Developer ID certificates, notarization credentials, provisioning profiles, exported Keychain items, or built apps/DMGs in a pull request.

## Commits and pull requests

- Keep changes focused and use clear imperative commit subjects.
- Link the relevant issue.
- Include screenshots or recordings for UI changes.
- Describe verification and known trade-offs.
- Do not commit `.env`, databases, tokens, recordings, or private issue content.

By contributing, you agree that your contribution is licensed under MIT.
