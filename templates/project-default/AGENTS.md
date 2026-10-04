# How to work in an AKARI Video project

By default the library lives in `library/` in the workspace. When there is no workspace, the older `~/.akari/assets/` is used.
The first line of `akari-assets list` (or `akari assets list`) shows the location actually in use.
`<library location>` below means that location. Audio goes in `audio/` under it.

> **Language**: Respond in the user's language. Match conversation, questions, approval prompts, and reports to the language the user writes in (for example, answer in Japanese when the user writes in Japanese).

- `assets/` holds the footage: source video and audio. Keep the English folder name, and do not rewrite or delete the originals.
- `planning/` holds what a person reads: plans, analysis reports, and edit plans.
- `exports/` is where finished videos are exported.
- `.akari/sidecars/` holds analysis results for the footage, and `.akari/events/` holds the record of milestones in the work.
- Save the analysis result for a file in `.akari/sidecars/<path relative to assets>.meta.json`.
- At each milestone (report written, approval, edit complete, export complete), add one new record to
  `.akari/events/`. Do not rewrite or delete a record that already exists.
- When `status` in `.akari/intake.json` is `submitted`, follow its `tasks` / `target` / `autonomy`.
  With `autonomy: checkpoint` (the default), check with the user at key points such as plan approval
  and before export. With `status: draft`, how to proceed is not settled yet, so settle it through
  the form or in conversation before you proceed.
- When you write how to proceed into `.akari/intake.json`, use only the five defined ids for `tasks`, and set `target` to either `duration_s` or `keep_length: true`, never both.
  Check with lint before you set `status` to `submitted`.
- Do not create new files directly under the project root (except existing contract files such as `edit.json`).
  Put generated files in `.akari/work/`, evidence in `.akari/reports/`, and caches in `.akari/cache/`.
  For the full definition of the layers, see [the canonical document in the public repo](https://github.com/AkariLabs/akari-video/blob/main/docs/contract-2026-07-25-project-structure-v0.md) (Japanese).
  Local copies are (b) `~/.akari/app/docs/contract-2026-07-25-project-structure-v0.md` on the `install.sh` route,
  and (c) `<repo>/docs/contract-2026-07-25-project-structure-v0.md` in the monorepo.

## Checking the preview

Use the existing preview. Do not build a dedicated playback HTML page, playback UI, or audio sync
just to provide one (unless the user explicitly asks for a standalone playback page).
Open the output preview for the project in the app. The browser version starts from "Menu" →
"Browser Preview". For details read
[Starting and checking the existing preview](.claude/skills/edit-lint/preview.md).
If it does not start, record the cause and the conditions that reproduce it. To report it as checked,
confirm playback, seeking, and audio (when there is any) on the existing screen, and say whether that was
in the app or in the existing browser preview.
Checking only a rendering component or a separate page does not count as checking the existing preview.

## Where AKARI Video lives

- `~/.akari/cli` … the CLI and its shim (`~/.akari/cli/bin/akari` on macOS / Linux, `~/.akari/cli/bin/akari.cmd` on Windows). It is deployed when the partner connects.
- `~/.akari/app` … AKARI Video itself on the `install.sh` route. It may be absent when only the desktop app is used.
- `<App>/Contents/Resources/packages/` bundled with the app … the CLIs such as render-cut and edit-lint. On Windows this is `<install dir>\resources\packages\`.
- `<App>/Contents/Resources/media-bin/` bundled with the app … ffmpeg and ffprobe. whisper-cli is not bundled in every build. On Windows this is `<install dir>\resources\media-bin\`.
- `<library location>` … the asset library files.

Assume none of these are on PATH. In a terminal other than the partner PTY, run `~/.akari/cli/bin/akari` on macOS / Linux or `~/.akari/cli/bin/akari.cmd` on Windows by its full path (on Windows the only entry point is `akari.cmd`; Git Bash does not find it without the extension).

## When footage is short

- `akari assets list` shows the account's asset library (everything free plus what was purchased).
- `akari assets fetch <id> --project .` brings an asset into this project (the sha256 is verified).
- A paid asset can be used when the account connected with `akari store connect` has purchased it. One that is
  not purchased shows as `locked` with its price.
- The library files live in `<library location>/`. Do not edit them directly. Go through the commands above.

## Skills in the project

Every directory under `.claude/skills/` can be used as is. The main ones:

- `/analyze-footage` … analysis of each piece of footage
- `/analyze-project` … combined analysis of several pieces of footage and the project context
- `/edit-plan` … edit plan, report, approval, and generation
- `/overlay-authoring` … making on-screen elements such as captions, diagrams, and 3D
- `/edit-lint` … deterministic checks and QA of the edit result
- `/render-cut` … export and verification of the approved edit
- `/setup-library` … preparing the asset library
- `/address-review` … handling open review comments

In harnesses such as Codex and Cursor, the same skills are discovered automatically from `.agents/skills/` / `.cursor/skills/` / `.codex/skills/` (symlinks to `.claude/skills/`).

In an environment that does not load skills automatically, read the steps directly from the project-relative path
`.claude/skills/<skill name>/SKILL.md`.
The list of directories in `.claude/skills/` is the list of skills that can be used.

For the detailed rules about analysis results and milestone records, see
`.claude/skills/analyze-footage/references/akari-data-contract.md`.

When you explain something to the user, use the user's language, and use words that convey the role,
such as "version history", "planning notes", and "footage", not the names of internal mechanisms.

This guide belongs to this project. Rewrite it freely to fit how you work.
