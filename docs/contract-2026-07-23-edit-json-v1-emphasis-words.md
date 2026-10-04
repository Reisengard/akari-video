**English** | [日本語](./contract-2026-07-23-edit-json-v1-emphasis-words.ja.md)

# edit.json v1 word-level treatment (emphasis_words) contract

- Date: 2026-07-23
- Status: source of truth for the implementation round. Only the `emphasis_words` field is fixed.
- Depends on: `contract-2026-07-17-data-contract-versioning.md` (version required, additive evolution, and an explicit migration), section 3 of `contract-2026-07-18-edit-json-v1-sources.md` (the source-second anchor), `contract-2026-07-20-edit-json-v1-narration.md` (the precedent for id rules and for who checks what), and `contract-2026-07-22-edit-json-v1-beats.md` (section 8 named `emphasis_words[]` as a future seat. This contract opens that seat).
- Scope: only the top-level `emphasis_words` field of edit.json, the words a word-level treatment may target. Generating emphasis words (which words to select) and consuming them (how to draw them) are separate tasks. This document writes down the data container and the validation duties.

## 0. How version is used

Backward compatible. Follow section 0 of `contract-2026-07-22-edit-json-v1-beats.md`. **Do not bump `version`.**

- `emphasis_words` is an optional top-level field of edit.json. When it is absent, behavior matches the previous behavior exactly. There is no word-level treatment.
- An existing `edit.json` with no `emphasis_words` field is unaffected. An existing reader can pass an unknown field through. It is a tolerant reader.
- This is an optional field only, which is principle 1 of `contract-2026-07-17-data-contract-versioning.md`. No `version` bump is required.
- Both v0 (a single `source`) and v1 (`sources[]`) may use it. The only difference is how `src` is treated (section 2).

## 1. Names

| Context | Name |
|---|---|
| The data model (the edit.json field name, the schema, code, and error messages) | `emphasis_words[]` |
| For a person (a report, the UI, the body of a document, a conversation with the owner) | word-level treatment |

Those two names are the text. Do not add another name, such as emphasis word, keyword treatment, or word highlight. As with `beats[]` (moment marker), the data name is the English `emphasis_words` and the name for a person is "word-level treatment". A reader of the code and a reader of a report can tell they are the same thing.

`beats[]` and `emphasis_words[]` differ in grain. They coexist. One does not exclude the other.

| Field | Grain | Time | What it points at |
|---|---|---|---|
| `beats[]` | A moment (a representative point of a span) | A single time `t` | Where the peak of the footage is |
| `emphasis_words[]` | A word (one word of speech) | A span from `t_start` to `t_end` | Which word is a target of treatment |

## 2. Fixed schema

```jsonc
{
  "version": 1,
  "output": { "width": 1920, "height": 1080, "fps": 30 },
  "sources": [
    { "id": "s1", "path": "assets/intro.mp4", "proxy": null }
  ],
  "cuts": [ /* unchanged */ ],

  "emphasis_words": [            // optional. An array.
    {
      "id": "e-0001",            // required. ^e-\d{4}$. Unique inside edit.json.
      "src": "s1",               // optional. A reference to sources[].id. Omitted means single-source compatibility.
      "t_start": 132.40,         // required. Source seconds. At least 0.
      "t_end": 132.82,           // required. Source seconds. t_end > t_start.
      "word": "hurts",           // required. A non-empty string. Faithful to the transcript spelling.
      "emotion": "pain",         // required. A non-empty string.
      "style_hint": "one-char-bang"  // optional. A suggestion to the renderer. No force.
    }
  ]
}
```

### Fields

| Field | Type | Required | Default | Unit and coordinates |
|---|---|---|---|---|
| `emphasis_words` | array, or omitted | No | Omitted means no word-level treatment | none |
| `emphasis_words[].id` | string | Required | none | `^e-\d{4}$`. Unique inside edit.json. The same shape of rule as `beats[].id` and `audio.narration[].id`. |
| `emphasis_words[].src` | string | No | Omitted means single-source compatibility | A reference to `sources[].id`. On v0 (a single `source`) it cannot be used, because there is no id to reference. |
| `emphasis_words[].t_start` | number | Required | none | Source seconds (section 3). At least 0. |
| `emphasis_words[].t_end` | number | Required | none | Source seconds (section 3). At least 0, and `t_end > t_start`. |
| `emphasis_words[].word` | string | Required | none | A non-empty string. Faithful to the transcript spelling (section 4). |
| `emphasis_words[].emotion` | string | Required | none | A non-empty string. Examples: `joy`, `pain`, `surprise`, `anger`, `sadness`, `emphasis`. Not a forced enum. |
| `emphasis_words[].style_hint` | string | No | none | A suggestion to the renderer. Examples: `one-char-bang`, `size-pulse`, `color-accent`. No force (section 6). |

`emotion` follows `beats[].kind` and `audio.narration[].provenance.provider`. It stays an example in the document. It is not a forced enum. Emotion vocabulary grows with the footage genre, the language, and the detector. Fixing the list in the contract would require a schema revision every time a word is added. A writer may use a new `emotion` and validation still passes. A consumer falls back to the default handling for an unknown `emotion` (section 6).

`style_hint` is a suggestion, not a specification. The writer, the detector, can record that this word suits a one-character bang. The consumer, the renderer, keeps the decision of how to draw it. A consumer that ignores `style_hint` does not violate this contract. The hint has no force because the drawing vocabulary (outside the scope in section 8) is decided after this contract. The side that is decided first does not bind the side that is decided later.

## 3. Coordinates

A source-second anchor.

**Persist `emphasis_words[].t_start` and `t_end` as `(src, source seconds). Do not persist the timeline seconds you got by converting them.**

This applies the following rule from section 3 of `contract-2026-07-18-edit-json-v1-sources.md` to emphasis words. The same basis is in section 3 of `contract-2026-07-22-edit-json-v1-beats.md`.

> Persist captions, annotations, and analysis results as `(src, source seconds)`. Do not persist the timeline seconds you got by converting them. On each display and on each export, project onto timeline seconds from the `cuts[]` of that moment.

An emphasis word is an analysis result. It annotates a fact about the footage, where something was spoken and what was spoken. It is not a result of the edit, where someone placed it. It is exactly what that rule covers. The consequences:

- A consumer (drawing, preview, export) projects onto timeline seconds from `cuts[]` on every display and every export. It does not write the projected time back into edit.json.
- The same source range can appear more than once on the timeline, so the map from source seconds to timeline seconds is one-to-many (the same section 3). One word projecting to several timeline positions is normal. It is not an error.
- A word whose source seconds fall in no cut, a word in a span the cut dropped, has no projection target on the timeline. Zero projection results is normal. The consumer treats it as zero projection results.
- A word span that crosses a cut boundary is the consumer's judgment, including how to draw a word that only partly remains. This contract does not require the data side to split the span.
- Rearranging cuts, or reusing the same range, does not require rewriting emphasis words. A drift from a baked-in time cannot happen, by construction.

This contrasts with `overlays[].start`, `audio.bgm`, `audio.sfx`, and `audio.narration[].t`, which are timeline seconds (the same section 3). An emphasis word annotates a fact about the footage. Narration and a sound effect are a treatment the edit placed. The coordinate difference matches that difference in kind.

Omitting `src` means single-source compatibility, the same as `items[].src` in `captions.json` and `beats[].src` (the same section 4). On v0, a single `source`, there is no id to reference, so the presence of `src` itself is invalid. Section 7's check reports an error.

## 4. Relation to word-level timestamps

Use a measured time.

**`t_start` and `t_end` use a word-level timestamp that is already measured. Do not invent a time in the middle of a word.**

The source is one of these:

- `transcriptSegment.words` in `analysis.json` (`packages/schemas/analysis.schema.json`)
- `words[]` in `captions.json`

Both hold a start time and an end time per word, as the recognizer output them. `t_start` and `t_end` on an emphasis word copy those values as they are. Do not build a word time by dividing a sentence-level segment time into a guess of "about here."

The rule exists because a word-level treatment works only when it syncs to the spoken word at frame accuracy. A time made by dividing a span drifts by hundreds of milliseconds, and the sync breaks no matter how precise the renderer is. It also becomes impossible to tell whether the drift came from the data or from the renderer. Limiting the time to a measured value keeps the responsibility for sync accuracy at one place, the accuracy of the recognizer.

`word` is faithful to the transcript spelling for the same reason. A normalized or cleaned spelling loses the link to the source word-level timestamp, and a later cross-check becomes impossible.

This contract does not decide which words to select (section 8). It decides only how a selected word is recorded.

## 5. Degradation

Apply the same design as section 5 of `contract-2026-07-14-edit-json-v1-audio.md`, which says audio is decoration and must not decide whether the picture itself exports. **A word-level treatment is decoration. It must not decide whether the picture itself exports.**

| Situation | Behavior |
|---|---|
| No `emphasis_words` field | Previous behavior. No word-level treatment. Not an error. |
| `emphasis_words` is not an array | The consumer treats the whole field as absent and warns. Export continues. |
| `id`, `t_start`, `t_end`, `word`, or `emotion` on one element is invalid | Ignore that one element and warn. Other words, the picture, and the audio are unaffected. |
| `src` on one element does not resolve to a `sources[].id` | Ignore that one element and warn. The same shape as the degradation rule for `cuts[].src` in section 6 of `contract-2026-07-18-edit-json-v1-sources.md`. |
| `t_start` and `t_end` fall in no cut | Neither an error nor a warning. Treat it as zero projection results (section 3). |
| Unknown `emotion` | Not an error. The consumer falls back to the default handling (section 6). |
| Unknown `style_hint` | Not an error. The consumer may ignore it (section 2). |

**The writer is strict. The reader is tolerant.** Static validation (`validate-edit.mjs` and `edit-lint`) rejects a bad shape or an out-of-range value as an error. A consumer (export and preview) ignores one invalid element at runtime and continues. Those two behaviors do not conflict. The first is the gate that refuses to write a broken file. The second is the insurance that still produces a picture when a broken file is handed over. The roles differ. This two-step pattern is already set by `beats` (section 4 of `contract-2026-07-22-edit-json-v1-beats.md`), `audio.narration` (sections 4 and 8 of `contract-2026-07-20-edit-json-v1-narration.md`), and `audio.bgm` and `audio.sfx` (section 5 of `contract-2026-07-14-edit-json-v1-audio.md`).

## 6. What a consumer must do

This contract states how emphasis words are written. That covers the shape, the coordinates, the measured-time rule, and validation. What treatment a consumer actually produces from them is outside this contract. That includes how the letters appear, the map from `emotion` to color and motion, whether `style_hint` is adopted, and the concrete default for an unknown `emotion`. A separate consumer contract sets those.

This contract imposes two invariants on a consumer.

1. Respect the source-second anchor (section 3). Project onto timeline seconds from `cuts[]` on every use. Do not persist the result.
2. Respect the degradation rule (section 5). Ignore an invalid or unresolvable element one at a time. Do not stop the whole export.

## 7. Validation

| Layer | What it checks |
|---|---|
| `packages/schemas/edit.schema.json` | Defines the shape as `$defs/emphasisWordItem`. Types, the `id` pattern, required fields, non-negative `t_start` and `t_end`, and a minimum length on `word` and `emotion`. Both `editV0` and `editV1` reference it from `properties.emphasis_words`. Keep `additionalProperties: true` (a tolerant reader). |
| `packages/schemas/bin/validate-edit.mjs` | Also checks what JSON Schema alone cannot say. `t_end > t_start`. `id` is unique inside the file. `src` resolves. On v1, an id missing from `sources[].id` is an error. On v0, the presence of `src` itself is an error. The same treatment as `cuts[].out > in` and `cuts[].src`. |
| `packages/edit-lint` (`src/edit-lint.mjs`) | Implements the same structural checks as errors, as a handwritten copy with no extra dependency, in the same style as validate-edit. |

`t_end > t_start`, unique `id`, and `src` resolution stay out of JSON Schema because each one compares sibling elements or sibling fields. The standard JSON Schema vocabulary cannot express that. The same reason and the same split as `cutV0.out > in`, `cutV1.src`, and `beats[].id`.

Validating emphasis words does not look at the file system. An element does not reference a footage file, so there is no existence check to run. That differs from `audio.narration[].file`.

edit-lint does not compare `t_start` and `t_end` with the real duration of the source. It keeps the rule that it does not decode media without `--media`. The same treatment as `beats[].t` (section 7 of `contract-2026-07-22-edit-json-v1-beats.md`). A check that the time exceeds the real duration of the footage is future work. Design it as a separate contract that includes a real-duration probe, such as ffprobe, when it is needed.

The check does not cross-check `word`, `t_start`, and `t_end` against the word-level timestamps in `analysis.json` or `captions.json`. The rule in section 4 is a discipline the writer keeps. It is not a subject of static validation, because the source file is optional and the check cannot be formed when that file is absent. A cross-check is future work. Absence of `emphasis_words`, and absence of `analysis.json`, is not an error, under the existing edit-lint rule.

## 8. Outside this contract

Seats for later extensions.

- Detection rules. Which words to select, including emotion estimation, keyword extraction, thresholds, and a cap on the word count. This contract sets only the record shape of a selected word. A separate contract sets the selection rules.
- Drawing rules. How each `style_hint` value is actually drawn, including a one-character bang, the map from `emotion` to color and motion, and how overlay HTML is generated. This contract sets only the container that passes a suggestion to the consumer. A separate contract sets the drawing.
- Karaoke fill and vertical writing. A fill that follows the progress of a word, and a vertical layout. Those expressions assume word-level times, but the fields they need (fill direction, line composition, a per-character split) cannot be expressed in this container. This contract names the seat and does not define the fields. A separate contract sets them.

Each of those is a separate contract. This contract fixes only the container `emphasis_words[]`, and records that these seats may open later.
