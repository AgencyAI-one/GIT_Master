# Architecture

Git Master is a single-process Next.js application designed for self-hosting. It keeps operations simple without leaking provider credentials to the browser.

## Boundaries

```mermaid
sequenceDiagram
  participant U as Browser
  participant A as Git Master API
  participant D as Encrypted SQLite
  participant G as GitHub API
  participant O as OpenAI API

  U->>A: Signed HTTP-only session
  A->>D: Read encrypted connection
  D-->>A: AES-GCM ciphertext
  A->>A: Decrypt token in memory
  A->>G: REST or GraphQL request
  G-->>A: Repository/project/issue data
  A-->>U: Normalized public model
  U->>A: Audio Blob + editor context
  A->>O: Transcription request
  O-->>A: Transcript
  A-->>U: Text inserted at saved caret
```

The browser never receives `OPENAI_API_KEY`, `APP_SECRET`, `ENCRYPTION_KEY`, or a stored GitHub token.

## Source layout

```text
src/app/api/             Authenticated HTTP boundary
src/components/workspace Product UI and browser recording
src/lib/github.ts        GitHub REST/GraphQL adapter
src/lib/voice.ts         Transcription, title, and command adapter
src/lib/db.ts            SQLite connection repository
src/lib/auth.ts          Password sessions
src/lib/crypto.ts        AES-256-GCM token envelope
tests/                   Unit, adapter, and browser tests
```

## GitHub model

Connections contain a token and a visibility constraint: account, organization, or repository. The constraint is enforced when repositories are listed; every downstream operation also carries an explicit `owner/repository` value.

For Projects v2, Git Master reads the project's single-select `Status` field and item values through GraphQL. Dragging a card updates that exact field. Without a selected Project, the board uses repository issues and maps these labels:

```text
status: backlog
status: in progress
status: review
status: done
```

Closed issues are always displayed as Done. Moving a Done issue back reopens it.

## Persistence

SQLite stores connection metadata and encrypted tokens. WAL mode allows concurrent reads while a connection is added or removed. The database is a runtime volume and must not be committed or baked into a container image.

Token envelopes use this versioned structure:

```text
v1.<12-byte-IV>.<GCM-auth-tag>.<ciphertext>
```

Changing `ENCRYPTION_KEY` makes existing tokens unreadable. Export or reconnect them before rotating the key; automatic key rotation is intentionally not implied.

## Failure behavior

- An issue is returned even when adding it to a Project fails; the UI surfaces a warning to prevent accidental duplicate creation.
- Status moves are optimistic and roll back if GitHub rejects the update.
- Natural-language command routing falls back to conservative local rules if the text model fails.
- Unknown speech never becomes a write action.
- Voice is optional; GitHub issue management remains available without an AI key.
