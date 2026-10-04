**English** | [日本語](./contract-2026-07-20-plan-json-v0.ja.md)

# plan.json v0 contract (provisional timeline)

## Addendum, 2026-09-13. The provisional-timeline role is retired

The provisional-timeline role of plan.json (`confidence`, `fill`, and the processing in section 6) is retired. The current provisional frame is a still-image media item on an edit.json v2 timeline, plus a `<path>.meta.json` next to the footage. See section 1 of `contract-2026-09-13-generation-v0.md` (Japanese). The planning layer (`research-plan.json` and `planning/`) stays. The body below is kept so the old contract and the migration history remain.

- Date: 2026-07-20
- Status: source of truth for the implementation round. Only the data shape and validation are fixed. The provisional-frame compiler follows the rules in section 6. The implementation is the next stage.
- Depends on: the direction memo for the provisional timeline, sections 3 through 5, which this contract promotes. The memo itself stays in private internal records. Also `contract-2026-07-17-data-contract-versioning.md` (the three principles), `contract-2026-07-18-edit-json-v1-sources.md` (the join rule in section 2, and the compile target in section 6), and `contract-2026-07-13-m5-analysis-report.md` (the editorial-judgment report, which is another rendering of this data).
- Scope: the data shape of `plan.json`, validation, where the file lives, and the rule for connecting it to edit.json. Dialogue UI, ghost drawing, the compiler implementation, and recording integration are not covered (section 11).
- About the name. `packages/render-cut/src/plan.mjs` is a non-persistent builder of an ffmpeg command plan. It has nothing to do with this contract. The names only overlap. `skills/edit-plan` is the skill name for the editorial-judgment report. Section 5 says that skill and this data converge.

## 0. How version is used

- This is a new contract, so the checklist in section 4 of `contract-2026-07-17-data-contract-versioning.md` applies from the first version. Top-level `version` is an integer starting at 0. Evolution is additive only. The reader is tolerant (`additionalProperties: true`). Keep unknown fields. Fill a missing field from its default.
- A reader that sees a `version` higher than the one it knows does not guess a conversion. It stops in read-only and says so. `validate-plan.mjs` implements this.
- This is different on purpose from the old schemas (analysis, connections, asset-meta), which set `additionalProperties: false`. Those were designed before the versioning contract. This contract follows the newer precedent that complies with the versioning contract, the same side as `edit.schema.json`.
- Field names are snake_case, the precedent of the contracts that have a `.schema.json` (connections, asset-meta, analysis). review.json is camelCase because it is existing material, so the naming families differ. Both contracts state the split and fix it. A schema-first contract is snake_case. A contract that came from existing TypeScript material is camelCase.

## 1. Fixed schema

Source of truth: `packages/schemas/plan.schema.json` (`$id: urn:akari-video:schema:plan:v0`).
Example: `packages/schemas/examples/plan-v0-sample/plan.json`.
Location: the same `<plan-dir>` as the editorial-judgment report. In an AKARI project the `planning/` role is the default. Follow the output-location rule in workflow.md section 1. Every relative path is relative to the directory that contains plan.json, the same shape as edit.json path resolution.

```jsonc
{
  "version": 0,
  "slots": [
    {
      "id": "s-opening",
      "label": "Opening",                         // human-readable beat name, shown in the report and on the timeline
      "script": "Hello. Today...",                 // teleprompter script and the draft narration text for TTS. May be null
      "target_duration_seconds": 5.0,
      "confidence": "proposed",                    // "proposed" | "locked" | "filled" (section 3)
      "fill": {                                    // how the slot is filled (section 4)
        "method": "generate",                      // null | "generate" | "record" | "import" (null = not decided)
        "prompt": "A bright desk, seen from above...", // for generate. May be null
        "asset_path": null                         // for import. Relative path after copy, do not link
      },
      "media": {                                   // the current stand-in, the body of the provisional frame
        "image_path": "scaffold/beat-01.png",      // still. May be null
        "audio_path": "scaffold/beat-01.wav",      // TTS audio. May be null
        "text_card": null                          // for a beat that is type only. May be null
      },
      "provenance": { "tool": "codex-image", "created_at": "2026-07-20T11:00:00.000Z", "note": "..." }
    }
  ],
  "constraints": [
    { "id": "c-total", "kind": "duration_exact", "applies_to": null, "value": 30.0, "note": "Fixed at a 30 second duration" },
    { "id": "c-sfx",   "kind": "note",           "applies_to": "s-main", "value": null, "note": "A hit sound effect at the start" }
  ]
}
```

### Fields

| Field | Type | Required | Default | Unit and coordinates |
|---|---|---|---|---|
| `version` | integer (const 0) | Yes | none | none |
| `slots[]` | array | No | `[]` (an empty plan just after dialogue starts is valid) | Array order is timeline order (section 2) |
| `slots[].id` | string | Yes | none | Unique inside the plan |
| `slots[].label` | string | Yes | none | none |
| `slots[].script` | string or null | Key required | null | Source of truth for the teleprompter and for TTS (section 4, record) |
| `slots[].target_duration_seconds` | number > 0 | Yes | none | Seconds |
| `slots[].confidence` | enum | Yes | none | `proposed`, `locked`, or `filled` (section 3) |
| `slots[].fill.method` | enum or null | Key required | null means not decided | `generate`, `record`, or `import` (section 4) |
| `slots[].fill.prompt` | string or null | No | null | For generate |
| `slots[].fill.asset_path` | string or null | No | null | For import. Relative to plan.json |
| `slots[].media.*` | string or null | Key required | null | `image_path` and `audio_path` are relative to plan.json |
| `slots[].provenance.*` | none | Key required | null | `tool`, `created_at` (ISO-8601), `note` |
| `constraints[]` | array | No | `[]` | none |
| `constraints[].kind` | enum | Yes | none | `duration_max` (a hard cap), `duration_exact` (a target duration), `note` (an unstructured locked instruction) |
| `constraints[].applies_to` | string or null | Key required | null means the whole project | A slot id reference |
| `constraints[].value` | number > 0, or null | Key required | none | Required for `duration_*`, in seconds. Null for `note` |

"Key required" means the value may be null, but the key is not omitted. The same habit as `sourceV1.proxy`. A record describes itself.

## 2. How the timeline is derived

Do not persist `start`.

**The timeline is `slots[]` joined in array order with no gaps.** A slot's start time is the sum of `target_duration_seconds` of the slots before it. There is no `start` field. This applies, one stage upstream, the same rule as edit.json v1, "join `cuts[]` in array order with no gaps" (section 2 of `contract-2026-07-18-edit-json-v1-sources.md`). There is no redundant field that drifts every time the order changes. Reordering slots is only reordering the array.

A boundary such as "the piece ends at 30 seconds" is not the contents of a slot. It is a constraint (`duration_exact` or `duration_max` with `applies_to: null`). In a timeline that has no single correct answer, separate the facts that are already decided as constraints. Do not mix them with the hypothesis (slot order and durations).

## 3. confidence transitions

Retired. See the addendum of 2026-09-13.

`confidence` is a stored field. Do not derive it from whether `media` is present. Locked and not yet filled, "the slot is empty but the direction is fixed", is a valid state. If confidence were derived, a lock before recording could not be expressed.

| State | Meaning | Display (UI rule for the next stage) |
|---|---|---|
| `proposed` | The AI's hypothesis | Ghost display (dotted, translucent) |
| `locked` | A person fixed it (a decision-card commit, or explicit approval) | Fixed display |
| `filled` | Real footage is in the slot | Ordinary display |

Recommended transition. This is a prose rule. The schema does not force it. `proposed`, then human approval, then `locked`, then the fill in section 4 runs, then `filled`. A reverse transition (`filled` back to `locked` or `proposed`) is allowed when a person asks for it explicitly. An inconsistency is a warning, and validation does not stop. Examples: `filled` while every media field is null, or `fill.method` still undecided when confidence is not `proposed`.

## 4. fill

How a slot gets filled. Retired. See the addendum of 2026-09-13.

An empty slot already knows `script` and `target_duration_seconds` from the plan. There are three fill methods, plus undecided.

- `null` (not decided). A valid state during dialogue. The default for a `proposed` slot.
- `generate`. AI generation. Image first. The first picture goes to `media.image_path`, then provisional-frame QA, then video generation after approval. `prompt` is the AI hypothesis before generation, and it may be updated to the value actually used at run time. Provenance is "which hand, and when". Fill is "what, and how". Do not store the prompt in both places.
- `record`. A screen or camera recording. The teleprompter reads `slot.script` directly. There is no copied field. Recording detail such as `takes[]` and device is reserved as an added field in v1 or later.
- `import`. Assign existing footage. `asset_path` is the path of the body inside the project, after the asset library's copy, do not link, rule. Do not bring a library-layer reference into the plan.

## 5. Scope boundary

The three-way footage choice stays in M5.

plan.json v0 holds only the sequential skeleton (`slots`) and the structural constraints (`constraints`). The three-way choice for BGM, caption direction, sound effects, B-roll, and caption style (propose it if the library has it, generate it if not, do not use it if neither is good enough) stays under the footage plan in section 5 of the editorial-judgment report (`contract-2026-07-13-m5-analysis-report.md`). Do not bring it into plan.json. A placed instruction such as "I want a sound effect here" travels as a locked instruction with `constraints[].kind: note`. Selecting or generating the footage itself stays on the M5 side.

The report and plan.json are two renderings of the same plan (memo section 4). For now, plan.json is the source of truth for the skeleton, and the report cites plan.json slot ids as its evidence. See the addendum in report-guide.md. Driving the whole report-generation flow from plan.json is the next stage.

The link to decision-cards is loose. The question dialogue that fixes direction uses the existing pair `<plan-dir>/plan-dialogue.html` plus `.decisions.json`. No code change is required. The confirmed result is written into plan.json. plan.json itself has no decision id. `decision_ref` is reserved as a candidate addition in v1 or later.

## 6. Preview composite rule

Compile to an ordinary edit.json v1. Retired. See the addendum of 2026-09-13.

Playback of the provisional frame (animatic QA) does not get a dedicated renderer. It is a compile to an ordinary edit.json v1. The point of this rule is that preview, edit-lint, and render-cut work with no modification. **Do not add even one new word to edit.json.**

- Each slot is baked into one ordinary source. Loop `media.image_path` for `target_duration_seconds`, stack `media.audio_path` (TTS) on it, and make one clip with ffmpeg. Register it in `sources[]`. `cuts[]` follows array order. A slot that is only `text_card` compiles to a plain-background source plus an HTML fragment under the existing overlay rule (one root, `data-start` and `data-duration`).
- Place files under `<plan-dir>/scaffold/`: `edit.json`, `sources/`, `overlays/`, and `manifest.json`. `manifest.json` maps a slot to the compiled artifacts. It holds `{ version, plan_ref, plan_hash (sha256 of the plan.json text), compiled_at, slots: [{ slot_id, source_id, cut_index, overlay_id or null }] }`. This round documents it only. It is not a schema yet.
- Regeneration rule. Always rebuild everything. Do not patch a part. Provisional footage is cheap. That cheapness is why the provisional frame exists. Do not import the hard problem of tracking correspondence after a reorder. When `plan_hash` matches, you may skip a recompile of an unchanged plan.
- The compiled `scaffold/edit.json` is self-contained by itself. An engineer who does not know plan.json can preview, lint, and export it. That meets the self-contained rule of the edit.json contract literally.
- Note. The hard rule in `skills/edit-plan`, "do not change the v0 single-source shape of edit.json", applies to the final artifact of the edit-plan flow. This scaffold is a different artifact. That rule is still written as it was before the v1 sources contract (2026-07-18). Disclosing that as an open owner decision is required. This contract does not change the rule.
- The compiler implementation is out of scope for this round. Only the rule is fixed.

## 7. Degradation

A plan is planning data. Do not fail validation, display, or the whole downstream flow because of it.

| Situation | Behavior |
|---|---|
| `slots` or `constraints` is missing | Treat it as empty. That is a valid plan just after dialogue starts. |
| A file named by `media.*` or `fill.asset_path` does not exist | validate-plan is an error. Do not allow a false fill record. The display draws that slot as unfilled and does not take the others down with it. |
| `confidence` is `filled` but every media field is null | Warning (section 3). Validation does not stop. |
| `fill.method` is null when confidence is not `proposed` | Warning. |
| `duration_max` is exceeded | Error. It is a hard cap. Do not accept a plan that contradicts a locked fact. |
| `duration_exact` disagrees with the sum of the slots | Warning. Converging on the target duration is the provisional-frame QA itself. |
| `constraints[].applies_to` names a slot that does not exist | Error. The reference is broken. |
| `version > 0` | Stop in read-only and say so (principle 3). |

## 8. Why the data is shaped this way

- Slots and constraints are separate because "it probably goes in this order" (a column of hypotheses) and "this is decided" (a fact) have different lifetimes and different owners. Mixing them sends the section 2 problem, a timeline with no single correct answer, back into the data.
- There is no `start` because of section 2. A redundant coordinate always drifts. Do not repeat the timeline-time lesson one stage upstream.
- `media` is separate from `fill` because `media` is "what it looks like now" (the stand-in) and `fill` is "how it will finally be filled". A slot that will be generated can hold a still stand-in during the provisional stage. That falls out of the split.
- Keys are required and values may be null so that reading one record shows every field of the contract. That is self-documentation when an AI writes plan.json directly. The precedent is `sourceV1.proxy`.

## 9. Common mistakes

- Writing `start` or a timeline second onto a slot. That is wrong. Position is derived from array order plus duration (section 2).
- Expressing "it ends at 30 seconds" as the duration of the last slot. That is wrong. Use `duration_exact` or `duration_max` on `constraints`, with `applies_to: null`.
- Bringing BGM or sound-effect selection into plan.json. That is wrong. Section 5. A placed instruction stops at `kind: note`.
- Deriving `filled` from "media is not null". That is wrong. Confidence is a stored field (section 3).
- Copying a script field for recording. That is wrong. The teleprompter reads `slot.script`.
- Hand-editing `scaffold/edit.json`. That is wrong. The full rebuild in section 6 deletes it on the next compile. Edit plan.json, or edit the real edit.json after you move into the ordinary edit flow.
- Confusing this file with `plan.mjs` in render-cut. They are different. See the note in the header.

## 10. Migration

Empty. No `version` bump has happened. When a bump happens, write the machine-runnable old-to-new conversion here in the same change. Principle 2 of `contract-2026-07-17-data-contract-versioning.md`.

## 11. Next stage

Out of scope for this contract. Retired. See the addendum of 2026-09-13.

- Implement the provisional-frame compiler. Follow section 6. Run image generation and TTS, bake with ffmpeg, and write the manifest.
- A richer question-dialogue UI. For now, the existing decision-cards mechanism stands in. See `skills/edit-plan/plan-json.md`.
- Ghost drawing on the timeline. Display by confidence. Integrate it into the strip drawing in akari-annotations.
- Recording integration. `takes[]`, device, and the teleprompter UI for `fill.record`.
- A `decision_ref` field, so decision-cards can be traced more tightly.
- An edit-lint check across plan.json and manifest.json, after the compiler exists.
- Rendering the editorial-judgment report from plan.json. That completes the convergence in section 5.
