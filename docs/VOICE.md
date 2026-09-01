# Voice architecture and model decision

Decision reviewed: **2026-08-31**.

## Default

Git Master defaults to `gpt-4o-mini-transcribe` for dictation and `gpt-4o-mini` for short title/command tasks.

The choice optimizes the complete product path, not a single benchmark:

- strong multilingual recognition and better language recognition than original Whisper according to the [official OpenAI model page](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe);
- prompt context for developer vocabulary and the existing issue text;
- the same server API can handle transcription, title generation, and conservative structured command routing;
- the mini transcription model's listed audio-token price is half of `gpt-4o-transcribe` on the official model comparison;
- no always-open Realtime session is needed for short issue fragments, which keeps cost and operational complexity low.

For maximum accuracy and stronger code-switching/context hints, set:

```env
OPENAI_TRANSCRIBE_MODEL=gpt-transcribe
```

The current [GPT Transcribe model page](https://developers.openai.com/api/docs/models/gpt-transcribe) lists `$0.0045` per audio minute and describes it as the high-accuracy option for files and committed Realtime turns.

## Alternatives considered

| Provider/model | Public list price at review | Ukrainian | Decision |
| --- | ---: | --- | --- |
| OpenAI `gpt-4o-mini-transcribe` | Token-based; half the audio-token rate of `gpt-4o-transcribe` | Multilingual | Default price/quality path |
| OpenAI `gpt-transcribe` | $0.0045/min | Multilingual with language hints | Accuracy mode |
| Deepgram Nova-3 | $0.0058/min prerecorded, $0.0092/min streaming | Explicit `uk` support | Strong future provider option |
| Google Chirp 3 | $0.016/min | Explicit `uk-UA` support | Good quality, materially higher list price |
| Gemini general models | Token-based general audio understanding | Multilingual | Not selected as the dedicated dictation layer |

Sources: [OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe), [Deepgram models/languages](https://developers.deepgram.com/docs/models-languages-overview/), [Deepgram pricing](https://deepgram.com/pricing), [Google Chirp 3](https://docs.cloud.google.com/speech-to-text/v2/docs/chirp-model), and [Google Speech-to-Text pricing](https://cloud.google.com/speech-to-text/pricing).

List price does not prove Ukrainian accuracy. A serious deployment should run an evaluation set with its own speakers, microphones, accents, mixed Ukrainian/English technical terms, and background noise before changing providers.

## Contextual insertion

When recording starts, the editor saves its selection range. The server receives the existing text as a bounded prompt context. After transcription, the browser inserts the returned text at the saved range and restores the caret after it. Existing typed or dictated content is never replaced unless the user selected that range.

## Global commands

The command endpoint receives only the transcript plus small workspace context. It returns one allow-listed action. If AI is unavailable or malformed, the local parser handles explicit Ukrainian and English phrases. Outside the editor, unknown input becomes `unknown`, never `submit_issue`.

Issue publication remains explicit: “open a task” opens the editor; only “publish/save/submit” writes it.

### Numbered issue management

The deterministic router also handles issue-management commands before calling the text model:

- edit/open: `Редагувати задачу 432`, `Правити таск 432`, `Змінити ішю 432`, `Edit issue 432`;
- delete: `Видалити задачу 432`, `Знищити таск 432`, `Delete issue 432`, `Remove task 432`;
- move: `Перенести задачу 432 з In progress в Review`, `Move issue 432 from Review to Done`, or the shorter `Move task 432 to Backlog`.

When an issue editor is already open, Delete and Move may omit the issue number and target the current issue. A stated source column must match the issue's current status, and the destination must exactly match a Status column on the active board. Delete commands open the existing permanent-deletion confirmation instead of bypassing it.

The Edit/Delete/Move verbs and issue nouns are editable under **Settings → Голосові команди**. Each field accepts comma- or newline-separated literal aliases. The browser persists them in `localStorage` and sends the normalized, bounded lists only as command-routing context.

### Editor dictation mode

When an issue drawer is open, routing becomes deterministic and does not require an additional text-model call:

- explicit Save commands such as “Збережи задачу”, “Збережи і закрий”, or “Save this issue” submit the issue;
- explicit Cancel commands such as “Скасуй задачу”, “Відміни створення”, or “Close without saving” close the drawer without writing;
- explicit title, description, and comment commands preserve their specialized action;
- every other Ukrainian, English, or mixed fragment is appended to the active editor target: the issue description on Details, the new-comment composer on Comments, or the existing comment currently being edited.

The transcription request intentionally leaves the single `language` parameter unset for code-switching and supplies a bilingual Ukrainian-English prompt with GitHub and existing editor context instead. This matches the app's intended speech profile while preserving English identifiers inside Ukrainian sentences.

## Push-to-talk keyboard control

The focused-web-app voice shortcut defaults to the left `Alt` key:

- hold Alt by itself to record and release it to finish;
- press it twice within 300 ms to latch the recorder without holding the key;
- press it once or twice again to stop a latched recording;
- pressing another key or mouse button while Alt is down cancels and discards the attempt, so Alt-based operating-system shortcuts keep their normal behavior;
- the previous `Alt+V` default is migrated automatically, while explicitly customized bindings remain unchanged.

The new-issue shortcut defaults to `Alt+N` and opens the editor for the active repository. Both bindings are configurable in **Settings → Гарячі клавіші** and persist in browser `localStorage`. Physical `KeyboardEvent.code` values are stored so bindings remain stable when the keyboard layout changes. Plain unmodified shortcuts are ignored in form and editable fields.

### Native global control

The optional Tauri companion loads the configured Git Master server and injects only a desktop marker plus DOM events for voice press, release, and cancellation. A Rust listener observes global input without suppressing, storing, or logging it. Only left Alt starts voice capture; right Alt/AltGr is ignored, and any combined gesture cancels the recording before its audio is sent.

Tauri's standard global-shortcut plugin cannot register a modifier by itself, so the companion uses an explicit, tested state machine around the native input listener. Windows and macOS are supported; macOS requires Accessibility and Microphone permission. Linux support currently requires X11 because the native listener does not receive global events under Wayland.

The global desktop key is intentionally fixed to left Alt. Settings continue to configure the focused browser shortcut and the new-issue shortcut.

## Privacy

Audio is sent directly from the Git Master server to the configured OpenAI API and is not stored by Git Master. Cancelled Alt combinations discard the browser blob before transcription. Browser blobs become eligible for garbage collection after transcription. Consult the provider's current data controls and your organization's policy before processing sensitive speech.
