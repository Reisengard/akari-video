**English** | [日本語](./contract-2026-07-23-edit-json-v1-direction.ja.md)

# edit.json v1 treatment declaration (direction) contract

- Date: 2026-07-23
- Status: source of truth for the implementation round. Only the `direction` field is fixed.
- Depends on: `contract-2026-07-17-data-contract-versioning.md` (version required, additive evolution, and an explicit migration), `contract-2026-07-20-edit-json-v1-narration.md` (the precedent for a free string that is not a forced enum, and for who checks what), and section 8 of `contract-2026-07-22-edit-json-v1-beats.md` (the seat announced for `direction {}`).
- Scope: only the top-level `direction` field of edit.json, the treatment declaration. This document writes down the container and the validation duties. Which treatment parameters a preset expands into, and which rule numbers `intensity` scales, are consumer rules. They are a separate task and a separate contract. This document does not set them.

## 0. How version is used

Backward compatible. Follow section 0 of `contract-2026-07-22-edit-json-v1-beats.md`. **Do not bump `version`.**

- `direction` is an optional top-level field of edit.json. When it is absent, behavior matches the previous behavior exactly. There is no treatment declaration.
- An existing `edit.json` with no `direction` field is unaffected. An existing reader can pass an unknown field through. It is a tolerant reader.
- This is an optional field only, which is principle 1 of `contract-2026-07-17-data-contract-versioning.md`. No `version` bump is required.
- Both v0 (a single `source`) and v1 (`sources[]`) may use it. `direction` does not reference footage, so v0 and v1 treat it the same way. There is no version split like `beats[].src`.

## 1. Names

| Context | Name |
|---|---|
| The data model (the edit.json field name, the schema, code, and error messages) | `direction {}` |
| For a person (a report, the UI, the body of a document, a conversation with the owner) | treatment declaration |
| The field that states strength | `intensity`. Call it intensity for a person as well. Do not add another name for it. |

Those names are the text. Do not add another name, such as treatment mode, style assignment, or tension.

**`direction` is an object, not an array.** A treatment declaration is one statement about how to treat this file. It is a different kind of data from `beats[]`, which are observations with times. An array would leave open which item is in force, and whether the declaration switches by span. The container fixes the count at one. If a later edit needs a treatment that changes by span, design that as a future extension in section 7.

### How this differs from `output.look.intensity`

edit.json already has `output.look.intensity`. That value is the strength of a LUT, a real number in `[0, 1]`. `direction.intensity` is a different field and a different range, an integer in `[0, 100]`. The LUT value is how much of a color adjustment to apply. `direction.intensity` is the density of the treatment as a whole. The paths differ, `output.look.intensity` and `direction.intensity`, so the names do not collide. An error message and a report always show the full path. They do not say only "intensity".

## 2. Fixed schema

```jsonc
{
  "version": 1,
  "output": { "width": 1920, "height": 1080, "fps": 30 },
  "sources": [ /* unchanged */ ],
  "cuts": [ /* unchanged */ ],

  "direction": {                          // optional. An object. Not an array, so the file has one declaration.
    "preset": "youtube-long-standard",    // required. A non-empty string. Not a forced enum (section 3).
    "intensity": 50,                      // optional. An integer in [0, 100]. Default 50 (section 4).
    "overrides": {}                       // optional. An object. A seat for per-rule overrides. This contract does not define the vocabulary inside it.
  }
}
```

### Fields

| Field | Type | Required | Default | Meaning |
|---|---|---|---|---|
| `direction` | object, or omitted | No | Omitted means no treatment declaration | One object for the whole file. An array is invalid. |
| `direction.preset` | string | Required | none | A non-empty string. The identifier of a treatment preset. Examples: `youtube-long-standard`, `shorts-high-energy`, `calm-explainer`. Not a forced enum (section 3). |
| `direction.intensity` | integer | No | `50` | `[0, 100]`. One integer scales the density of the whole treatment (section 4). A real number is invalid. |
| `direction.overrides` | object | No | Omitted means no overrides | A seat for per-rule overrides. This contract does not define the vocabulary inside it (section 7). |

`preset` follows `audio.narration[].provenance.provider` and `beats[].kind`. It stays an example in the document. It is not a forced enum. Presets grow as footage genres and delivery targets grow. Fixing the list in the contract would require a schema revision every time one preset is added. A writer may use an unknown `preset` and static validation still passes. A consumer falls back to the default behavior in section 5 for an unknown `preset`.

`intensity` is an integer because it is one step a person picks on a control, not a continuous physical quantity. The difference between `0.5` and `0.51` has no meaning here, and cannot be given one. Closing the range to integers in `[0, 100]` gives the writer, the reader, and the report the same grain. `beats[].strength` is a real number in `[0, 1]`. That contrast matches the kind of each value. `intensity` is a person's setting. `strength` is a normalized analysis result.

## 3. Preset examples

These rows are examples. They are not an enum. Static validation still passes for a `preset` outside these three values.

| `preset` | Meaning |
|---|---|
| `youtube-long-standard` | A standard long video. An opening hook, set pieces only where they matter, a calm density. |
| `shorts-high-energy` | A dense short. More triggers, and stronger caption treatment. |
| `calm-explainer` | A calm explanation. Few sound effects, and the minimum ritual. |

The real parameter table, which sound effect a preset picks, how often captions appear, which transition it uses, is outside this contract (section 7). This contract states that `preset` is a non-empty string, and what these three names aim at.

## 4. What `intensity` means

`intensity` is the control that scales the density of the whole treatment with one integer.

| Value | Meaning |
|---|---|
| `0` | The minimum treatment. Only the ritual the preset defines remains. |
| `50` | The preset's own default. The same as omitting `intensity`. |
| `100` | The maximum density the preset allows. |

The consumer, the linked rules in the skills, holds the table of which number on which rule scales, and how. This contract states only that one integer scales the whole treatment. It does not state the mapping. The same split is in section 6 of `contract-2026-07-22-edit-json-v1-beats.md`, which leaves the function from `strength` to loudness and duration to a separate consumer contract.

The mapping changes often as treatment rules are added and removed. The container, one integer from 0 to 100 that scales the whole treatment, does not change. Putting the container and the mapping in the same contract would force a data-contract revision every time one rule is added.

## 5. Degradation

Apply the same design as section 4 of `contract-2026-07-22-edit-json-v1-beats.md`. **`direction` is an input declaration for treatment. It must not decide whether the picture itself exports.**

| Situation | Behavior |
|---|---|
| No `direction` field | Previous behavior. No treatment declaration. Not an error. |
| `direction` is not an object (an array, a string, a number, or another type) | Ignore the whole declaration, use the default behavior, and warn. Export continues. |
| `preset` is missing, empty, or not a string | Ignore the whole declaration, use the default behavior, and warn. Export continues. |
| `intensity` is out of range, not an integer, or not a number | Ignore the whole declaration, use the default behavior, and warn. Export continues. |
| `overrides` is not an object | Ignore the whole declaration, use the default behavior, and warn. Export continues. |
| Unknown `preset` | Not an error. The consumer falls back to the default behavior. |

The default behavior here is the first example in section 3, `preset` = `youtube-long-standard`, with `intensity` = `50`.

The unit of degradation is the whole `direction` object, not one field. That differs from `beats[]`. `direction` is one object, not an array (section 1). Adopting a partly broken declaration, for example a readable `preset` with a discarded `intensity`, would produce a third result that matches neither the writer's intent nor the default. If the declaration is broken, drop the whole declaration and use the default.

**The writer is strict. The reader is tolerant.** Static validation (`validate-edit.mjs` and `edit-lint`) rejects a bad shape or an out-of-range value as an error. A consumer (export and preview) ignores an invalid declaration at runtime and continues. Those two behaviors do not conflict. The first is the gate that refuses to write a broken file. The second is the insurance that still produces a picture when a broken file is handed over. The roles differ. This two-step pattern is already set by `beats` (section 4 of `contract-2026-07-22-edit-json-v1-beats.md`), `audio.narration` (sections 4 and 8 of `contract-2026-07-20-edit-json-v1-narration.md`), and `audio.bgm` and `audio.sfx` (section 5 of `contract-2026-07-14-edit-json-v1-audio.md`).

## 6. Validation

| Layer | What it checks |
|---|---|
| `packages/schemas/edit.schema.json` | Defines the shape as `$defs/direction`. `preset` is required and has a minimum length. `intensity` is an integer in `[0, 100]`. `overrides` is an object. Both `editV0` and `editV1` reference it from `properties.direction`. Keep `additionalProperties: true` (a tolerant reader). |
| `packages/schemas/bin/validate-edit.mjs` | Implements the same checks as errors. Validating `direction` does not look at the file system. `preset` is an identifier, not a path. |
| `packages/edit-lint` (`src/edit-lint.mjs`) | Implements the same structural checks as errors, as a handwritten copy with no extra dependency, in the same style as validate-edit. |

Absence of `direction` is not an error, under the existing edit-lint rule.

`overrides` is not validated inside. The check sees only that the type is `object`. This contract does not define the vocabulary (section 7), so it cannot define a check on the contents. An empty object `{}` is valid. Static validation still passes when the object contains unknown keys.

The check does not ask whether the `preset` string names a preset that exists. Because the value is not a forced enum (section 2), the validator cannot hold a known list. Section 5 covers an unknown `preset`.

## 7. Seats for later extensions

Outside this contract.

- The vocabulary inside `overrides`. Which key and which type override which rule. This contract opens only the seat, the fact that the value is an object, and does not define the keys.
- The real parameter table for a preset. Which treatment parameters each `preset` expands into. The consumer, the linked rules in the skills, holds that table.
- The mapping table for `intensity`. Which number on which rule a value from 0 to 100 scales, and how (section 4). The consumer holds that table as well.
- Growing presets by learning a style. A path that learns a treatment tendency from existing work and generates or adds a preset. Leaving `preset` as a free string (section 2) keeps this seat open. This contract does not set the rules for generating, registering, or naming those presets.

Each of those is a separate contract. This contract fixes only the container `direction {}`, and records that these seats may open later.
