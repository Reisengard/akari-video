**English** | [Japanese](./notes-2026-08-08-cli-consolidation.ja.md)

# Rule for what moves to the CLI, 2026-08-08

## The rule

Move execution code to the CLI `akari-launcher` or `akari-tools` only when more than one skill, or the app, calls it. A `bin/` that only one skill uses stays in that skill's directory.

`akari-launcher` is the zero-dependency side. It runs on Node.js built-in modules only. Put execution code that needs an external npm dependency in `akari-tools`. The launcher resolves that path lazily and starts it as a child process. The launcher itself does not import `akari-tools` or `puppeteer-core`.

## What moved this time

| Skill it came from | Public entry | Where the implementation moved |
|---|---|---|
| `create-project` | `akari new` | `packages/akari-launcher/src/new-command.mjs` |
| `generate-narration` | `akari narration generate` | `packages/akari-launcher/src/narration-command.mjs` |
| `beat-sync-edit` | `akari internal beat-sync-*` | `beatmap.mjs`, `probe-frame.mjs`, and `render-when-idle.sh` under `packages/akari-tools/bin/` |

The move covered three skills. Two commands went to the zero-dependency launcher. One group went to the tools package that has dependencies, and that group is three executables. Each of those skills lost its `bin/`. Procedure docs now call the `akari` commands above.

The other 18 skills were not touched. Six of them have a self-contained `bin/`. Those six stayed in the skill directory, which is what the rule says.

## Added 2026-09-05

The ATF rendering CLI is retired. Captions use the HTML footage build that Lab distributes. Playback of an existing baked file stays, and so does Chrome use in the developer tools.
