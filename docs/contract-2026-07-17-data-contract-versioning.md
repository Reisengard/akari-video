**English** | [日本語](./contract-2026-07-17-data-contract-versioning.ja.md)

# Data-contract versioning and migration

- Date: 2026-07-17
- Status: draft. After review, this is the cross-cutting source of truth for every data contract.
- Depends on: `notes-2026-07-13-edit-json-v1.md` (Japanese), which states that a `version` field evolves in steps and does not break v0 compatibility, and `contract-2026-07-14-edit-json-v1-audio.md` section 0, a worked example of version practice. This contract generalizes that practice.
- Scope: every data-contract file in a project, and the JSON Schema files under `packages/schemas/`. This contract does not change existing schema content. It changes only the rule for how a contract evolves.

## 1. What this covers

- `edit.json`, footage sidecars (`.meta.json`, `.decisions.json`, and `.analysis.json`), state files under `.akari/` (`workflow.json` and files added later), and project JSON that a skill reads or writes.
- A data contract created after this one follows the rule from its first version. Do not add a contract file that has no `version`.

## 2. Three principles

### Principle 1. Version is required, and evolution is additive

The preferred change is one that does not need a migration.

- Every data-contract file has a top-level integer `version`.
- Evolution adds optional fields only. Do not delete a field, change its type, or change its meaning.
- Bump `version` only when that change is actually required. The bump declares a breaking change.
- A reader is tolerant. Keep unknown fields across a read and a later write. Fill a missing field from its default.
- Worked example: edit.json audio, section 0. `audio` gained an optional field and stayed at `version: 0`. An integer bump is reserved for a structural breaking change.

### Principle 2. A breaking change ships with an explicit migration

- A contract that bumps `version` writes the old-to-new conversion in the same document, in a form a machine can run. Reject a bump that has no conversion.
- The agent, through a skill, runs the conversion. Show the target files and what will change, wait for explicit approval, then convert. The result is visible in git diff. If the project is not in git, copy the files to `.akari/backup/` before converting.
- Silent migration is forbidden. An app or a skill must not convert a file to the new form on read and then save it.

### Principle 3. A version that is too new stops without damaging the file

- When a reader sees a `version` higher than the newest one it knows, it does not guess and it does not convert. It switches to read-only and reports that the file uses a newer format and that the skill or the app needs an update.
- Example: edit.json validation rejects `version != 0` today. That rejection is this principle. The message tells the reader to update. It is not a silent error.

## 3. Inventory at drafting time

| File or schema | `version` | Action |
| --- | --- | --- |
| edit.json | Present. The practice is already written down. | None |
| `.akari/workflow.json` | Present (`1`) | None |
| `.analysis.json` (`analysis.schema.json`) | Present | None |
| `.meta.json` (`asset-meta.schema.json`) | Present. Added on 2026-07-30. First version is 1. | Done. Added as an optional field. The bump rule and the machine check are in the asset library contract, under "Asset version and compatibility". |
| `.decisions.json` | Not yet | Add it at the next schema revision. |

Closing a gap is a task for that contract. This document fixes the principles only.

## 4. Checklist for a new contract

1. The file has a top-level integer `version`. The contract states whether the first version starts at 0 or at 1.
2. The contract states additive evolution and the tolerant reader.
3. The contract reserves a section for the conversion steps of a breaking change. The section may stay empty until a bump.
4. Readers implement the forward-compatible behavior in principle 3.

## 5. Filename `-vN` is not the edit.json schema version

Added 2026-08-18.

The `-vN` suffix on a contract filename, for example `contract-2026-08-12-still-image-cut-source-v0.md`, is the revision of that contract document. It is not the data-contract `version` field this document defines for edit.json and the other files. The two numbers move independently. Revising the contract document does not change edit.json `version`. Raising edit.json to `version: 1` does not rename the related contract to `-v1.md`.

Treating "still-image-cut-source-v0, the first revision of the contract" and "write edit.json as v1, the schema version" as the same number causes misreads. A contract that mentions the edit.json schema version says "edit v0" or "edit v1" near the start of the body, so a reader can tell it apart from the filename suffix. Example: "This contract covers `sources[]` on edit v1." A reader, whether an agent or a person, does not treat the filename `-vN` as the schema version.

## 6. Retirement of the edit.json v0 and v1 freeze converter

Owner decision, 2026-08-18.

- The converter accepts bug fixes only. Do not add a feature. Do not add a case for an unknown v0 or v1 input. Stop and give the reason that this project cannot be converted.
- Remove the converter from AKARI Video on the earlier of the `1.0.0` release date and `2026-12-31`.
- At that date, do not throw the converter away. Extract it once as the standalone npm package `akari-migrate`, publish that package once, and do not update it after that. This migration task does not publish the package. Publishing is part of removing the converter from the product.
- After removal, the error text is fixed:

  > This project uses an old format. Convert it with `npx akari-migrate@<version> <dir>`, then open it.

### 6.1 Move onto audio tracks

2026-08-21. The last addition before the freeze.

Only task `2026-08-20-v2-audio-tracks` is an approved one-time exception to "bug fixes only". It adds a conversion that moves v0 and v1 `audio.sfx[]`, `audio.narration[]`, and `audio.bgm` onto the v2 audio lane `tracks[].items[]`. On output, `at` and `duration` are integer frames. On the footage side, `in`, `out`, fade, and `bgm.in` stay in seconds. Audio whose real duration cannot be decided from the old form alone uses the sentinel `duration: 0`. This converter does not run ffprobe. Top-level `audio` remains only when `master` is declared.

This is the last feature the converter may gain before the freeze. Do not add more conversion. Remove it from the product on the schedule in section 6.

### 6.2 Copy filter layers and move emphasis words

2026-08-23. A one-time exception.

Only task `2026-08-23-migrate-filter-emphasis-exception` is an approved one-time exception, by the owner decision of 2026-08-23, to "bug fixes only". It copies a standalone v0 or v1 layer with `kind: "filter"` into a v2 filter source. It removes top-level `emphasis_words[]` from edit.json v2 and moves those words to `captions.json.emphasis_words[]` at the object root. A `filter` attached directly to a media layer (`video` or `baked`) has no v2 equivalent, so the converter does not copy it and stops with a reason. Before the move, the converter saves the original edit.json and the original captions.json, so one revert restores both. It stops with a reason when the destination is missing, when the root is an array, or when `emphasis_words` is already present.

The retirement decision of 2026-08-21 used 60 field-test projects as its population. Production reels were outside that survey, so the population was incomplete. This exception moves existing data without losing it.

After this exception, do not add more conversion. Remove the converter from the product on the schedule in section 6.
