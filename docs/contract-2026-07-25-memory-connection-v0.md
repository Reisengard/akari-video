**English** | [日本語](./contract-2026-07-25-memory-connection-v0.ja.md)

# memory connection v0 (a connection declaration for external reference memory)

- Date: 2026-07-25
- Status: **draft, waiting on owner review**. A new data contract is an owner ruling. This document is drafted for that review.
- Depends on: `contract-2026-07-17-data-contract-versioning.md` (the source of truth for the three principles), `contract-2026-07-25-recipe-v0.md` (the sister contract just before this one, the precedent for voice, form, and marking a draft), and `packages/schemas/connections.schema.json` (the current shape being extended. Inherit the style of the `providers` and `policy` `$defs`).
- Origin: an owner conversation on 2026-07-25. The point was that a video project should not live inside the business wiki, but the two still need to sync. The business wiki is too large, and figures such as sales are not needed. Memory that is an external reference should stay separate from memory of taste and style. The full context of the internal ruling has its source of truth in sections 0 and 1 of the memory-and-style contract in the private repository akari-video-internal. This document publishes only family A, external reference memory, from that ruling. Family B, the style profile, is a separate contract.
- Scope: adding a `memory` connection type to `.akari/connections.json` only. That covers the schema, the data rules, and the moments when a skill may read. This contract does not cover write-back, remote sources, an install-time default, a change to the intake schema, or style memory (section 9).

## 0. Place

This is a connection declaration, not storage.

This contract is not a mechanism by which a video project holds memory. The project states, as a `memory` declaration in `.akari/connections.json`, which external knowledge (a business wiki, for example) it reads as memory. At the fixed read moments in section 4, a skill reads that declaration and records the memory files it consulted as sources. That is the whole file contract, plus the skill discipline.

- The body of the memory source (the wiki) stays outside the project. Do not copy it into the video project and do not store it there.
- There is no IPC and no resident server. A skill reads the file system directly.
- v0 is read-only. `read_policy` is fixed at `"read-only"`. Write-back, writing a short summary into the memory source at completion, is the next stage (section 9).

The three versioning principles (section 2 of `contract-2026-07-17`) apply as follows, because `connections.schema.json`, the schema this contract extends, is an existing schema with no top-level `version` field.

- Additive evolution only. Add `memory` as an optional top-level field. Do not change the type or the meaning of the existing `providers` and `policy`. An existing connections.json with no `memory` stays valid, as before. Measure that in the acceptance check.
- A tolerant reader. A connections.json with no `memory` is a valid state that means there is no memory to read. Not an error (section 5).
- snake_case. Every new field is snake_case: `root`, `entry`, `include`, `exclude`, `read_policy`.
- Where principle 3 (stop honestly) applies. `connections.schema.json` has no integer `version`, so this contract does not add a new bump rule for a breaking change. When a breaking change to `memory` is actually required, consider adding `version` to the whole of `connections.schema.json` as a separate question. That is outside this contract (section 9).

## 1. Fixed schema

Source of truth: `packages/schemas/connections.schema.json` (`$id: urn:akari-video:schema:connections:v0`). Do not change the existing `$id`. This is additive evolution, not a breaking change. Example: `packages/schemas/examples/connections-v0-memory-valid/connections.json`.

```jsonc
{
  "providers": [ /* unchanged */ ],
  "policy": { /* unchanged */ },
  "memory": [
    {
      "name": "kyo-kobo-wiki",
      "root": "~/_edit",
      "entry": "INDEX.md",
      "include": ["05_kyo-kobo/**", "30_products/**"],
      "exclude": ["10_accounting/**"],
      "read_policy": "read-only"
    }
  ]
}
```

### Fields

| Field | Type | Required | Unit and notes |
|---|---|---|---|
| `memory[]` | array | Optional at the top level | May be omitted. An existing connections.json with no `memory` key stays valid, as before. |
| `memory[].name` | string | Required | kebab-case. The same pattern as `providers[].id`, `^[a-z0-9]+(?:-[a-z0-9]+)*$`. A calling name. Must not repeat inside the array. |
| `memory[].root` | string | Required | The root path of the memory source. A non-empty string. A local path only. v0 does not support a remote source. Expanding `~` is the reader's job, on the skill side. The schema and the validator do not expand it. |
| `memory[].entry` | string | Optional | The entry file. The default `INDEX.md` when the key is omitted is an operating rule of this contract (section 3). The schema itself only allows the key to be omitted. It does not force the default. |
| `memory[].include[]` | string array | Optional | Patterns that narrow what is read. No duplicates. An empty string is not allowed. |
| `memory[].exclude[]` | string array | Optional | Patterns that narrow what is not read. No duplicates. Example: `10_accounting/**`, which is how "do not read sales" is expressed. |
| `memory[].read_policy` | string, const `"read-only"` | Optional | v0 is fixed at read-only. An omitted value is also treated as read-only (section 3). |

Do not bring the `$defs` of `providers[]`, such as the `doctor` block, onto `memory`. `memory` is a read-only declaration. It has no credentials and no billing state. It does not need the lasting state that doctor writes back (`doctor.status` and `last_checked`). Section 6 states why.

## 2. Location

Declare `memory` only as the `memory` array of `.akari/connections.json` inside the project.

- Do not create a new location outside the project. `root` only points at an existing external path, for example the repository root of a business wiki. This contract creates no new directory anywhere.
- The base-directory ruling for a lasting location outside the project, whether `~/.akari-video/` or `~/.akari/`, is a question that `recipe.json` v0 and the style profile (family B) open. When you need to cite it, cite the section "Directory name ruling" at the end of `docs/contract-2026-07-13-asset-library.md`. This task's memory connection is a declaration inside the project's `.akari/connections.json`. It does not create a location outside the project, so that ruling does not apply to it.
- The full context of the internal ruling, why family A and family B are split, and how that lines up with the four scope layers, has its source of truth in sections 0 and 1 of the memory-and-style contract in akari-video-internal.

## 3. Data rules

No full-text dump, and record the source.

1. A connection declaration, not storage. `memory` is a pointer to a memory source. Do not copy the contents of the memory source under `.akari/`, and do not cache them there.
2. Read-only. A v0 `memory` connection has no server and no IPC. A skill reads the file system directly. `read_policy` is fixed at `"read-only"`. Write-back is section 9.
3. Start from `entry`. Do not read the whole memory source. Follow from `entry` (default `INDEX.md` when omitted) and read only the range narrowed by `include` and `exclude`. Follow the frontmatter and the cross-links of the LLM wiki.
4. Record the source. Record the path of each memory file that was consulted as a source on the artifact of the skill that read it. Use that skill's existing vocabulary, such as `sources[]` on `research-plan.json`, `decision-log.md`, or `inputs.context` on `interpretation.json`.
5. No connection is a valid state. A connections.json with no `memory` key, or with an empty array, is not an error. There is simply no memory to read. Continue the normal flow (section 5).

## 4. Where a skill reads

The moments when `memory` may be read are fixed at three. Do not read it in any other stage.

| Read moment | Skill | Where it is implemented |
|---|---|---|
| The start of ideation, before a direction is drafted | `skills/research-plan` | The hard rule in [SKILL.md](../skills/research-plan/SKILL.md) (Japanese), next to recipe recall |
| The step before a direction is presented | `skills/edit-plan` | The execution order in [SKILL.md](../skills/edit-plan/SKILL.md) (Japanese), next to recipe recall |
| The second pass, reading surrounding project context | `skills/analyze-project` | The hard rule in [SKILL.md](../skills/analyze-project/SKILL.md) (Japanese) |

All three read the same way. If `.akari/connections.json` has a `memory` declaration, start from `entry` and read only the `include` and `exclude` range, then record the consulted file paths as sources on the artifact. A full-text dump is forbidden. If there is no declaration, do nothing. That is not an error.

## 5. Degradation

`memory` is reference material for the project. A validation failure or a bad connection must not fail the edit, the plan, or the analysis with it.

| Situation | Behavior |
|---|---|
| No `memory` key, or an empty array | A valid state. There is no memory to read. Not an error. |
| `entry` is omitted | Treat it as the default `INDEX.md`. |
| `read_policy` is omitted | Treat it as read-only. |
| The path `root` points at cannot actually be reached | [manage-connections](../skills/manage-connections/SKILL.md) (Japanese) reports it through doctor, free and read-only. Do not stop the skill run at the read moment (section 4). A memory that cannot be reached is "not consulted this time." Continue the normal flow. |
| `memory[].name` repeats inside the array | A schema validation error. `validate-connections.mjs` rejects it. |

## 6. Why the data is shaped this way

- `name` uses the same pattern as `providers[].id` because a memory source is an external thing the project depends on, in the same class as a generation provider and an API-key reference. Calling names inside `connections.json` follow one rule. `manage-connections` manages both as the same registry (section 0).
- `root` is a local path only because a remote source (a git URL, an API, and similar) needs a different design, covering reachability, authentication, and a cache strategy. v0 is limited to the smallest use, a project reading a business wiki, and marks the rest out of scope (section 9).
- `memory` has no `doctor` block because `providers[].doctor` holds lasting state, the authentication state of credentials. `memory` is only a read-only existence check. It has no authentication and no billing, so there is no lasting state to write back. The doctor display for memory stays a free check done at the moment it is needed (section 5 and [manage-connections/SKILL.md](../skills/manage-connections/SKILL.md) (Japanese)).
- `include` and `exclude` exist because a business wiki is far larger than a project. Sales and accounting data, for example, are not needed by a video project. `exclude` can declaratively drop a range such as `10_accounting/**`, which makes a full-text dump structurally impossible.
- The default for `entry` is `INDEX.md` because, in the LLM wiki pattern of `_edit/CLAUDE.md`, `INDEX.md` is operated as the spine of each level. It is a table of contents, links to the matching repository, and status. The memory source already has that design, so this contract does not invent a new entry vocabulary. This follows section 1 of the internal memory-and-style contract.
- Recording the source is required because it mirrors the wiki-layer rule that a claim links back to raw material. A conclusion drawn from memory cannot be checked later, and cannot be challenged, unless the files it stood on can be traced.

## 7. Common mistakes

- Reading the whole memory source. That is wrong. See item 3 of section 3. Start from `entry` and read only the `include` and `exclude` range.
- Treating a missing `memory` declaration as a validation error. That is wrong. See item 5 of section 3 and section 5. No connection is a valid state.
- Not recording the path of a consulted memory file on the artifact. That is wrong. See item 4 of section 3. A reference that cannot be traced works against the purpose of this contract, which is to gain from reading without losing the ability to check.
- Writing to the path `root` points at, or copying the memory source under `.akari/`. That is wrong. See section 0 and items 1 and 2 of section 3. v0 is a read-only connection declaration only.
- Writing a remote URL or an API reference in `memory`. That is wrong. See sections 1 and 6. v0 is local paths only.
- Trying to give `memory` lasting state like `providers[].doctor`. That is wrong. See sections 1 and 6. `memory` is designed with no doctor block.
- Stopping the read moment itself (a research plan, an edit direction, or analysis) because `root` cannot be reached. That is wrong. See the degradation rule in section 5. Ignore a memory that cannot be reached and continue the normal flow.

## 8. Migration

Empty. `connections.schema.json` has had no breaking change. Adding `memory` is additive evolution that does not change `$id`. If a breaking change is required, write the old-to-new conversion here in a form a machine can run. Principle 2 of `contract-2026-07-17`.

## 9. Next stage

Outside this contract.

- Write-back. At completion, write a short summary into the wiki layer of the memory source. Section 1 of the internal memory-and-style contract, under "write-back", holds the sketch. This contract covers reading only.
- Remote sources. A memory connection through a git URL or an API. v0 is local paths only.
- An install-time default. Asking for a default memory during setup-library first-run.
- A question added to `intake.schema.json`. At project creation, choosing which memory the project attaches to.
- The style profile, family B. A brand standard such as a term dictionary, forbidden words, spelling rules, and narration readings. Section 2 of the internal contract holds the sketch. Draft it as a separate contract, because the kind of data is different.
- Adding a `version` field to the whole of `connections.schema.json`. See section 0. Consider it when a breaking change to `memory` is actually required.
