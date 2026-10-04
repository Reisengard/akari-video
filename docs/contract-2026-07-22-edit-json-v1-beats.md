**English** | [日本語](./contract-2026-07-22-edit-json-v1-beats.ja.md)

# edit.json v1 moment-marker (beats) contract

- Date: 2026-07-22
- Status: source of truth for the implementation round. Only the `beats` field is fixed.
- Depends on: `contract-2026-07-17-data-contract-versioning.md` (version required, additive evolution, and an explicit migration), `contract-2026-07-18-edit-json-v1-sources.md` (section 3, the source-second anchor), and `contract-2026-07-20-edit-json-v1-narration.md` (the precedent for id rules and for who checks what).
- Scope: only the top-level `beats` field of edit.json, the moment markers. Generating beats (analysis and extraction) and consuming them (syncing a treatment, showing them on the edit map) are separate tasks. This document only writes down the data container and the validation duties.

## 0. How version is used

Backward compatible. Follow section 0 of `contract-2026-07-14-edit-json-v1-audio.md` and section 0 of `contract-2026-07-20-edit-json-v1-narration.md`. **Do not bump `version`.**

- `beats` is an optional top-level field of edit.json. When it is absent, behavior matches the previous behavior exactly. There are no moment markers.
- An existing `edit.json` with no `beats` field is unaffected. An existing reader can pass an unknown field through. It is a tolerant reader.
- This is an optional field only, which is principle 1 of `contract-2026-07-17-data-contract-versioning.md`. No `version` bump is required.
- Both v0 (a single `source`) and v1 (`sources[]`) may use it. The only difference is how `src` is treated (section 2).

## 1. Names

| Context | Name |
|---|---|
| The data model (the edit.json field name, the schema, code, and error messages) | `beats[]` |
| For a person (a report, the UI, the body of a document, a conversation with the owner) | moment marker |

Those two names are the text. Do not add another name, such as highlight, chapter, or climax marker. The data name is the one English word `beats`. The name for a person is "moment marker". A reader of the code and a reader of a report can tell they are the same thing.

## 2. Fixed schema

```jsonc
{
  "version": 1,
  "output": { "width": 1920, "height": 1080, "fps": 30 },
  "sources": [
    { "id": "s1", "path": "assets/intro.mp4", "proxy": null },
    { "id": "s2", "path": "assets/main.mov", "proxy": null }
  ],
  "cuts": [ /* unchanged */ ],

  "beats": [                    // optional. An array
    {
      "id": "b-0001",           // required. ^b-\d{4}$. Unique inside edit.json
      "src": "s2",              // optional. A reference to sources[].id. Omitted = single-source compatibility
      "t": 42.0,                // required. Source seconds. At least 0
      "kind": "reveal",         // required. A non-empty string
      "strength": 0.8,          // required. A number in [0, 1]
      "basis": "a peak in audio energy, plus the spoken line about an entrance"  // optional. Free text for why the analysis marked it
    }
  ]
}
```

### Fields

| Field | Type | Required | Default | Unit and coordinates |
|---|---|---|---|---|
| `beats` | array, or omitted | No | Omitted means no moment markers | none |
| `beats[].id` | string | Required | none | `^b-\d{4}$`. Unique inside edit.json. The same shape of rule as `audio.narration[].id` |
| `beats[].src` | string | No | Omitted means single-source compatibility | A reference to `sources[].id`. On v0 (a single `source`) it cannot be used, because there is no id to reference |
| `beats[].t` | number | Required | none | Source seconds (section 3). At least 0 |
| `beats[].kind` | string | Required | none | A non-empty string. Examples: `hook`, `turn`, `punchline`, `reveal`, `emotion`. Not a forced enum |
| `beats[].strength` | number | Required | none | `[0, 1]`. Closer to 1 is a stronger moment |
| `beats[].basis` | string | No | none | Free text for the analysis basis (section 5) |

`kind` follows `audio.narration[].provenance.provider`. It stays an example in the document. It is not a forced enum. The vocabulary of a moment grows with the footage genre. Fixing the list in the contract would require a schema revision every time a word is added. A writer may use a new `kind` and validation still passes. A consumer falls back to the default handling for an unknown `kind` (section 6).

`strength` is a continuous value from 0 to 1. It is an input hint for mapping onto the strength of a treatment, such as the loudness of a sound effect or how showy a transition is. It is a normalized value with a floor and a ceiling so a consumer can compare relatively, and can test a threshold, without knowing each footage item's absolute scale.

## 3. Coordinates

A source-second anchor.

**Persist `beats[].t` as `(src, source seconds). Do not persist the timeline seconds you got by converting them.**

This applies the following rule from section 3 of `contract-2026-07-18-edit-json-v1-sources.md` to beats.

> Persist captions, annotations, and analysis results as `(src, source seconds)`. Do not persist the timeline seconds you got by converting them. On each display and on each export, project onto timeline seconds from the `cuts[]` of that moment.

A beat is an analysis result. It is a fact about the footage, where a moment is, not a result of the edit, where someone placed it. It is exactly what that rule covers. The consequences:

- A consumer (treatment sync, the edit-map display, export) projects onto timeline seconds from `cuts[]` on every display and every export. It does not write the projected time back into edit.json.
- The same source range can appear more than once on the timeline, so the map from source seconds to timeline seconds is one-to-many (the same section 3). One beat projecting to several timeline positions is normal. It is not an error.
- A beat whose source seconds fall in no cut, a moment in a span the cut dropped, has no projection target on the timeline. That is also normal. The consumer treats it as zero projection results.
- Rearranging cuts, or reusing the same range, does not require rewriting beats. A drift from a baked-in time cannot happen, by construction.

This contrasts with `overlays[].start`, `audio.bgm`, `audio.sfx`, and `audio.narration[].t`, which are timeline seconds. Section 3 of the sources contract says overlay `start`, BGM, and sound effects stay in output-timeline coordinates and are outside the source-second rule. A beat is a fact about the footage. Narration and a sound effect are a treatment the edit placed. The coordinate difference matches that difference in kind.

Omitting `src` means single-source compatibility, the same as `items[].src` in `captions.json` and `annotations[].src` in `review.json` (section 4 of the sources contract). On v0, a single `source`, there is no id to reference, so the presence of `src` itself is invalid. Section 7's check reports an error.

## 4. Degradation

Apply the same idea as section 5 of `contract-2026-07-14-edit-json-v1-audio.md`. Audio is decoration and must not decide whether the picture itself exports. **A beat is an input hint for a treatment. It must not decide whether the picture itself exports.**

| Situation | Behavior |
|---|---|
| No `beats` field | As before. No moment markers. Not an error. |
| `beats` is not an array | The consumer treats all beats as absent and warns. Export continues. |
| An element's `id`, `kind`, `strength`, or `t` is invalid | Ignore that one element and warn. Other beats, the picture, and the audio are unaffected. |
| An element's `src` does not resolve to a `sources[].id` | Same as above. Ignore that one element and warn. The same shape as the `cuts[].src` degradation in section 6 of `contract-2026-07-18-edit-json-v1-sources.md`. |
| `t` falls in no cut | Neither an error nor a warning. Treat it as zero projection results (section 3). |
| An unknown `kind` | Not an error. The consumer falls back to the default handling (section 6). |

The writer is strict. The reader is tolerant. It is not a contradiction that static validation (`validate-edit.mjs` and `edit-lint`) rejects a bad form or an out-of-range value as an error, while a consumer (export and preview) ignores one bad element at run time and continues. The first is a gate that stops a broken file from being written. The second is insurance that a broken file that was handed over still produces a picture. The roles differ. This two-step pattern follows the precedent already set for `audio.narration` (sections 4 and 8 of `contract-2026-07-20-edit-json-v1-narration.md`) and for `audio.bgm` and `audio.sfx` (section 5 of `contract-2026-07-14-edit-json-v1-audio.md`).

## 5. Why the field is named `basis`

During internal design, the free-text field for the analysis basis was tentatively named `source`, meaning the basis of the analysis. edit.json already had three words: `source` (the v0 single-footage object), `sources[]` (the v1 footage array), and `src` (`cuts[].src`, `beats[].src`, and other footage references). All three mean the picture footage. If `source` in the same file meant both "footage" and "analysis basis", a schema reader, an implementer, and a reader of an error message would all mix them up. It was renamed to `basis`, which does not collide. From then on, the word for an analysis basis is `basis`. Every `source` word means picture footage.

## 6. What a consumer is expected to do

What this contract fixes, and what it does not.

This contract fixes only how a beat is written: the form, the coordinates, and validation. What treatment actually fires when a beat is read (which sound effect, which transition, the curve of a BGM change, the function that maps `strength` onto loudness and duration, and the concrete default for an unknown `kind`) is out of scope. A separate consumer contract fixes that.

This contract imposes only two invariants on a consumer.

1. Respect the source-second anchor (section 3). Project onto timeline seconds from `cuts[]` on every consume. Do not persist the result.
2. Respect the degradation rule (section 4). Ignore an invalid or unresolvable element one at a time. Do not stop the whole export.

## 7. Verification

| Layer | What it checks |
|---|---|
| `packages/schemas/edit.schema.json` | Define the structure as `$defs/beatItem` (types, the `id` pattern, required fields, the `strength` range, and the minimum length of `kind`). Both `editV0` and `editV1` reference it from `properties.beats`. Keep `additionalProperties: true` (a tolerant reader). |
| `packages/schemas/bin/validate-edit.mjs` | In addition, check what JSON Schema alone cannot express. `id` is unique inside the file. `src` references resolve. On v1, an id that is not in `sources[].id` is an error. On v0, the presence of `src` itself is an error. The same treatment as `cuts[].src`. |
| `packages/edit-lint` (`src/edit-lint.mjs`) | Implement the same structural checks as validate-edit (those are errors), with no extra dependency, as a handwritten copy. |

`id` uniqueness and `src` reference checks are not in JSON Schema because both need to compare values across sibling elements or sibling fields, and the standard JSON Schema vocabulary cannot express that. The same reason, and the same split, as `cutV1.src` and `audio.narration[].id`.

edit-lint does not compare the real source duration with `beats[].t`. That keeps the rule that, without `--media`, it does not decode media. Checking that `t` is past the real footage duration is a later problem. When it is needed, design it as another contract that measures the real duration (ffprobe or similar). A missing `beats` field, and a missing `analysis.json`, are not errors, which matches the existing edit-lint principle. Report them as skipped.

## 8. Room for a later extension

Out of scope for this contract.

- `emphasis_words[]`, word-level emphasis. Data for which word to emphasize, a finer grain than beats. This contract only mentions the seat. It does not define the field.
- `direction {}`, an explicit treatment preset and strength. Data that keeps beats as the observation of what happened, and holds "how to treat it" separately. This contract only mentions the seat. It does not define the field.

Both are other contracts. This contract fixes only the container for `beats[]`, and it records that these seats may open later.
