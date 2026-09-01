# Security model

## Protected assets

- GitHub personal access tokens
- OpenAI API key
- Private issue content returned through Git Master
- The ability to mutate issues, comments, Projects, and repository attachment paths

## Controls

- `APP_PASSWORD` is compared with a timing-safe comparison.
- Sessions are HMAC-SHA256 signed, HTTP-only, `SameSite=Lax`, secure in production, and expire after 14 days.
- Login attempts are limited per forwarded client IP in a 15-minute window.
- GitHub tokens are encrypted with AES-256-GCM and a unique random IV before SQLite writes.
- API requests verify the signed session, validate bodies with Zod, and never return connection tokens.
- Content Security Policy denies framing, objects, foreign scripts, and foreign connections.
- Browser microphone access is limited to the same origin through `Permissions-Policy`.
- Uploads are limited to 10 MB; audio uploads are limited to 25 MB.
- All provider secrets stay server-side.

## Deployment requirements

1. Terminate TLS at a trusted reverse proxy.
2. Set all required secrets; never deploy development defaults.
3. Keep the SQLite volume private and backed up.
4. Restrict GitHub tokens to the smallest repository and permissions set.
5. Protect access to logs. Provider errors may contain repository metadata, though tokens are not intentionally logged.
6. Set proxy headers correctly; login limiting uses the first `X-Forwarded-For` value.
7. Rotate tokens and app secrets after suspected exposure.

## Known trade-offs

The built-in login rate limiter is in memory and applies per application instance. Multi-instance internet-facing deployments should enforce a distributed limit at the reverse proxy. The app uses a shared password and is intended for a trusted small team or private deployment, not tenant-isolated public SaaS.

GitHub attachment commits are visible to everyone who can read the target repository. Do not upload secrets or files with a broader audience than the issue.

See the repository-level [security policy](../SECURITY.md) for responsible disclosure.
