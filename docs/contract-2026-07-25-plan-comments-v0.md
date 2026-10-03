**English** | [日本語](./contract-2026-07-25-plan-comments-v0.ja.md)

# plan-comments.json v0 (structured rejection on an approvable plan)

- Date: 2026-07-25
- Status: **accepted** (approved in the owner review on 2026-07-26. Previously draft, waiting on owner review.)
- Depends on: `contract-2026-07-17-data-contract-versioning.md` (the source of truth for the three principles), `contract-2026-07-20-plan-json-v0.md` (the neighboring contract, the precedent for the `confidence` status ladder, `slots[].id`, and the `<plan-dir>` location), `skills/research-plan/storyboard.md` (Japanese) (the current approval procedure for `structure-confirm`), and `skills/edit-plan/approvals-and-generation.md` (Japanese) (the current approval procedure for the three checkpoints).
- Origin: the approvable plan layer had no structured comment round trip. A correction that names its target had to live in chat. This contract adds a file path that receives that correction without depending on chat context. The judgment and the source research stay in a private internal record. They are not placed in this repository.
- Scope: the data shape, the location, and the lifecycle of `plan-comments.json` only. This contract does not cover a GUI (a plan tab or a board UI), changes to the schemas of `plan.json`, `research-plan.json`, or `edit.json`, changes to the `decisions.json` decision-cards mechanism, or a new status ladder. `confidence` already exists. See section 0.

## 0. Place

Do not invent status again.

`plan.json` v0 (`contract-2026-07-20`) already has per-slot `confidence: proposed | locked | filled`. This contract does not invent that ladder again. It adds only the missing path, a file that receives a correction naming its target without depending on chat context. `plan-comments.json` holds no state. It does not stand in for `confidence`. The whole of this contract is to hand a skill a structured file of comments a person attached by name, on a GUI or a report, such as "Replace the graph in scene 3."

Apply the three versioning principles (section 2 of `contract-2026-07-17`) from the first version, because this is a new contract.

- The top-level `version` is an integer starting at 0.
- Evolution is additive only. The reader is tolerant (`additionalProperties: true`). Keep unknown fields. Fill a missing field from its default.
- A reader that sees a `version` higher than the one it knows stops read-only and does not guess a conversion. The same behavior as `validate-plan.mjs`. See section 7.
- Field names are snake_case. Follow the precedent in section 0 of `contract-2026-07-20`. This is the schema-first series of contracts.

## 1. Fixed schema

Source of truth: `packages/schemas/plan-comments.schema.json` (`$id: urn:akari-video:schema:plan-comments:v0`). Example: `packages/schemas/examples/plan-comments-v0-sample/plan-comments.json`.

```jsonc
{
  "version": 0,
  "pass": "scaffold",                 // "structure", "scaffold", or "final" (the table in section 4)
  "submitted_at": "2026-07-25T09:30:00.000Z",
  "comments": [
    {
      "target_kind": "clip",          // "shot", "clip", or "cut". "slot" is retired.
      "target_id": "item-demo",       // a scaffold clip uses the edit.json v2 item id
      "title": "Operation demo",      // a copy of the target name at submit time, used to detect a reorder
      "text": "Before the screen recording, show the moment the export button is clicked."
    }
  ]
}
```

### Fields

| Field | Type | Required | Unit and notes |
|---|---|---|---|
| `version` | integer (const 0) | Required | none |
| `pass` | enum | Required | `structure`, `scaffold`, or `final` (section 4) |
| `submitted_at` | string (ISO 8601) | Required | The submit time |
| `comments[]` | array | Required. An empty array is allowed. | Order has no meaning. The array is a set of named targets. |
| `comments[].target_kind` | enum | Required | `shot`, `clip`, or `cut`. The old value `slot` is retired. |
| `comments[].target_id` | string | Required | For `shot` and `cut`, the index in the target array, written as a string (for example `"2"`). For `clip`, the edit.json v2 item id. |
| `comments[].title` | string | Required | A copy of the target name at submit time. The reader chooses the source when implementing it, such as the start of a `shot` `description`, the display name of a `clip`, or the `src` of a `cut`. The title is a visual aid for detecting a reorder. It is not used to resolve the reference. Resolution uses `target_id` only. |
| `comments[].text` | string | Required | The comment verbatim. Do not summarize it and do not rephrase it. |

Required means the value cannot be an empty string. `comments[]` itself may be an empty array, because a submit can carry no individual comment.

## 2. Location

Place one file, `plan-comments.json`, under `<plan-dir>`. That is the same directory as `plan.json` and `research-plan.json`. In an AKARI project the default role is `planning/`.

- One file per project. The path is fixed. Do not split files by `slot` or by `pass`.
- Each submit overwrites the file. The reader of the previous submit should already have handled and deleted that file under the lifecycle in section 3. A new submit is created from a state where this file does not exist.

## 3. Lifecycle

This is the whole contract.

One human submit writes one file in a batch. A reader skill, when it finds the file at a checkpoint, revises only the named targets and then deletes the file.

1. The writer, on a rejection at an approval checkpoint, writes `plan-comments.json` once as a batch. One human GUI action is one file write. It is not an append.
2. When a reader skill reaches an approval checkpoint, it checks for `<plan-dir>/plan-comments.json` before it interprets the chat reply.
3. If the file is present:
   - Revise only the targets named in `comments[]`, identified by `target_kind` plus `target_id`. Leave an unnamed target unchanged and carry it into the next presentation.
   - If `title` does not match the current target name, treat that as a suspected reorder or id shift and try to resolve the target again. If resolution fails, do not revise, and report that fact in chat. Do not apply the comment to the wrong target in silence.
   - After the revision, delete `plan-comments.json`.
   - Present the revision to the person again. Follow the existing approval path, such as redrawing the report or posting in chat again.
4. If the file is absent, treat the chat reply alone as the approve or reject input, as usual.
5. A file that survives across rounds is a contract violation. `plan-comments.json` must not keep existing across one checkpoint handling. If a previous file is still there before the next submit, the reader handles it as the previous round and deletes it. A person posting the old contents again is an operational problem on the writer side.
6. A chat reply and the file may both exist. Reading the file first is the fixed priority. The only exception is a chat message that explicitly says to ignore the previous comment. Then the explicit chat instruction wins over the file. The person's latest intent always decides.

## 4. `pass`, `target_kind`, and the reader skill

| `pass` | `target_kind` | Reader skill | Target data |
|---|---|---|---|
| `structure` | `shot` | `skills/research-plan/storyboard.md` (Japanese). A rejection of the `structure-confirm` decision card. | `structure.chapters[]` and `structure.shots[]` in `research-plan.json`. A `shot` is an index in `structure.shots[]`. |
| `scaffold` | `clip` | `skills/edit-plan/approvals-and-generation.md` (Japanese). A rejection of Checkpoint 2, the footage plan. | A media item in edit.json v2. `target_id` is the item id. The old `slot` is retired. |
| `final` | `cut` | `skills/edit-plan/approvals-and-generation.md` (Japanese). A rejection of Checkpoint 3, execution. | `cuts[]` in `edit.json`. A `cut` is an index in `cuts[]`. `cuts[]` has no persistent id. See `contract-2026-07-18-edit-json-v1-sources.md`. |

The three rows are one-to-one. Once `pass` is fixed, `target_kind` is fixed. The schema does not hard-constrain that pairing. `target_kind` is an enum independent of `pass`. The writer and the reader both operate by this table.

## 5. Degradation

`plan-comments.json` is a temporary rejection slip. A validation failure must not fail the other stages with it.

| Situation | Behavior |
|---|---|
| The file is absent | A valid state (step 4 of section 3). There is nothing to validate. Not an error. |
| `comments` is an empty array | Allowed. A submit with no named comment. |
| `title` does not match the current target name | A judgment of the reader skill (step 3 of section 3). Schema validation does not look at it. |
| `version > 0` | Stop read-only. Principle 3. Implemented in `validate-plan-comments.mjs`. |

## 6. Why the data is shaped this way

- `title` exists because `target_id` alone cannot tell the reader that the target was reordered after the person wrote the comment. `title` is a copy of the target name at submit time. The reader compares it, by eye or by machine, with the current target name and detects the shift. `target_id` remains the source of truth.
- `shot` and `cut` are index strings because the GUI can finish the job as "which card, by position, received the comment." `structure.shots[]` in `research-plan.json` does have an id. The index is still the value, so the GUI stays on card position. A scaffold `clip` uses the edit.json v2 item id, so it still points at the same target after a reorder. The old `slot` retired together with the provisional role of plan.json.
- `comments[]` is an array, not a map, so one target may carry more than one comment. The contract does not limit a target to one comment.
- The file has no state because it records one event, one rejection. Lasting state already lives in `confidence` on plan.json and in `decisions.json` (decision-cards). A new state here would track the same fact twice (section 0).

## 7. Common mistakes

- Leaving `plan-comments.json` after handling it. That is wrong. See step 5 of section 3. Survival across rounds is a contract violation.
- Interpreting the chat reply before reading the file. That is wrong. See step 2 of section 3. Reading the file first is the fixed priority.
- Also revising a target that was not named. That is wrong. Revise only the named targets (step 3 of section 3).
- Storing lasting state such as `confidence` in `plan-comments.json`. That is wrong. See sections 0 and 6. State belongs on plan.json.
- Using `target_kind: "slot"` on `scaffold`. That is wrong. `slot` is retired. Use `target_kind: "clip"` and the edit.json v2 item id (sections 4 and 6).
- Appending on each submit, keeping old `comments[]` and adding more. That is wrong. See section 2. One submit is one overwrite. Do not keep a comment that has already been collected.

## 8. Migration

Empty. `version` has not been bumped. A bump writes the old-to-new conversion here in a form a machine can run. Principle 2 of `contract-2026-07-17`.

## 9. Next stage

Outside this contract.

- A GUI. A future viewer, the plan-tab board UI. This round's goal is a conversation that works from reading and writing the file contract alone.
- Integration with the `decisions.json` decision-cards mechanism. It stays loosely coupled for now. See section 0.
- A reference field on the schemas of `plan.json`, `research-plan.json`, or `edit.json` that points at `plan-comments.json`, for example a `decision_ref` style link.
- An archive of rejection history. This contract deletes the file. A retention policy for keeping the contents before deletion is a separate question.
