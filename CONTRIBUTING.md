# Contributing

Thank you for improving Git Master.

## Setup

1. Fork and clone the repository.
2. Install Node.js 22+ and run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Run `npm run dev`.

The demo workspace requires no GitHub or OpenAI credentials. Use a dedicated test repository and narrowly scoped token for integration work.

## Quality bar

Before opening a pull request:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Run `npm run test:e2e` for UI flows. Add tests for behavioral changes, document new environment variables, and keep provider keys on the server. A pull request that changes GitHub permissions, token handling, uploads, or external AI data flow must explain its security impact.

## Commits and pull requests

- Keep changes focused and use clear imperative commit subjects.
- Link the relevant issue.
- Include screenshots or recordings for UI changes.
- Describe verification and known trade-offs.
- Do not commit `.env`, databases, tokens, recordings, or private issue content.

By contributing, you agree that your contribution is licensed under MIT.
