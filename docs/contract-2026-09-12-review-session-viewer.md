**English** | [Japanese](./contract-2026-09-12-review-session-viewer.ja.md)

---
lifecycle: draft
created: 2026-09-12
updated: 2026-09-12
---

# Review-session viewer

- Date: 2026-09-12
- Status: draft
- Depends on: `contract-2026-08-11-review-session-ui-events.md` and `contract-2026-08-23-stroke-persistence.md`
- Scope: synchronized audio, output Preview, strokes, and transcript against the recording clock `recT`, plus a diff between `edit.snapshot.json` at record time and the current `edit.json`

## 0. Version and compatibility

This feature does not change the shape of the original files under `review/sessions/s-NNNN/`. It only reads them. A missing file, a broken line, or an unknown field degrades to a warning or to no information, and the known remainder is still shown. The reader is tolerant. It does not migrate or write back the recorded originals, the manifest, or edit.json.

## 1. `readReviewSessionBundle`

Input:

| Field | Type | Meaning |
|---|---|---|
| `projectRootUri` | `string` | Project-root URI inside the workspace |
| `sessionId` | `string` | Session id in `s-NNNN` form |

Output:

| Field | Type | Meaning |
|---|---|---|
| `sessionId` | `string` | The session id that was read |
| `audioUri` | `string \| null` | File URI of `audio.wav`. `null` when the file is missing |
| `audioDurationSec` | `number` | Recording duration from the WAV header. `0` when it cannot be read |
| `events` | `ReviewSessionEvent[]` | Valid lines, stable-sorted by ascending `recT` |
| `strokes` | `ReviewStroke[]` | Strokes from the existing tolerant strokes reader |
| `transcript` | `ReviewSessionTranscriptSegment[] \| null` | Utterance list. `null` when not compiled |
| `proposals` | `ReviewSessionProposalSummary[] \| null` | Display summary of target resolution. `null` when missing |
| `editSnapshotText` | `string \| null` | Raw snapshot text at 8 MiB or less |
| `warnings` | `string[]` | Why an original or a line was skipped |

Only an invalid id, a path outside the workspace, or a missing session directory throws. Every other gap or corruption returns the remainder and does not write the originals.

## 2. Map from `recT` to `timelineT`

State is `{playing, anchorTimelineT, anchorRecT, rate}`. Position is:

`playing ? anchorTimelineT + (recT - anchorRecT) * rate : anchorTimelineT`

| Event | Anchor and state update |
|---|---|
| `start` | Anchor `timelineT` and `recT`, set `playing` from the recorded value, `rate=1` |
| `play` | Compute the current position first. Anchor a valid `timelineT` or the current position. `playing=true` |
| `pause` | Anchor a valid `timelineT` or the current position. `playing=false` |
| `seek` | `to` becomes the timeline anchor. The event `recT` becomes the rec anchor |
| `rate` | Anchor the current position first, then set rate from a positive `value` |
| `tick` | Re-anchor from the event `timelineT` and `recT` |
| `end` | Anchor a valid `timelineT` or the current position. `playing=false` |

This is the same time map as `compile-review-session`. The viewer treats `audio.currentTime` as the source of truth for `recT`. Seeks into the output Preview are throttled on the existing requestAnimationFrame path.

## 3. Showing strokes again

Stroke lifetime and fade follow `contract-2026-08-23-stroke-persistence.md` and `PEN_TUNING.visibleWindowSec`. The viewer attaches the session strokes to Preview, moves the recording playhead, and detaches on close. It does not change draw rules or the originals.

## 4. Transcript and target display

When `transcript.json` exists, utterances are listed and the utterance that contains the current `recT` is emphasized. A click seeks to that utterance's start `recT`. `compile-proposals.json` is matched by the same index as the utterance, and the row adds `target`, `sourceT`, and a low-confidence "needs a look" mark. This ticket only shows the resolution so a person can check it. UI that edits the target is a later step. The not-compiled path only copies a fixed sentence. It does not run compile.

## 5. Diff against `edit.snapshot.json`

Both documents are read with `readInternalEdit`. Items on every track, and recursive children, are matched by id. The shown changes are five kinds: add, delete, an `at` move, a `duration` change, and a footage-interval change of a media source's `in` and `out`. Several changes on one item are shown separately. A v0 or v1 snapshot says that the old format cannot produce a diff. It is not migrated.

## 6. Picture

The picture surface uses the output Preview of the current `edit.json`. It does not search for or restore the footage or the picture from record time.

## 7. Non-goals

- Rewriting audio, events, strokes, the snapshot, the transcript, or proposals
- Running compile, or generating a transcript
- Editing compile's target resolution or annotation contents
- Restoring the picture or the footage from record time
