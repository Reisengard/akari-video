# AKARI Video project

By default the library lives in `library/` in the workspace. When there is no workspace, the older `~/.akari/assets/` is used.
The first line of `akari-assets list` (or `akari assets list`) shows the location actually in use.
`<library location>` below means that location. Audio goes in `audio/` under it.

> **Language**: Respond in the user's language. Match conversation, questions, approval prompts, and reports to the language the user writes in (for example, answer in Japanese when the user writes in Japanese).

This project is edited along these roles.

- `assets/` … the footage: source video and audio. Treat the originals as read-only. Do not rewrite or delete them.
- `planning/` … what a person reads: plans, analysis reports, and edit plans.
- `exports/` … where finished videos are exported.
- `.akari/` … analysis results for the footage, and the record of milestones in the work.

Save the analysis result for a file in `.akari/sidecars/<path relative to assets>.meta.json`.
At each milestone (report written, approval, edit complete, export complete), add one new record to
`.akari/events/`. Do not rewrite or delete a record that already exists.

How to proceed this time is recorded in `.akari/intake.json`. When `status` is `submitted`, follow its `tasks` (what to do), `target` (the finished length), and `autonomy` (how much is left to you). Treat `full-auto` as "As is": go through to export with no checks on the way, and attach a capture and a lint result afterwards. Treat `checkpoint` as "With suggestions", the default: add what looks good and show it, the user removes what they do not want, and the only sign-off is at export. Treat `collaborative` as "Make it together": check with the user at the key points of direction, footage, and execution. When `status` is `draft`, the file is missing, or `autonomy` is absent, assume "With suggestions" and do not follow the draft's `tasks` / `target` / `autonomy`. Settle how to proceed through the form or in conversation.

When you write how to proceed into `.akari/intake.json`, use only the five defined ids for `tasks`, and set `target` to either `duration_s` or `keep_length: true`, never both. Check with lint before you set `status` to `submitted`.

When footage is short, `akari assets list` shows the account's asset library (everything free plus what was purchased).
When you find an asset to use, bring it into this project with `akari assets fetch <id> --project .`
(the sha256 is verified). A paid asset can be used when the account connected with `akari store connect`
has purchased it. One that is not purchased shows as `locked` with its price. The library files themselves
live in `<library location>/`. Do not edit them directly. Go through the commands above.

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

- `~/.akari/cli` … the command-line tool and its entry point (`~/.akari/cli/bin/akari` on macOS / Linux, `~/.akari/cli/bin/akari.cmd` on Windows). It is deployed when the partner connects.
- `~/.akari/app` … AKARI Video itself when installed with `install.sh`. It may be absent when only the desktop app is used.
- `<App>/Contents/Resources/packages/` bundled with the app … the commands that run editing and checks, such as render-cut and edit-lint. On Windows this is `<install dir>\resources\packages\`.
- `<App>/Contents/Resources/media-bin/` bundled with the app … ffmpeg and ffprobe. whisper-cli is not bundled in every build. On Windows this is `<install dir>\resources\media-bin\`.
- `<library location>` … the asset library files.

Assume none of these are on PATH. In a terminal other than the partner PTY, run `~/.akari/cli/bin/akari` on macOS / Linux or `~/.akari/cli/bin/akari.cmd` on Windows by its full path (on Windows the only entry point is `akari.cmd`; Git Bash does not find it without the extension).

## Editing skills

Every directory under `.claude/skills/` can be used as is. The main ones:

- `/analyze-footage` … analyzes what is in each piece of footage.
- `/analyze-project` … analyzes several pieces of footage together with the context of the whole project.
- `/edit-plan` … makes the edit plan and applies it to the edit after a report and an approval.
- `/overlay-authoring` … makes on-screen elements such as captions, diagrams, and 3D.
- `/edit-lint` … checks the edit result mechanically and supports the finishing review.
- `/render-cut` … exports the approved edit and verifies the finished file.
- `/setup-library` … prepares the assets that can be used.
- `/address-review` … applies open review comments to the edit.

Entry points for other AI agents such as Codex and Cursor are in `.agents/skills/`, `.cursor/skills/`, and `.codex/skills/`
(they are links to `.claude/skills/`).
See `AGENTS.md` for how to proceed in detail and for where to read the skill documents directly.

When you explain something to the user on screen or in conversation, use the user's language, and guide them
with words that convey the role, such as "version history", "planning notes", and "footage", not the names of internal mechanisms.

Do not create new files directly under the project root (except existing contract files such as `edit.json`).
Put generated files in `.akari/work/`, evidence in `.akari/reports/`, and caches in `.akari/cache/`.
For the full definition of the layers, see [the canonical document in the public repo](https://github.com/AkariLabs/akari-video/blob/main/docs/contract-2026-07-25-project-structure-v0.md) (Japanese).
Locally it is also at (b) `~/.akari/app/docs/contract-2026-07-25-project-structure-v0.md` when installed with `install.sh`,
and (c) `<repo>/docs/contract-2026-07-25-project-structure-v0.md` when you have the monorepo.

This file belongs to your project. Rewrite it freely to fit how you work.
