**English** | [Japanese](./contract-2026-08-29-media-inspect-cli-v0.ja.md)

# `akari media` observation-command contract v0. probe, grab, filmstrip, waveform, transcribe

- Date: 2026-08-29
- Status: **v0 (owner ruling on 2026-08-29, not implemented yet).** A mismatch found in the implementation task is resolved by appending.
- Depends on:
  - `notes-2026-08-08-cli-consolidation.md` (launcher means zero dependencies, akari-tools means the side with external dependencies. The launcher resolves a path lazily and starts a child process).
  - `contract-2026-07-25-project-structure-v0.md` (where `.akari/sidecars/`, `.akari/reports/`, and `.akari/cache/` live).
  - `contract-2026-07-17-data-contract-versioning.md` (version required, append only, lenient reader).
  - `contract-2026-07-13-m5-analysis-report.md` (analysis.json v0) and `contract-2026-08-11-analysis-vision-tracks-v0.md` §0 (**analysis is pull-driven**. Not generated means the key is absent).
  - `contract-2026-07-18-edit-json-v1-sources.md` (an observation result is persisted as (`src`, source seconds)).
- Scope: input, output, placement, and the append rules into the ledger (analysis.json) for five commands that **look at** one piece of footage. The judgment that calls an LLM (what to look at, the finding, the score) is the **skill's** job (`analyze-footage` and `critique-cut`) and is outside this contract.
- Sister contract: `contract-2026-08-29-capture-v0.md` (`akari capture`, which looks at the finished frame of edit.json).

## 0. Place in the system

**Observation is a CLI. Judgment is a skill.** For footage, answer "what is in it", "what is being said", "where it is quiet", and "what the picture is at this time", one question per command. Do not assume a pass that analyzes everything first. Do not call an LLM. Be deterministic and fast. If the target is inside a project, the result is **appended to the ledger (analysis.json) automatically**, and the next session starts from the ledger.

That surface does not exist today. The only observation-like code is two commands behind `akari internal beat-sync-probe-frame` and `beat-sync-beatmap`. probe, filmstrip, waveform, and transcribe are skills calling ffmpeg, ffprobe, and whisper.cpp directly from a procedure doc. This contract gathers that into one place and makes it a public surface. The command name `media` is provisional (aligned with the external `dapi media`). Renaming it does not change the meaning of this contract.

## 1. Shared rules

| Item | Rule |
|---|---|
| Invocation | `akari media <sub> <target> [options]`. `<target>` is a path to a local file, or a `sources[].id` of the open project |
| stdout | **JSON only.** One JSON value when there is one result. JSON Lines, one object per line, when there are several. Do not wrap them in an array |
| stderr | Progress, warnings, and errors for a person. A machine does not read it |
| exit | `0` success. `1` failure (missing file, ffmpeg absent, bad argument, write failure). There is no partial success |
| Determinism | The same input and the same options produce the same output, down to PNG dimensions, frame layout, and time labels. Do not mix a random number or the current time into the result (`generated_at` is the exception) |
| LLM | Do not call one. Do not call the cloud by default. The only exception is the approval-gated cloud of `transcribe` (§2.5) |
| Time input | Seconds (`12.5`) or `MM:SS(.fff)`. A negative value, or a time past the duration, is exit 1 |
| Time output | Always **source seconds** (a number). A timecode string is extra information for a label |
| Placement | The implementation lives in `packages/akari-tools/bin/` (the side that depends on ffmpeg and ffprobe). The launcher resolves the path lazily from `repo-assets.mjs`, in the same style as `internal-command.mjs`, and starts a child process. The launcher itself does not import akari-tools |
| ffmpeg and ffprobe | Reuse `resolveFfmpeg()` and `resolveFfprobe()` from `packages/render-cut/src/render-cut.mjs`. Do not duplicate the search rule |
| Outside a project | A path that has no `.akari/` ancestor is accepted (a quick look right after install). There is no ledger, so the command only prints output (§3) |

### 1.1 Contact sheet (shared spec for images returned by grab, filmstrip, and capture)

- One image is **at most 2576 by 1456 px**, and **at most 12 frames**. Match the limit a vision model can read at full resolution. The point is to have the model read 12 times from one image, which is 1/12 of the image tokens of reading keyframes one by one.
- Pick the grid that makes each frame as large as possible. A guide for 16:9 footage:

| Frame count | Grid | One frame |
|---|---|---|
| 1 | 1 by 1 | 1920 by 1080 |
| 2 to 4 | 2 by 1, or 2 by 2 | 1280 by 720 |
| 5 to 9 | 3 by 2, or 3 by 3 | 850 by 478 |
| 10 to 12 | 4 by 3 | 636 by 357 |

- 13 frames or more split **evenly** across several sheets (13 becomes 7 plus 6, not 12 plus 1). `--per-sheet <n>` (1 to 12) sets the frame count per sheet.
- Each frame has a timecode label at the bottom left (`08s10f` or `01m05s`, dropping a zero unit. Frames are converted at 30 fps). The sheet name is the span it covers (`0f-11s.png`).
- The background (the gutter between frames, and any transparent part) is opaque mid-gray. Footage under 1080p is scaled up to a 1080p height. Footage above that is not scaled up.
- Extend and share `packages/render-cut/src/contact-sheet.mjs` (`contactSheetGridDimensions` and `renderContactSheet`). Use the same drawing code as the `.akari/reports/contact-sheet.png` that render-cut generates automatically after export. Do not implement it twice.

## 2. Commands

### 2.1 `akari media probe <target>`

Answer what is in the file, without decoding.

```jsonc
{
  "path": "assets/interview.mov",          // the given path (root-relative if inside a project)
  "sha256": "…",                           // content hash (the same key as the transcribe cache)
  "size_bytes": 1234567,
  "container": "mov",
  "duration_s": 754.2,
  "video": { "width": 3840, "height": 2160, "fps": 29.97, "codec": "hevc", "rotation": 0 }, // null if absent
  "audio": { "codec": "aac", "channels": 2, "sample_rate": 48000 },                          // null if absent
  "tool": { "ffprobe": "7.1" },
  "generated_at": "2026-08-29T10:00:00Z"
}
```

- Rough cost: an instant. Append to the ledger as `probe` (§3).

### 2.2 `akari media grab <target> -t <time…> [--separate] [--per-sheet <n>] [--out <dir>]`

Return the picture at the given times. The default is a contact sheet. `--separate` writes one PNG per time, 720p tall.

```jsonc
{ "kind": "sheet", "timecode": "0f-11s", "times_s": [0, 4.5, 11], "path": ".akari/reports/media/interview/grab-20260829T100000Z/0f-11s.png" }
```

- `-t` is required, one or more. Times are source seconds. They are not the timeline after the cut. That is `capture`.
- Default output. Inside a project, `.akari/reports/media/<source-stem>/grab-<stamp>/`. Outside a project, create `akari-grab-*` in the OS temp directory (they do not overwrite each other).
- Rough cost: seconds. The tokens to read the image are one sheet.

### 2.3 `akari media filmstrip <target> [--count <n> | --every <sec> | --scenes [<threshold>]] [--per-sheet <n>] [--out <dir>]`

Return the flow of pictures across the whole footage. The output shape matches grab (JSON Lines of sheets).

- The default is `--count 12` (12 frames at even spacing, which is one sheet). `--every` is even spacing in seconds. `--scenes` picks cut points with ffmpeg scene detection (default threshold 0.3). When `--scenes` and `--count` are combined, scene points win, up to the cap.
- Rough cost: seconds to tens of seconds. A long `--scenes` pass decodes.

### 2.4 `akari media waveform <target> [--silence-db <dB>] [--min-silence <sec>] [--out <dir>]`

Return where the sound is. A PNG (the waveform, with silent spans colored) and JSON.

```jsonc
{
  "path": "assets/interview.mov",
  "duration_s": 754.2,
  "png": ".akari/reports/media/interview/waveform.png",
  "silences": [ { "start": 12.4, "end": 13.6 } ],   // source seconds. Not a closed interval. [start, end)
  "speech_likely": true,                             // a coarse guess that speech is present (the L1 gate in §4)
  "loudness": { "integrated_lufs": -19.8, "peak_dbfs": -1.2 },
  "params": { "silence_db": -35, "min_silence_s": 0.6 },
  "generated_at": "…"
}
```

- Defaults: `--silence-db -35` and `--min-silence 0.6` (line up with the pause candidates in analyze-footage. If those differ, follow them).
- `speech_likely` may be a coarse judgment of "the share of non-silent spans, and the band energy". **Do not emit a confidence.** A capability that is not declared does not exist. Use it as the gate that decides whether to transcribe. Do not use it as evidence for captions.
- Rough cost: seconds. Append to the ledger as `tracks.waveform` (§3).

### 2.5 `akari media transcribe <target> [--in <time> --out <time>] [--backend <name>] [--lang <code>] [--no-unrecognized] [--unrecognized-min-gap <sec>] [--unrecognized-min-voiced <sec>] [--no-word-book] [--word-book <path>]`

Return what is being said, with a time on each word.

```jsonc
{
  "path": "assets/interview.mov",
  "range": { "in": 0, "out": 754.2 },         // the whole file when not specified
  "backend": "speech-analyzer",                 // speech-analyzer, whisper-cpp, or cloud:<connection-id>
  "no_speech": false,
  "segments": [ { "start": 1.2, "end": 3.4, "text": "…", "words": [ { "text": "…", "start": 1.2, "end": 1.5 } ] } ],
  "cache": { "hit": false, "key": "<sha256>-0-754.2-speech-analyzer-ja" },
  "generated_at": "…"
}
```

- The shape of `segments[]` is the same as `transcript[]` in analysis.json v0 (it can be copied as it is). Times are **source seconds**.
- Each segment may hold an optional `unrecognized: [{ start, end }]` for "a span that has sound but could not be turned into text". The default takes a word gap of 0.45 seconds or more, subtracts the silence, and keeps a remainder of 0.3 seconds or more. `--unrecognized-min-gap` and `--unrecognized-min-voiced` change the thresholds. `--no-unrecognized` stops detection. The cache key stays as before. An old cache hit that has no `unrecognized` is returned as the spec says, and a later transcribe adds it.
- By default, apply the workspace-base word book at word boundaries immediately after STT. `--no-word-book` disables it. `--word-book <path>` can add a verification layer closer than the project. The transcription cache stores the raw output from before replacement. The word-book pre-pass runs on every cache hit and every cache miss, after the cache read and before the analysis.json write.
- Backend priority matches the three layers of analyze-footage: macOS SpeechAnalyzer (26 and later, swiftc available), then whisper.cpp, then the cloud. **The cloud runs only when `--backend cloud:<connection-id>` is explicit**, and only for a connection registered in `.akari/connections.json` with doctor `ok`. Do not send audio outside by default. Do not print the key's value to stdout, stderr, or an output file.
- If no backend can be used, do not guess. Exit 1, with the reason on stderr. If no speech is detected, return `no_speech: true` and `segments: []` with **exit 0** (that is not a failure).
- **The cache is a content hash:** `.akari/cache/transcribe/<sha256>-<in>-<out>-<backend>-<lang>.json`. Do not transcribe the same audio twice. Outside a project, use a directory of the same name in the OS temp area.
- Rough cost: 0.1 to 1 times real time (depends on the backend). Append to the ledger as `transcript` (§3).

## 3. Appending to the ledger (analysis.json)

### 3.1 When to append

- **Inside a project, when the target is the project's footage, append by default** (owner ruling 2026-08-29, "putting what you looked at into analysis.json is completely fine"). `--no-record` suppresses it.
- A file outside a project, or a place with no `.akari/` ancestor, is **output only** (there is no ledger).
- The ledger path is the canonical path in analyze-footage `workflow.md`: `.akari/sidecars/<source-relative-path>.analysis/analysis.json`. If it is missing, create a **minimal valid document**: `{ "version": 0, "source": "<path>", "transcript": [], "keyframes": [], "events": [], "tracks": { "speakers": [], "faces": [], "person_matte": null } }`. A missing key means **not looked at yet**. It does not mean "there was none".

### 3.2 What to write (the schema is additive, and `version: 0` stays)

Change only the canonical `packages/schemas/analysis.schema.json`. Because of `additionalProperties: false`, an added key that is not declared on the schema side fails analyze-footage validation. `apps/shell/lib/schemas/analysis.schema.json` is a **build artifact that is not tracked** (`/lib/` in `apps/shell/.gitignore`). The build generates it from the canonical file. Do not edit or commit a hand copy. (Corrected 2026-08-29. The draft said "the same change on both copies", but the copy is not in git. Measured on the implementation lane.)

| Command | Where it writes | Shape |
|---|---|---|
| probe | new optional `probe` (object) | the §2.1 JSON without `path` and `generated_at` |
| waveform | new optional `tracks.waveform` | a pointer of the same type as `visionTrackPointer`, `{ path, tool, generated_at }` (path is the §2.4 JSON, relative to the analysis.json directory) |
| transcribe | existing `transcript[]` | Replace the whole thing for a full pass. With `--in` and `--out`, **replace the segments in that range** and keep the rest. Leave the backend in `observations[]` |
| grab and filmstrip | **do not write** `keyframes[]` (`note` is analysis written by whoever looked, not an observation) | Put the generated PNG on `observations[]` only |
| every command | new optional `observations[]` | below |

```jsonc
"observations": [
  { "kind": "waveform", "at": "2026-08-29T10:00:00Z", "args": { "silence_db": -35, "min_silence_s": 0.6 },
    "outputs": [ "waveform.json", "waveform.png" ], "tool": "akari media 0.1.x" },
  { "kind": "transcribe", "at": "…", "range": { "in": 120, "out": 180 }, "args": { "backend": "speech-analyzer", "lang": "ja" },
    "outputs": [], "tool": "…" },
  { "kind": "grab", "at": "…", "args": { "times_s": [0, 4.5, 11] }, "outputs": [ "../../reports/media/interview/grab-…/0f-11s.png" ], "tool": "…" }
]
```

- `observations[]` is **append only** (do not reorder and do not delete). It is the ledger of what was looked at, and when. It is the basis for an "not yet observed" mark in a report, and for where the next session starts.
- The write is atomic (tmp, then rename). Concurrent runs do not corrupt it. Keep existing unknown fields (lenient reader).

### 3.3 Promise on the report side

`analyze-project` and the analysis report draw from **what is in the ledger at that moment**. A missing chapter is honestly "not yet observed". Do not assume every chapter is filled. That duty belongs to a revision of `analyze-footage` and `analyze-project`, not to this contract.

## 4. Analysis levels and the default (the revision direction for `analyze-footage`. This contract defines the vocabulary)

| Level | What it looks at | Command | Which jobs need it |
|---|---|---|---|
| **L0 metadata** | Duration, resolution, whether audio exists | probe | All of them |
| **L1 sound** | Transcription, silence, beats | waveform, then transcribe or `internal beat-sync-beatmap` | Captions, talking footage, sound-first |
| **L2 picture** | Keyframes and a filmstrip (a person or a skill does the looking) | grab or filmstrip | Cut decisions, crops, B-roll selection |
| **L3 people** | person matte, face landmarks, hand pose | Existing sidecars (the vision-tracks contract) | Only the used span of footage that uses a person performance |

- **The default is L0 plus L1** (owner ruling 2026-08-29, "sound, at least, is fine to include"). The default L1 procedure is always `waveform` (it finishes in seconds), then `transcribe` only when `speech_likely` is true. Do not transcribe a B-roll PV that has no speech.
- L2 and L3 are decided by the job and by what was asked. A job shape is an **example**, not a closed list (intake does not have a "job type").
- Whatever level was used, the result goes to the ledger (§3).

## 5. Out of scope

- A command that "plays it" or "shows it" to a multimodal model (the external equivalent of `listen`). Judgment is the skill's job.
- A GUI (calling it from the shell's footage panel). Later.
- A batch of several footage items (`analyze-project`'s job).
- The finished frame of edit.json (the `capture` contract).

## 6. Acceptance conditions (the measure for the implementation task)

- The five commands return JSON as this contract says, on a fixture (`packages/schemas/fixtures/`, or a small mp4 or wav in akari-tools). stdout contains nothing but JSON, including through the launcher.
- The contact-sheet layout (frame count to grid, even split, and the size cap) has a **pure-function unit test**.
- waveform: on a synthetic wav (2 seconds of silence, 3 seconds of tone, 1 second of silence), `silences` lands in the expected span within ±1 frame.
- transcribe: the second run on the same file is a cache hit (`cache.hit: true`, and the backend does not start). If the backend is absent, exit 1.
- Ledger: an analysis.json produced by running `probe`, then `waveform`, then `transcribe` inside a project is valid against the canonical schema (and against the shell copy too, if the build generated one). `--no-record` changes nothing. Outside a project, do not create `.akari/`.
- Launcher: `akari media --help` lists the five subcommands. When akari-tools is absent, it shows how to install and exits 1.
- Existing tests (akari-launcher, akari-tools, schemas) are fully green.

## 7. Change history

- 2026-08-29. v0 draft (reflects the owner ruling on the internal decision note "make analysis pull-driven". The ruling itself stays in a private internal record).
- 2026-08-29. §3.2 and §6 corrected. The shell-side schema is an untracked build artifact, so only the one canonical file changes (measured on implementation lane `2026-08-29-media-inspect-cli`).
