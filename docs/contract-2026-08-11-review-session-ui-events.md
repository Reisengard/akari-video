**English** | [Japanese](./contract-2026-08-11-review-session-ui-events.ja.md)

# Review-session UI events (events.jsonl extension and the recording indicator)

- Date: 2026-08-11
- Status: source of truth for this implementation round. It fixes the added event shapes in events.jsonl, the target vocabulary, and the indicator behavior.
- Depends on `contract-2026-07-20-review-json-v1-annotation-model.md` (review.json v1 and the three principles of a lenient reader), and on review-session recording (`review/sessions/s-XXXX/` is audio.wav, events.jsonl, strokes.json, and edit.snapshot.json. Implementation: `apps/shell/extensions/akari-preview/src/node/review-session-writer.ts`). The original note of the decision basis is kept as a private internal record, the same way as doc-image-annotations and canvas-surface.
- Scope: **UI events (passive recording)** during a recording session, the **recording indicator**, and a **vocabulary reservation** for tool-mode events. Landing a `ui:` target on the review.json side (turning it into an annotation record) is fixed by the next implementation contract. This contract only reserves it in §6.

## 0. Version policy (backward compatible)

- The manifest `version: 1` in `session.json` stays. Every addition in this contract is a **new event type** in events.jsonl. The shape of existing events (`start` and the transport family) does not change.
- A reader (compile-review-session and the rest) **ignores an unknown type and continues** (lenient reader). An existing session with no new events is normal. Missing means that information is absent.
- `appendEvent` in `review-session-writer.ts` is a generic append that only validates `recT`. It does not need to change. The implementation of this contract stays on the **emitting side (browser)**.

## 1. Added event shapes (canonical)

Each line is one JSON object (JSONL). `recT` is seconds since recording started, the same base as existing events.

| type | Shape | When it fires | Stage |
|---|---|---|---|
| `ui.click` | `{recT, type: "ui.click", target, label, intent?}` | A click on a registered UI element (§2) | M1 |
| `ui.tab` | `{recT, type: "ui.tab", target, label}` | The active tab changes | M1 |
| `ui.panel` | `{recT, type: "ui.panel", target, label}` | The active panel changes (focus moves) | M1 |
| `tool.mode` | `{recT, type: "tool.mode", mode}` | The annotation tool mode changes | M2 (this contract reserves the vocabulary only) |

- `target` is a stable id string from the §2 vocabulary. Required.
- `label` is a human-readable name (for example `"Footage panel"`). Required. Transcription matching uses it to line up with what was said. An id alone cannot join the utterance "the footage panel at the top left".
- `intent` is an optional boolean. Set `true` only on a click while the select tool (M2) is active. Omitted means passive recording, with no intent marker.
- `mode` is `"neutral"`, `"pen"`, `"rect"`, or `"select"`. It is not emitted until the M2 implementation (reserved).

## 2. Target vocabulary v1

**Record only the element that was clicked. Do not trace the whole DOM.**

| Shape | Meaning | Example |
|---|---|---|
| `panel:<id>` | A main panel of the shell | `panel:assets`, `panel:inspector`, `panel:review`, `panel:timeline` |
| `tab:<id>` | A tab | `tab:assets-builtin` |
| `timeline:cut:<n>` | A cut on the timeline (cuts[] index) | `timeline:cut:3` |
| `timeline:item:<id>` | A cut on the v2 timeline (`tracks[].items[].id`. At compile time, project it to a legacy cuts[] index) | `timeline:item:cut-4` |
| `timeline:overlay:<id>` | An overlay on the timeline | `timeline:overlay:o-0002` |
| `asset:<path>` | Footage (project-relative, or a catalog id) | `asset:assets/broll/city.mp4` |
| `asset:<category>/<id>` | Footage from a catalog card. The key is `<category>/<id>` | `asset:still/br-typing-laptop` |

- **Registration.** An element that should be recorded opts in with the attribute `data-akari-ui="<target-id>"`. Resolve the click with one capture-phase listener, and round to the **nearest registered ancestor**. A click outside a registered element emits no event.
- Adding vocabulary is additive. A new `<prefix>:` is free to add. Changing the meaning of an existing one is forbidden.
- `label` comes from an attribute or from the registering side. Do not rely on extracting DOM text by machine.

## 3. When events fire

- Record UI events **only while a review session is recording**. Outside a session, remove the listener or no-op it. Do not watch all the time.
- Emit through the existing `appendEvent` RPC. Order is emit order. Monotonic `recT` stays the existing rule.

## 4. Recording indicator

- While a session is recording, **draw an orange-family frame around the whole screen except the review (annotation) panel**. The edge has a glow. Aim at the visual language of "recording" in a screen capture.
- Implement it as an overlay with `pointer-events: none`. **It takes no clicks and no other input.**
- Do not blink. A slow pulse is an implementation choice. Acceptance is that a person can tell recording is on at a glance, and that the frame does not get in the way of the work.
- Show it at the same moment the session starts. Hide it at the same moment the session ends. It always matches the record button's state.

## 5. Verification

- L0. Every existing test, plus the build.
- Unit tests on the emitting side. A click on a registered element produces the expected event. An unregistered element emits nothing. Outside a session, nothing is emitted.
- On a real device, start recording, click the footage panel, switch tabs, and stop. Measure that the matching lines land in events.jsonl in `recT` order. The indicator's evidence is a screenshot.
- Regression. An old reader (the compile-review-session procedure) processes an events.jsonl that contains the new events and does not error.

## 6. Where an annotation lands

- **`ui:<element-id>`** on `annotations[].target` in review.json is for a UI-element annotation that comes through the select tool. It uses the same id space as §2. An overlay, for example, lands on `ui:timeline:overlay:<id>`.
- render-cut appends a verified export artifact to `sources[]` of edit.json v1. `path` is relative to the project root, and `proxy` is `null`. If the same `path` is already present, do not append. Use an id derived from the output stem that does not collide with an existing id. Do not rewrite existing fields or formatting. If edit.json cannot be reread or parsed, leave a warning only. Do not undo a successful export. v0 cannot hold `sources` in the schema, so do not auto-append, and warn in the same way.
- While a video file that matches `sources[].path` is open in the raw preview and that tab is focused, an annotation lands on `src = sources[].id` and on `sourceT`, the raw preview's current playback position in source seconds. The composer shows the target as a chip `🎞 <source id>`. A file that does not match stays a normal annotation with `src: null`, as before. Do not invent a new target kind.
- A footage range of sound does not create a new `audio:` target. It uses `src = sources[].id` and a half-open `sourceRange: [start, end)`. Overlay sound such as BGM uses the existing `overlay:<id>` or `ui:timeline:overlay:<id>`. An audio file opens in a dedicated audio preview, separate from the current-position link of the raw video preview. The range-selection UI is out of scope for this contract.
