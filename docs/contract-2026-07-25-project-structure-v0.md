**English** | [日本語](./contract-2026-07-25-project-structure-v0.ja.md)

---
lifecycle: draft
created: 2026-07-25
updated: 2026-09-06
---

# project-structure v0 contract (where generated files go)

- Date: 2026-07-25
- Status: draft. Needs an owner review.
- Depends on: `contract-2026-07-17-data-contract-versioning.md` (the source of truth for the three versioning principles). This contract is a placement rule inside a project, not schema versioning, so the three principles do not apply directly. The document form follows them. Also `contract-2026-07-25-recipe-v0.md` (the sister contract just before this one, the precedent for voice, form, and marking a draft) and `contract-2026-07-13-m1-m4.md` (the source of truth for existing contract files that currently sit at the project root, including `edit.json`).
- Origin: a real-machine note on 2026-07-25. A real project's root held nine `frame-*.png` files (keyframe visual-check traces), an ad-hoc verification script and its result JSON, and `final.mp4`, all scattered. The note was that everything has to be structured or it becomes a problem. This contract fixes the destination of generated files as layers. The reasons and the source survey stay in private internal records. This repo does not hold them.
- Scope: the placement rule for generated files inside a project directory (the layer definitions, the root-level principle, and the definitions of safe-to-delete and legacy), plus writing those destinations into existing skills and templates. Out of scope: migrating existing projects, a script that forces a move, GUI changes, code changes to `edit-lint` or `render-cut` under `packages/**`, schema changes, and the decision on what to do with a legacy `cache/` at the root (section 7).

## 0. What this contract is

Say, on one page, where a generated file goes.

This contract defines only which file is written where. It introduces no new data schema and no new run procedure. It inventories the file kinds that existing skills and CLIs (`edit-lint`, `render-cut`, `analyze-footage`, and the others) actually generate, fixes the canonical place in one table (section 1), and writes that destination into the skill documents and the project template. That stops generated files from scattering onto the project root, by structure.

Control rests on two posts. Isolate the hidden area (put the safe-to-delete layer in a dot directory). And the skill teaches the place (the skill document names the output destination). A "paths declaration" (a UI that sets locations per project) is out of scope (section 7).

## 1. Layer definitions

The canonical places.

| Layer | Place | Writer |
|---|---|---|
| A person's primary footage | `assets/` (subfolders are free) | A person, or the ingest UI |
| Planning | `planning/` | A skill, plus human approval |
| Agent intermediates, and ad-hoc verification scripts and their results | `.akari/work/` | A skill or an agent |
| Verification traces and reports (keyframe visual-check PNGs, the render report, and similar) | `.akari/reports/` | A skill |
| Storyboard (a print of the timeline, drawn once, and the AI does not read it later) | `.akari/reports/storyboard/` | A skill |
| Cache (thumbnails, proxies, and other files that can be generated again) | `.akari/cache/` | The app or a skill |
| Deliverables | `exports/` | `render-cut` |
| Contract sidecars (existing) | `.akari/` (`sidecars/`, `diffs/`, `events/`, and the others) | Unchanged |

Files that are not in this table also sit directly under `.akari/` (`intake.json`, `workflow.json`, `connections.json`, `lint.json`, `render.json`, and others). Each of those has its own contract as the source of truth. This contract only adds the placement layer. It does not change the shape of each file.

## 2. Principles

### 2-1. Root-level principle

**A new file directly under the project root may only be an existing contract file, such as `edit.json`, `captions.json`, or `review.json`.** Writing any other new file directly under the project root violates this contract.

- Those three files already have a root placement fixed by their own contracts ([contract-2026-07-13-m1-m4.md](contract-2026-07-13-m1-m4.md), [contract-2026-07-20-review-json-v1-annotation-model.md](contract-2026-07-20-review-json-v1-annotation-model.md), and others). This contract does not move them.
- Generated files other than those three, such as `frame-*.png`, an ad-hoc verification script and its result, and an intermediate file from before the final export, go to a layer in section 1 according to what they are. Section 4 gives examples.
- Adding a new top-level contract file later goes through a revision of this contract.

#### Added 2026-08-26. Decision records and the analysis report at the root

- `decision-log.md` is the single source of truth for the decision history that analyze-project and edit-plan append together. It is a legitimate contract file directly under the project root. The basis is the `decision_log` section of `skills/edit-plan/report-guide.md`.
- `analysis-report.html` is the formal analysis report that analyze-project generates and edit-plan reads. It is a legitimate contract file directly under the project root. The basis is section 1 of `skills/edit-plan/workflow.md`.
- This addendum adds those two files to the allow-list in section 2-1. It does not allow any other file at the root.

### 2-2. What safe to delete means

`.akari/work/` and `.akari/cache/` are defined as regenerable and safe to delete.

- `.akari/work/`. Intermediates an agent makes while it runs, and ad-hoc verification scripts and their results. Put here only what the same inputs and the same procedure can reproduce.
- `.akari/cache/`. Thumbnails, proxies, and similar files. Put here only what can be regenerated mechanically from the original (`assets/`) or from an approved artifact (`edit.json` and the others).
- These two directories may be left out of backups. Deleting them is recoverable as long as the original or the source-of-truth file remains. `.akari/reports/` is a verification trace and is not defined as safe to delete. A keyframe visual check and a render report are a record of what a person confirmed at that time. Running the step again does not guarantee the same content.

## 3. Legacy

A `cache/` directory at the root of an existing real project (a project created before this contract), and scattered files such as `frame-*.png`, are defined as legacy.

- Moving legacy material into the layers in section 1 is out of scope.
- Do not write a script that forcibly moves or deletes files.
- What to do later with an existing project's root `cache/` (fold it into `.akari/cache/`, delete it, or leave it) is an owner decision. This contract does not make that decision (section 6).
- A new project, created from the template after this contract applies, follows the layers in section 1 from the start. The legacy definition exists to exempt projects that were already made. It does not apply to generated files created from now on.

## 4. Examples

Where the three scattered files from the original note go.

The three scattered file kinds observed in the real-machine note go to these layers under this contract.

| Example | What it is | Where it goes under this contract |
|---|---|---|
| `frame-*.png` (a keyframe visual-check trace) | A verification trace or report | `.akari/reports/` (the same layer as the visual-check screenshots from `edit-lint` and `render-cut`. Section 1) |
| `negative-rule-check.mjs` plus `negative-rule-check-result.json` (an agent's ad-hoc verification script and its result) | An agent intermediate | `.akari/work/` (the script and the result JSON in the same directory. Sections 1 and 2-2) |
| `final.mp4` | A deliverable | `exports/` (as the `render-cut` output contract says. Section 1) |

None of these introduces a new file shape or a new naming rule. They only name which layer from section 1 each example belongs to.

## 5. Where this contract is applied

This contract is reflected as an output destination in the following skill documents and in the project template. The added text in each file is where this contract is carried out.

- `skills/edit-lint/SKILL.md`. Keyframe visual-check images and QA artifacts go to `.akari/reports/`. Temporary scripts go to `.akari/work/`.
- `skills/render-cut/SKILL.md`. The final MP4 goes to `exports/`. Visual-check screenshots go to `.akari/reports/`. Intermediate files go to `.akari/work/`.
- `skills/edit-plan/workflow.md`. Ad-hoc verification scripts and experiment artifacts go to `.akari/work/`.
- `skills/analyze-footage/SKILL.md`. A cross-link stating that the existing `.akari/sidecars/` rule is part of this contract.
- `templates/project-default/` (add `.akari/work/`, `.akari/reports/`, and `.akari/cache/` as real directories) and a three-line summary plus a reference to this contract in that template's `CLAUDE.md` and `AGENTS.md`.

## 6. Owner decisions

- Defining the root `cache/` and the scattered files of an existing real project as legacy, and leaving migration out of scope (section 3). What to do with them later (fold in, delete, or leave) needs an owner decision.
- The decision not to introduce a "paths declaration" (a mechanism that changes locations per project from a UI) in this contract (sections 0 and 7). Introducing it needs another contract.

## 7. Next stage

Out of scope for this contract.

- Migrating legacy material in existing projects, and a script that forces a move (section 3).
- Unsorted sections of a GUI such as the footage tab. That belongs to another lane.
- Code changes to `edit-lint` or `render-cut` under `packages/**`. This contract only names the output destination in documents. It does not change where the CLI writes.
- Schema changes. The shape of existing contract files such as `edit.json` does not change.
- Introducing a "paths declaration" (a UI that customizes locations per project).
- The final decision on a legacy root `cache/` (sections 3 and 6).

## 8. Addendum (2026-08-30). Register `motion/` as a source-of-truth directory

`contract-2026-08-30-edit-json-v2-object-tree-v0.md` (Japanese) and `contract-2026-08-30-motion-and-keyframes-v0.md` (Japanese) add `motion/` directly under the project.

| Use | Place | Creator | Kind |
|---|---|---|---|
| A bag of keyframe curves (`motion/<group-id>.json`, referenced from edit.json `keyframes: { path, count }`) | `motion/` | edit-store (split out from inline data on save) | Source of truth. Not regenerable. Not `.akari/cache/`. |

- It is saved in the same transaction as edit.json and captions.json, and it passes the same lint gate.
- This is not an exception to section 2's rule that a new file at the root is limited to source-of-truth files. It is an added source-of-truth file.

## 9. Addendum (2026-09-02). `akari clean` and the sub-rule for `.akari/work/`

Section 2-2 still defines `.akari/work/` as regenerable and safe to delete. In existing real projects, though, a plan a person edited, a generator, and disposable output have lived in the same place, and a bulk delete has already lost data that could not be generated again. As a safety measure for this transition, `akari clean` does not treat all of `.akari/work/` as deletable. It handles only what the following sub-rule and markers can classify.

| Place or marker | Kind | What `akari clean` does |
|---|---|---|
| `.akari/work/tmp/` | Disposable. The same inputs and procedure can rebuild it. | May delete |
| `.akari/work/keep/` | Cannot be rebuilt. A plan, a generator, a hand-edited file. | Keep |
| An `.akari-disposable` file directly inside a directory | An empty file that declares everything under that directory disposable | May delete |
| An `.akari-keep` file directly inside a directory | An empty file that declares everything under that directory kept | Keep |
| Anything else under `.akari/work/` | A source-of-truth file mixed in cannot be ruled out | Defer the decision |

A marker applies to everything under the directory it sits in. If `.akari-keep` is in an ancestor or in the same directory, keep wins over `.akari-disposable`. A skill does not put a plan, a generator, or a hand-edited file that is expensive to regenerate directly under `.akari/work/`. It puts those in `keep/`. Existing files such as `.akari/work/semantic-keep-plan.json` and `.akari/work/gen-timeline.mjs` are not moved, for compatibility. Files created after this rule use `tmp/` or `keep/`.

`akari clean` lists what may be deleted, what is kept, and what is deferred, from the table above. By default it deletes nothing. After explicit approval it deletes only what was classified as deletable. A candidate updated within the last 60 minutes, and a symbolic link, move to deferred. This limited opt-in delete is compatible with section 3's rule that legacy material is not forcibly moved or deleted.

Generated footage under `assets/generated/` should carry a `<file>.meta.json` when it can. The provenance sidecar has the shape below. `provenance` uses the same key names as `asset-meta.schema.json`. `akari clean` reads it and shows the origin, and it warns when the `origin` target is missing. Implementing the generator that writes the sidecar is outside this addendum.

```json
{
  "version": 1,
  "provenance": {
    "origin": "planning/plan.json",
    "generator": "tool-name",
    "inputs": ["assets/source.mp4"],
    "created_at": "2026-09-02T00:00:00.000Z"
  }
}
```

## 10. Addendum (2026-09-03). What goes into change history (the `.gitignore` template)

Sections 2-2 and 9 are about whether a file may be deleted from disk. This section is a different axis. Whether the file goes into change history (the automatic snapshot at each milestone). The two axes are decided independently. A delivered `exports/*.mp4` is kept on disk and is not put in history.

The template `.gitignore` was not excluding generated files, so one 40-second video made `.git` reach 4.2 GB. Across six projects, `.git` was 70 percent of the total and footage was 4 percent. The cause was that knowledge of the same extensions lived in two places, and only one of them kept growing.

| Put in change history | Leave out |
|---|---|
| `edit.json`, `captions.json`, `review.json`, `plan.json` | `assets/**` (originals) |
| `planning/**`, `.akari/events/**`, `motion/**` | Generated picture, audio, and images (the extensions in the list below) |
| JSON and HTML under `.akari/reports/**` (the body of a trace) | `.akari/render-tmp/**`, `.akari/cache/**`, `.akari/diffs/**` |
| `.akari/sidecars/**` (everything, including picture) | |

- Excluded extensions: `.mp4`, `.mov`, `.m4v`, `.webm`, `.mkv`, `.avi`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.wav`, `.mp3`.
- There are exactly two exceptions. `.akari/sidecars/**` stays in history even when it is picture, because analysis is expensive. `.akari/reports/**` splits by extension. A png is left out. JSON and HTML stay.
- The single source is `packages/akari-launcher/src/history-policy.mjs`. The `.gitignore` template (`templates/project-default/.gitignore` and `PROJECT_GITIGNORE` in `project-scaffold`) and the "see changes" exclusion (`isInternalOrBinaryPath()`) are both derived from it. Adding an extension to only one of them violates this contract.

### Migration

When the app opens a project, it aligns `.gitignore` with the current content, removes newly covered tracked files from the index with `git rm --cached`, and makes one commit.

- Do not delete the files on disk. They are the user's artifacts. Whether they may be deleted is a separate decision, the table in section 9.
- Do not rewrite history itself (the blobs past commits already hold). That is the user's own explicit operation. Migration alone does not shrink `.git`. It stays about the same size.
- The app manages only the block of `.gitignore` from `# >>> AKARI Video ... >>>` through `# <<< ... <<<`. Do not delete lines a user added outside that block.
- Run this only when the project is the root of its own git repository. A project placed inside a parent repository is out of scope, because this must not quietly change the tracked set of a repository it does not manage. The same restraint as section 3, "do not write a script that forcibly moves or deletes files".

### Added 2026-09-06. Where the storyboard goes

Drawn once. Contract sections 5.2 and 14-4.

A storyboard is a derived view of the timeline, drawn from `edit.json` and `captions.json`. It lives at `.akari/reports/storyboard/` (the report layer, safe to delete). Draw it only the first time. Do not update it. Do not put it on the input side. The AI does not read it later. To change it, change the timeline and draw it again.
