**English** | [日本語](./contract-2026-07-25-recipe-v0.ja.md)

# recipe.json v0 (freezing a recipe and remembering a preference)

- Date: 2026-07-25
- Status: **draft, waiting on owner review**. A new data contract is an owner ruling. This document is drafted for that review. In particular, the location `~/.akari/recipes/` in section 2 is the first contract that creates a lasting file outside a project, in the user's home directory. It is marked as an owner ruling.
- Depends on: `contract-2026-07-17-data-contract-versioning.md` (the source of truth for the three principles), `contract-2026-07-25-plan-comments-v0.md` (the sister contract just before this one, the precedent for voice, form, and marking a draft), `packages/schemas/intake.schema.json` (existing vocabulary such as `target`. See section 6), and `packages/schemas/edit.schema.json` (the existing vocabulary of `narrationProvenance.engine` and `voice`).
- Origin: freeze a confirmed preference and reuse it. Record only what was confirmed, recommend it with a source, confirm adoption of a recipe as a batch, offer the freeze once, and notify on the first record. This contract makes that a file contract. The judgment and the source research stay in a private internal record. They are not placed in this repository.
- Scope: the data shape, the location, the recording rules, and the presentation rules of `recipe.json` only. This contract does not cover learning, automatic application, scoring, or a recipe GUI. v0 is record and present only (sections 0 and 9).

## 0. Place

This is a file contract, not a learning model.

This contract is not a mechanism by which a model learns a user's taste. It freezes, as a named file, the slice of preferences a person confirmed at an approval checkpoint. On the next project, a skill reads that file and presents it as a recommendation that names its source. That is the whole file contract, plus the skill discipline.

- Do not record a value that was filled by a guess or by adopting a default (item 1 of section 3). The only act that counts as confirmation is that the user saw the recommendation and accepted it.
- A remembered value does not overwrite the current request. It does not let a skill skip a required question (item 2 of section 3).
- Automatic application, scoring, and anything like a learning model are outside this contract (section 9). v0 has two procedures only, record (freeze) and present (recall).

Apply the three versioning principles (section 2 of `contract-2026-07-17`, following section 0 of `contract-2026-07-25-plan-comments-v0.md`) from the first version, because this is a new contract.

- The top-level `version` is an integer starting at 0.
- Evolution is additive only. The reader is tolerant (`additionalProperties: true`). Keep unknown fields. Fill a missing field from its default.
- A reader that sees a `version` higher than the one it knows stops read-only and does not guess a conversion. Implemented in `validate-recipe.mjs`. See section 7.
- Field names are snake_case.

## 1. Fixed schema

Source of truth: `packages/schemas/recipe.schema.json` (`$id: urn:akari-video:schema:recipe:v0`). Example: `packages/schemas/examples/recipe-v0-sample/<name>.json`.

```jsonc
{
  "version": 0,
  "name": "product-demo-quick-cuts",
  "frozen_at": "2026-07-25T10:00:00.000Z",
  "source_project": "acme-product-launch-2026-07-20",
  "workflow": "edit",
  "confirmed": {
    "aspect": "16:9",
    "target_duration_band": "30-60s",
    "caption_style_ref": "lower-third-clean",
    "bgm_profile": "corporate-upbeat",
    "overlay_kinds": ["telop", "3d"],
    "narration": { "engine": "voicevox", "voice": "zundamon" }
  },
  "provenance": {
    "aspect": { "confirmed_by": "render-approval", "at": "2026-07-20T08:00:00.000Z" },
    "target_duration_band": { "confirmed_by": "intake", "at": "2026-07-20T02:00:00.000Z" },
    "caption_style_ref": { "confirmed_by": "edit-approval", "at": "2026-07-20T05:00:00.000Z" },
    "bgm_profile": { "confirmed_by": "edit-approval", "at": "2026-07-20T05:00:00.000Z" },
    "overlay_kinds": { "confirmed_by": "edit-approval", "at": "2026-07-20T05:00:00.000Z" },
    "narration": { "confirmed_by": "edit-approval", "at": "2026-07-20T05:00:00.000Z" }
  }
}
```

### Fields

| Field | Type | Required | Unit and notes |
|---|---|---|---|
| `version` | integer (const 0) | Required | none |
| `name` | string | Required | kebab-case. The calling name, the target of "<name>, one more" in section 4. It matches the file name `~/.akari/recipes/<name>.json`. |
| `frozen_at` | string (ISO 8601) | Required | The time the freeze ran |
| `source_project` | string | Required | Free text of a project name plus a date, for example `acme-product-launch-2026-07-20`. Do not write a path. A reference that breaks when the project is moved or deleted is not kept (section 6). |
| `workflow` | enum | Required | `edit` (a preference of `skills/edit-plan`) or `research` (a preference of `skills/research-plan`) |
| `confirmed` | object | Required, at least one field | Confirmed preferences only. Every field is optional, and null is not allowed. A key that was not confirmed is not written at all (item 1 of section 3). |
| `confirmed.aspect` | enum | Optional | `16:9`, `9:16`, or `1:1`. The customary values of existing catalog tags. They already appear in `tags[]` of files such as `catalog/scene3d/vintage-camera/meta.json` (section 6). |
| `confirmed.target_duration_band` | string | Optional | A band, not the duration itself, for example `30-60s`. An exact number of seconds cannot be reused when the footage changes, so the record is a band (section 6). |
| `confirmed.caption_style_ref` | string | Optional | Free text that describes a caption style. It is not a registry-backed profile key, and it cannot be applied automatically. |
| `confirmed.bgm_profile` | string | Optional | Free text that points at a BGM preference, such as a genre, a mood, or a catalog candidate name. |
| `confirmed.overlay_kinds[]` | string array | Optional | No duplicates, and at least one item. Aim at the kind names in `skills/overlay-authoring/*.md` (Japanese), such as `telop`, `3d`, `table`, `motion`, `text-behind-person`, and `thumbnail`. Not a forced enum, so the list can follow additions to overlay-authoring (section 6). |
| `confirmed.narration` | object | Optional, at least one field | `engine` and `voice`, both optional, null not allowed. The same free-text vocabulary as `narrationProvenance.engine` and `voice` in `edit.schema.json`. Not a forced enum. |
| `provenance` | object | Required, at least one field | A one-to-one match with the keys that actually exist on `confirmed`, with nothing extra and nothing missing. Each entry is `{ confirmed_by, at }`. |
| `provenance.<field>.confirmed_by` | enum | Required | `intake`, `structure-confirm`, `edit-approval`, or `render-approval` (the table in section 4) |
| `provenance.<field>.at` | string (ISO 8601) | Required | The time it was confirmed |

"Required, at least one field" means the key itself is required, and an empty object (nothing confirmed) is not accepted. If `confirmed` is empty, there is no reason to freeze (items 1 and 3 of section 3).

## 2. Location

> The ruling on 2026-07-25 keeps `~/.akari/recipes/`. The source of truth is the section "Directory name ruling" at the end of `contract-2026-07-13-asset-library.md`. The history is kept in a private internal record.

**`~/.akari/recipes/<name>.json`.** A personal layer across projects. This is an owner ruling. It is the only location outside a project that this contract creates.

- The name is kebab-case. One recipe is one file.
- Do not place it inside a project, such as under `planning/`. A recipe is called across projects. It does not follow the lifecycle of one project. The design is the opposite of `plan-comments.json`. That file is a temporary slip, one file per project. This file is a lasting ledger in the personal layer.
- Verification for this task finishes on fixtures inside the repository. Do not write to the real `~/.akari/recipes/`. That is a task constraint. When a skill writes this directory in real use, it may create the directory if it does not exist.

## 3. Data rules

Freeze and recall.

1. Record only a confirmed value. Do not record a value that was filled by a guess or by adopting a default. The user seeing a recommendation and accepting it counts as confirmation. The only values that may be written on `confirmed` are values that passed a checkpoint the person explicitly approved.
2. Present a remembered value as a recommendation that names its source. Do not overwrite the current request. A skill does not skip a required question, such as the intake "how to proceed" form. A recipe is reference information that says "last time it was like this." It is not a substitute for an approval gate.
3. A recipe, a freeze of one approved set, is the exception. The adoption statement itself ("<name>, one more" or "same as last time") is the confirmation, so the fields inside `confirmed` may be filled as a batch.
4. Offer a freeze once, at delivery (offer-once). Do not offer a freeze again inside the same project. When the freeze succeeds, return a confirmation that also teaches the calling phrase:

   > Saved as **<name>**. Next time, say "<name>, one more" or "same as last time."

   The system reminds the person of the name. The user does not memorize it. The recall procedure does not ask for the name. It lists `~/.akari/recipes/` and presents the list (section 4).
5. On the first record, the first time that project freezes a recipe, tell the person in one sentence that this is remembered for later.

## 4. Skill wiring and `confirmed_by`

| `confirmed_by` | Checkpoint where it happens | Skill |
|---|---|---|
| `intake` | The "how to proceed" form (`intake.json` submitted) | The shared entrance of every workflow |
| `structure-confirm` | The decision card that fixes the plan structure | `skills/research-plan` (Japanese), with `workflow: "research"` |
| `edit-approval` | Checkpoint 1 (direction) and Checkpoint 2 (footage plan) | `skills/edit-plan` (Japanese) |
| `render-approval` | Checkpoint 3 (the execution manifest) | `skills/edit-plan` (Japanese). Values fixed at the execution stage, such as the output aspect. |

The real freeze and recall procedure has its source of truth in [skills/edit-plan/recipe.md](../skills/edit-plan/recipe.md) (Japanese). `skills/edit-plan/SKILL.md` and `workflow.md` each add a few lines, recall before the direction is decided, and the offer-once freeze in completion handling, and they link to recipe.md. `skills/research-plan/SKILL.md` and `ideate.md` recall recipes with `workflow: "research"` at the start of ideation and planning, under the same rules, and they refer to the recall procedure in recipe.md. A freeze leaf dedicated to `research-plan` is outside this contract. Today the freeze implementation is only `skills/edit-plan/recipe.md`. A freeze on the research side is considered at the next stage (section 9).

## 5. Degradation

`recipe.json` is reference material in the personal layer. A validation failure must not fail the edit or the plan with it.

| Situation | Behavior |
|---|---|
| `~/.akari/recipes/` does not exist, or is empty | A valid state. There is nothing to recall. Not an error. |
| No recipe matches `workflow` | Continue the normal flow with no recommendation candidate. |
| `confirmed` is empty, or its keys do not match `provenance` | A schema validation error. The reader does not use the file (section 1). |
| `version > 0` | Stop read-only. Principle 3. Implemented in `validate-recipe.mjs`. |
| After a recipe is adopted, an instruction arrives that contradicts this request | The person's latest explicit instruction always wins. The same priority as item 6 of section 3 in `plan-comments.json`. |

## 6. Why the data is shaped this way

- `source_project` does not hold a path because a project directory can be moved or deleted. A recipe lives across projects in the personal layer, so it does not keep a reference that breaks. It keeps only free text of a name plus a date. That leaves a record a person can read, of which project's experience the recipe came from. It does not resolve a reference by machine.
- `target_duration_band` is a band, not a number of seconds, because `slots[].target_duration_seconds` in `plan.schema.json` and `target.duration_s` in `intake.schema.json` are the exact duration of this project. A recipe is meant to be reused on another project. The next footage will not have the same duration as the last, so the preference is recorded as a band such as "30-60s", not as an exact number of seconds.
- `aspect` is the three values `16:9`, `9:16`, and `1:1` because this contract does not invent vocabulary. It adopts the customary tag values already used in files such as `catalog/scene3d/vintage-camera/meta.json`. `render.master` in `edit.schema.json` holds real width and height. A recipe is the preference "which orientation next time," and a ratio category is enough. A concrete resolution is not.
- `overlay_kinds[]` is not bound to an enum because the leaves under `skills/overlay-authoring/` will keep growing (`beats.md`, `emphasis-detection.md`, and others). Choosing an expression on the edit-plan side is already designed to extend from a catalog. Fixing an enum on the recipe side would couple this contract to a revision every time a new overlay kind appears. The value is an array of free strings.
- `narration.engine` and `voice` are not bound to an enum because `narrationProvenance.provider`, `engine`, and `voice` in `edit.schema.json` are already designed as examples in the contract document, not as a forced enum (`voicevox`, `fal`, `elevenlabs`, `human`, and others). A recipe matches that existing looseness.
- `provenance` is per field because, inside one recipe, the moment of confirmation differs by field. `aspect` is fixed at execution approval (`render-approval`). `target_duration_band` is fixed at intake. One `confirmed_by` for the whole file would lose that grain.
- The file has no state because `recipe.json` is a frozen slice, a snapshot. It does not have an in-progress status ladder like `confidence` on `plan.json`. After a freeze, the contents of a recipe do not "advance." A new freeze replaces the file with a different slice.
- There is no learning and no automatic application because v0 is limited to recording and to presenting a recommendation that names its source. That avoids automation that bypasses the confirmation gate (section 0 and item 2 of section 3). Learning and scoring easily apply something the person did not intend. This contract does not cover them (section 9).

## 7. Common mistakes

- Writing a guessed value, or a value adopted from a default, onto `confirmed`. That is wrong. Item 1 of section 3. Only a value the person explicitly approved is confirmed.
- Overwriting the current request with a recipe recommendation, or skipping a required question. That is wrong. Item 2 of section 3. A recipe is reference information. It is not a substitute for an approval gate.
- Offering a freeze more than once in the same project. That is wrong. Item 4 of section 3. Offer once.
- A value on `confirmed` with no matching `provenance` entry, or the reverse. That is wrong. Section 1. A broken one-to-one match is a validation error.
- Placing a recipe somewhere other than `~/.akari/recipes/`, including inside a project. That is wrong. Section 2. This contract defines one location.
- Writing the previous project's exact number of seconds into `target_duration_band`. That is wrong. Section 6. A recipe is recorded as a band because it is meant to be reused.
- Pouring `confirmed` values into the current plan in silence, with no adoption statement. That is wrong. Item 3 of section 3. A batch fill is allowed only when there is an explicit statement that adopts the recipe.

## 8. Migration

Empty. `version` has not been bumped. A bump writes the old-to-new conversion here in a form a machine can run. Principle 2 of `contract-2026-07-17`.

## 9. Next stage

Outside this contract.

- Learning, automatic application, and scoring. This contract is record and present-with-source only (section 0).
- A recipe GUI. A dedicated viewer for listing, editing, and deleting.
- A location other than `~/.akari/recipes/`. A recipe inside a project, a recipe shared by a team, and similar.
- A freeze leaf dedicated to `research-plan`. Today the freeze implementation path is only `skills/edit-plan/recipe.md`. The research side only recalls. A freeze procedure from a research artifact is considered at the next stage.
- Changes to the schemas of `edit.json`, `intake.json`, or `research-plan.json`. This contract only adds `recipe.json` by itself.
- Inheritance between recipes, and a merge of differences. A mechanism that combines several recipes is out of scope.
