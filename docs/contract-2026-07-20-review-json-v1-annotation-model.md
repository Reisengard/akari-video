**English** | [日本語](./contract-2026-07-20-review-json-v1-annotation-model.ja.md)

# review.json v1 annotation model (five target kinds)

- Date: 2026-07-20
- Status: source of truth for the implementation round. Only the shape of an `annotations[]` record in `review.json` is fixed.
- Depends on: section 2 of the direction memo for the first review UI, which this contract promotes. The memo itself stays in private internal records. Also sections 3 and 4 of `contract-2026-07-18-edit-json-v1-sources.md` (the rule that `(src, source seconds)` is what gets persisted, and the spread of `src` into review.json), `contract-2026-07-17-data-contract-versioning.md` (the three principles), and `contract-2026-07-14-edit-json-v1-crop.md` (the precedent for the coordinate rationale and for degradation).
- Scope: only the shape of an `annotations[]` record in `review.json`. The capture UI (drawing a rectangle, a pen, a spoken annotation at the same time, an asset picker) is not covered (section 9).

## 0. How version is used

Backward compatible. **The data `version` stays `0`.** Do not bump it. Every field this contract adds is an optional field on the record. When it is absent, behavior matches the previous behavior exactly.

- The "v1" in the contract name is a wave nickname, the same as the edit.json v1 family (crop, audio, sources). It is a different axis from the data `version: 0`. The same treatment as section 0 of `contract-2026-07-14-edit-json-v1-audio.md`. The schema `$id` `urn:akari-video:schema:review:v1` is on the nickname side as well.
- Evolution is additive only. The reader is tolerant. Keep unknown fields. Fill a missing field from its default. When a reader sees a `version` higher than the one it knows, it does not guess a conversion. It stops in read-only and says so (principle 3). This is implemented in three places: `parseReview` in `annotation-store.ts`, `validate-review.mjs`, and `edit-lint`.
- Turning on the reserved field `strokes` is an additive change. An old implementation only nulls it, with a warning, when it reads. It has no path that rewrites an existing row (it only appends, and it only replaces a status row). An old reader therefore does not destroy new data on a round trip.

## 1. Fixed schema

Source of truth: `packages/schemas/review.schema.json` (`$id: urn:akari-video:schema:review:v1`, `additionalProperties: true`). Example: `packages/schemas/examples/review-v1-sample/review.json`.

```jsonc
{
  "version": 0,
  "annotations": [
    {
      "id": "a-0007",
      "createdAt": "2026-07-20T09:12:00.000Z",

      // Time anchor. Existing. The meaning does not change.
      "src": "s1",                 // optional. A reference to edit.json v1 sources[].id. null or omitted = single-source compatibility
      "sourceT": 12.4,             // required. Source seconds. The same coordinate system as cuts[].in and out
      "sourceRange": [12.4, 15.0], // optional. [start, end) in source seconds. null = an instant

      // What the note is about. New. Additive only.
      "targetKind": "region",      // optional. "instant" | "range" | "region" | "asset" | "insert" | null
                                   // null = an old record. Interpret instant or range from whether sourceRange is present
      "region": { "box": [0.62, 0.08, 0.30, 0.22] }, // optional. Normalized [x, y, w, h], 0 to 1, against the source frame
      "strokes": null,             // the reserved field, now active. An array of object strokes. Section 1.1
      "refs": null,                // optional. [{ "src": "s2" } or { "path": "assets/broll/city.mp4" }]
      "insertPosition": null,      // optional. "before" | "after" | null. For targetKind insert

      // Intent and body. The rest of the four-part set in memo section 2.
      "intent": "reframe",         // optional. A free string. The recommended vocabulary is section 3
      "text": "The face is out of frame. Move in here.",  // existing field. The body

      // Existing fields whose behavior does not change.
      "timelineT": null,           // deprecated (section 2). A new write is always null
      "target": null,              // the old field. This round gives it no meaning (section 5)
      "input": "typed",
      "audio": null,
      "poses": null,               // still reserved. A performance capture. A different feature
      "status": "open",
      "response": null
    }
  ]
}
```

### Fields

New and changed fields only. Existing fields stay as they were.

| Field | Type | Required | Default | Unit and coordinates |
|---|---|---|---|---|
| `src` | string or null | No | null | A reference to edit.json v1 `sources[].id`. Promoted from section 4 of the 2026-07-18 sources contract |
| `targetKind` | enum or null | No | null, which means the old-record interpretation | `instant`, `range`, `region`, `asset`, or `insert` |
| `region` | `{ box: [x, y, w, h] }` or null | No | null | Normalized 0 to 1, against the source frame. The same form as `faceBox` and `crop.box`. `x + w <= 1` and `y + h <= 1` |
| `strokes` | `stroke[]` or null | No | null | An object stroke from section 1.1. Points are normalized 0 to 1. One stroke has at least two points |
| `refs` | an array of `{src}` or `{path}`, or null | No | null | `src` and `path` are exclusive inside one entry. `path` is relative to the project |
| `insertPosition` | `"before"`, `"after"`, or null | No | null | Before or after the timeline projection of the anchor `(src, sourceT)` |
| `intent` | string or null | No | null | A free string. Recommended vocabulary in section 3. Not a forced enum |
| `timelineT` | number or null | No | null | Deprecated (section 2). A new write is always null |

### 1.1 Review session and document-surface rider

Pin the additions that are already implemented, so every consumer uses the same shape.

- `input` is `"typed"`, `"voice"`, or `"session"`.
- `status` is `"open"`, `"addressed"`, or `"resolved"`. `addressed` means the AI has responded. It does not mean a person has confirmed it. Treat it as unresolved. Only `resolved` means a person has confirmed it.
- `sourceT: null` is allowed only when `target` is `doc:<path>#<block-id>`, `image:<path>`, or `canvas:<c-NNNN>`. On a video surface, a source second of at least 0 is still required.
- `strokes[]` is an object `{tool: "pen", space, points, ...}`. `content-rect` requires `frame: {sourceT, cutIndex?}` and `sessionRef`. `image-rect` and `canvas-rect` have no `frame`. For those two, `sessionRef` and `canvasRef` are optional.

The executable specification lives in one place, `packages/schemas/fixtures/review/`. `validate-review` and `edit-lint` both consume every valid case and every invalid case. A fixture that only one of them owns must not hide a contract difference.

## 2. Coordinates

### Time

Persist `(src, source seconds)`.

Follow the rule in section 3 of the 2026-07-18 sources contract as it is. Persist an annotation as `(src, sourceT or sourceRange)`. Do not persist the timeline seconds you got by converting them. On each display, project onto timeline seconds from the `cuts[]` of that moment. That stops an annotation from drifting when cuts are reordered, trimmed, or reused.

`timelineT` is an old field from before that rule. Deprecate it in place. The additive-only principle means the field is not deleted. The type stays. A write always writes `null`. A reader that sees a non-null value warns and does not use the value as evidence.

### Space

Normalized 0 to 1 against the source frame.

Coordinates in `region.box` and `strokes` are normalized 0 to 1 against the source frame. They are not against the output frame after compositing. The reason matches section 2 of the crop contract. If you persist output coordinates, the coordinates rot quietly the moment that cut's `crop` keyframe changes later. Source coordinates stay stable, independent of a later reframing decision. The form of `box` is the same as `faceBox` in `analysis.schema.json` and `crop.keyframes[].box`: `[x, y, w, h]`, with `x + w <= 1` and `y + h <= 1`. One rectangle form across the contracts.

## 3. How targetKind agrees, and how it resolves

`targetKind` is a discriminator. The fields each kind expects are advice. A miss is a warning, not an error. Null or omitted means an old record. Interpret instant or range from whether `sourceRange` is present, as before.

| `targetKind` | Expected fields | When they are missing |
|---|---|---|
| `instant` | `sourceT` alone is enough | none |
| `range` | `sourceRange` is not null | warning |
| `region` | `region` or `strokes` is not null. If both are present, `region.box` wins, and warn | warning |
| `asset` | `refs` is not null and not empty | warning |
| `insert` | `insertPosition` is present | warning |

### Resolving an insert anchor

`targetKind` is `insert`.

- The anchor is `(src, sourceT)` plus `insertPosition`. It means "insert before or after the timeline position that corresponds to this source instant". An insert at the start is the first instant that survives, plus `before`. An insert at the end is the last instant that survives, plus `after`.
- When the anchor is not covered by the current `cuts[]` (a cut dropped it), do not discard the annotation. Do not erase a person's intent. Leave automatic placement unresolved, and edit-lint warns with `review.insert-anchor-unresolved`.
- When the same `(src, sourceT)` is covered by more than one cut (the v1 one-to-many map), use the first cut that matches in `cuts[]` array order, and warn with `review.insert-anchor-ambiguous`. This follows section 4 of the crop contract, which uses index 0 in array order.
- On v1 (more than one source), an insert anchor with no `src` cannot be resolved. Warn.

### Recommended intent vocabulary

Not a forced enum.

`cut`, `keep`, `reframe`, `insert`, `replace`, `reorder`, `fix`, `pace`, `mute`, `caption`, `question`, `praise`, `other`. These are hints for the UI and for the AI. The validator checks only that the string is non-empty. Adding a word does not require a version change.

## 4. Degradation

An annotation is advice. It must not decide whether export, preview, or lint as a whole succeeds. The same idea as section 6 of the crop contract and the M5 rule "if it is no good, do not use it". The reader (`annotation-store.ts`) ignores only the broken element, with a warning, and does not drop the whole file.

| Situation | Behavior |
|---|---|
| `targetKind` is an unknown value | Treat it as null and warn. Still show the record. |
| `region` or `strokes` has a bad shape | Null only that field, and warn. |
| Some strokes inside `strokes` are invalid | Drop only the invalid strokes, keep the rest, and warn. |
| Some `refs` entries are invalid (both `src` and `path`, or neither) | Drop only the invalid entries, and warn. |
| The file named by `refs[].path` does not exist | edit-lint warning `review.refs-file`. Not an error. |
| An insert anchor was dropped by a cut | Leave automatic placement unresolved and warn (section 3). Keep the annotation. |
| `timelineT` is not null | Warn, and do not use the value. Project again from `cuts[]`. |
| `poses` is not null | Ignore it as a reserved field, and warn. As before. |
| `version > 0` | Stop in read-only and say so (principle 3). The file uses a newer format. Update the skill or the app. |

## 5. Why the data is shaped this way

- The record is flat optional fields plus a discriminator, not a nested union such as `target: {kind, ...}`. Existing records already hold `sourceT` and `sourceRange` flat, and that matches the line-level surgical edit in `annotation-store.ts` (one record is one line, and `serializeAnnotationLine` concatenates fields in order). An old record, with no discriminator, stays valid as it is.
- The old `target: string | null` field is left alone. Nothing has ever written a non-null value, and no documented meaning exists. Renaming it would be a breaking change and would require a bump, so this round leaves it. This section only discloses the name collision with `targetKind`. Cleaning it up is the next stage.
- `refs` does not carry a catalog reference (`category`, `id`, `scope`). The asset library's rule is copy, do not link. By the time an annotation can point at something concrete, the target is a body path inside the project or a `sources[].id`. Do not bring scope-resolution vocabulary into the sidecar.
- Correspondence with the four-part set in memo section 2. The subject is the bundle of `src`, `sourceT`, `sourceRange`, `targetKind`, `region`, `strokes`, `refs`, and `insertPosition`. The intent is `intent`. The body is `text`, which is not renamed. The reference is `refs`.

## 6. Common mistakes

- Mixing up `target` and `targetKind`. `target` is the old field, effectively unused (section 5). The subject classification is `targetKind`.
- Writing `region.box` or `strokes` in output-frame coordinates, after compositing. That is wrong. They are against the source frame (section 2). The capture UI persists a displayed coordinate only after the inverse of the crop transform. Saving a drawing on a preview that already has crop, as-is, rots the coordinate.
- Writing a value into `timelineT`. That is wrong. Project the timeline position from `cuts[]` on every display.
- Validating `intent` as a closed enum. That is wrong. It is a free string plus a recommended vocabulary (section 3).
- Expecting `refs[].src` to resolve on edit.json v0, a single source. The reference check runs only for edit.json v1. The same treatment as `src` on captions.
- Reading the end of `sourceRange` as included. It is `[start, end)`, the same as `cuts[].in` and `out`.

## 7. Migration

Empty. No `version` bump has happened. When a bump happens, write the machine-runnable old-to-new conversion here in the same change. Principle 2 of `contract-2026-07-17-data-contract-versioning.md`.

## 8. Who checks what

| Layer | Where | Duty |
|---|---|---|
| Reference document | `packages/schemas/review.schema.json` | Source of truth for the shape. A tolerant reader, `additionalProperties: true` |
| One-file check | `packages/schemas/bin/validate-review.mjs` | Structure, ranges, and unique ids. `targetKind` agreement is a warning on stderr and does not change the exit code |
| Cross-file check | `packages/edit-lint` (`validateReview`) | edit.json v1 reference checks for `src` and `refs[].src`, insert-anchor resolution, whether `refs[].path` exists, and fixtures as the executable specification |
| App read and write | `annotation-store.ts` | A tolerant parse (degradation in section 4) and a line-level surgical write. A version guard |

The overlap between validate-review and edit-lint is on purpose. It is the same relationship as validate-edit and edit-lint. The single-file check is the fast gate next to the schema. edit-lint is the gate across the project.

## 9. Next stage

Out of scope for this contract.

- Capture UI. Drawing a rectangle, a freehand pen, a spoken annotation at the same time, and an asset picker. That side fills the fields in this contract. The inverse-map warning is in section 6.
- Turning `poses` on. Performance capture. A different feature.
- Cleaning up the old `target` field. It needs a bump, so it is a separate decision.
- Adding `targetKind` metadata to the `annotation-created` event under `.akari/events`.
- A deeper pass on how this relates to the three response channels (decisions.json, review.json, and git diff). The current behavior of the `response` field is unchanged.
