**English** | [Japanese](./contract-2026-08-23-stroke-persistence.ja.md)

---
lifecycle: implemented
created: 2026-08-23
updated: 2026-09-12
---

# Persistent annotation strokes

- Date: 2026-08-23
- Status: **implemented**
- Depends on `contract-2026-08-11-review-session-ui-events.md` and `contract-2026-07-20-review-json-v1-annotation-model.md`
- Scope: the output preview in the Theia shell, reading `strokes.json` for a review session, and the trace path through compile-review-session and address-review

## 1. Display during a session

- pen and rect are still recorded in normalized coordinates. The top left of the preview frame is `(0, 0)` and the bottom right is `(1, 1)`. On display, map them onto the current content rect. A window resize or a change of output aspect does not change the stored coordinates.
- After pointerup, play the existing glow, sparkle, and 600 ms fade, then leave the same normalized shape on the static bitmap that follows. Starting a new recording session clears the previous session's display. Ending a recording does not clear it. Revised 2026-09-12. See §1.1.
- The stroke canvas uses `pointer-events: none` while it is not drawing. It becomes the input surface, as before, only during a drag in pen or rect mode.
- The annotation panel checkbox "Show strokes" defaults to on. Off hides leftover strokes and strokes that were shown again on purpose. It does not delete data. Turning it back on redraws immediately from the stored normalized coordinates.

### 1.1 Display lifetime (added 2026-09-12)

- Strokes display near the playhead. While recording, the distance is `recT - recTEnd`. When showing strokes again outside recording, the distance is `|playheadT - frame.timelineT|`. Show only the nearest stroke, or the nearby strokes.
- The single source for the display rule is `PEN_TUNING.visibleWindowSec` (default 8 seconds) and `PEN_TUNING.fadeOutMs` (default 1500 ms). Inside the time window the stroke is opaque. A stroke past the window fades over `fadeOutMs` and then hides.
- `fadeOutMs` is the display lifetime. It is not `fadeDurationMs` (600 ms), which still owns the sparkle and the drawing feel immediately after pointerup.
- Stopping a recording clears the on-screen display pool. It does not change the recorded `strokes.json`. Strokes from a finished session can be shown again, so there is no manual clear button.

## 2. Read and show an existing session again

`readReviewSessionStrokes({projectRootUri, sessionId})` reads `review/sessions/<sessionId>/strokes.json` and returns the following.

```jsonc
{
  "sessionId": "s-0001",
  "strokes": [/* pen or rect. Keeps frame and recTStart/recTEnd */],
  "warnings": []
}
```

- A missing `strokes.json` finishes normally as `strokes: []`.
- An array root, or a `{strokes:[]}` whose `version` is not 1, is read leniently as an old shape.
- Broken JSON, an unknown element, or an element outside the value range is dropped per stroke and kept as a warning. Do not fail the session list or the other strokes along with it.
- Each recorded session in the annotation panel can show strokes again from "Stroke". The display message includes `target.tab` (the edit URI) and the first stroke's `target.recT`. Seek the preview to the same frame with `frame.sourceT` and `cutIndex`.

## 3. Source reference after compile

The data `version` of review.json stays at 0. compile-review-session adds the following optional field to a paired pen or rect. It does not change existing fields.

```jsonc
"strokeRefs": [{
  "sessionId": "s-0001",
  "strokeId": "st-0001",
  "sessionRef": "s-0001/st-0001"
}]
```

- `strokeRefs` is `null`, omitted, or an array of one or more items. A missing value is valid old data.
- pen still also embeds `strokes[].points`, at most 100 points, so `strokeRefs` can return to the unprocessed source. rect still embeds `targetKind:"region"` plus `region.box`, and the same `strokeRefs` can return to the rect source inside `strokes.json`.
- The address-review list shows `strokeRefs` as `review/sessions/<sessionId>/strokes.json#<strokeId>`.

## 4. Compatibility

- Use added fields only. Do not delete an existing field, change its meaning, or bump the data version.
- A reader keeps unknown fields, treats a missing optional field as old data, and does not guess-convert a data version higher than one it knows.
- `packages/preview-server` is out of scope. Do not change WebUI display behavior.
