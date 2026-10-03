**English** | [Japanese](./contract-2026-08-29-capture-v0.ja.md)

# `akari capture` contract v0. See the finished frame of the current edit.json without exporting

- Date: 2026-08-29
- Status: **v0 (owner ruling on 2026-08-29, not implemented yet).** A mismatch found in the implementation task is resolved by appending.
- Depends on:
  - `contract-2026-08-02-preview-parity.md` (preview and export agree. This contract adds a **third exit**).
  - `contract-2026-07-22-render-basics.md` (render-cut composite order and the limits of the ffmpeg implementation).
  - `contract-2026-07-25-project-structure-v0.md` (`.akari/reports/` is verification evidence).
  - `contract-2026-08-29-media-inspect-cli-v0.md` §1.1 (the shared contact-sheet spec).
- Scope: a CLI that returns a still of the **finished frame** composited at timeline time T from the project's `edit.json` (plus captions.json, overlays, layers, fx, and LUT). It does not handle audio.
- Sister contract: `contract-2026-08-29-media-inspect-cli-v0.md` (`akari media`, which looks at the footage itself).

## 0. Place in the system

**Make "this is how the output looks" checkable by a person and by an AI, without exporting.**

render-cut is the tool that makes the finished MP4, and it takes minutes to tens of minutes. Exporting the whole thing only to check the **stacked** result of captions, overlay, PiP, and FX is too heavy, and the agent had no way to show "the current cut looks like this" (`akari internal beat-sync-probe-frame` shoots the overlay layer only). `capture` takes a time and returns the finished frame. As a side use, one full-resolution frame from `--full` becomes **the source picture for a thumbnail, or footage to crop** (owner, 2026-08-29).

### The measure of agreement (the center of this contract)

**The frame `capture` returns is the frame export (render-cut) hands to the encoder.**

The preview-parity contract says the same input looks the same in either UI. This contract **adds capture as a third exit**. Preview, export, and capture return the same picture at the same time T. In engine v2 (the plan of one evaluator from "time T to a finished frame"), capture is that function's exit, and agreement is automatic by construction. v0 makes the agreement by running the same composite for one frame on the render-cut path (§3). After that, a difference between capture and export is a bug.

## 1. CLI

```
akari capture [-p <project>] (-t <time…> | --auto) [--separate] [--full] [--per-sheet <n>] [--out <dir>] [--edit <path>]
```

| Argument | Meaning |
|---|---|
| `-p <project>` | Project root (default: walk ancestors from cwd looking for `.akari/`) |
| `-t <time…>` | **Timeline seconds** (a time in the export result, not a source second). One or more. `MM:SS(.fff)` is also allowed |
| `--auto` | Derive the same representative times as render-cut, deterministically (`deriveContactSheetTimestamps`: the start, just after each cut boundary, the midpoint of each overlay or caption span, and the end). May be combined with `-t` (the union) |
| `--separate` | One PNG per time, 720p tall |
| `--full` | **One PNG per time at the output resolution (`output.width` by `height`)**. No burned-in label. sRGB. Opaque. For a thumbnail or a crop |
| `--per-sheet <n>` | Frames per sheet (1 to 12) |
| `--out <dir>` | Output directory (default `.akari/reports/capture/<stamp>/`) |
| `--edit <path>` | Composite something other than the default `<project>/edit.json` (for comparison) |

- stdout is JSON Lines (one image per line). stderr is for a person. Exit `0` and `1` follow the same rule as `akari media`.

```jsonc
{ "kind": "sheet", "timecode": "0f-11s", "times_s": [0, 4.5, 11], "path": ".akari/reports/capture/20260829T100000Z/0f-11s.png" }
{ "kind": "frame", "timecode": "04s15f", "time_s": 4.5, "path": ".akari/reports/capture/20260829T100000Z/04s15f-full.png", "width": 1920, "height": 1080 }
```

- Write one `capture.json` in the output directory. It holds every line above, plus `edit_sha256`, `captions_sha256`, the `sha256` of the footage used, `renderer` (`render-cut@<version>`, or later `engine-v2@…`), and `generated_at`. A later check can tell **which edit.json the picture was taken from**.
- The implementation is `packages/akari-tools/bin/capture.mjs` (the side that depends on render-cut and puppeteer). The launcher resolves it lazily from `capture-command.mjs` and starts a child process.

## 2. What is in the picture (everything render-cut composites at time T)

| Element | Treatment |
|---|---|
| Cuts (`cuts[]`) and the source map | Timeline second T to (`src`, source second) uses the same map as render-cut (`cut-timeline.mjs`). Freeze and duration stretch match too |
| Framing (crop, transform, perspective), layers, and keyframes | The same formulas as render-cut (`cut-framing`, `layer-keyframes`, `perspective-homography`) |
| Captions (captions.json), emphasis words, and karaoke | The state that should be visible at time T, with the same rasterization as export |
| Overlay HTML (overlays[]) | The same path as `renderOverlaySheet` and `captureWithPuppeteer`. Animation is **seek-synced** (CSS animation pause, plus `currentTime` set by hand) so the picture is the state at T |
| FX, LUT, transition, and mask | The same filters as render-cut. An FX that carries an approximation badge stays an approximation (the requirement is the same picture as export) |
| Audio | **Not handled** |
| An unsaved edit | Not handled. A timeline edit in the shell is captured after the shell saves `edit.json` (capturing the pre-save state is later) |

## 3. Implementation v0 (the render-cut path) and the seam to v2

- Cut a function out of render-cut that **returns one finished frame at time T** (for example `renderFrameAt({ plan, timeS, outputPath })` in `packages/render-cut/src/frame-at.mjs`). **Share** the composite order, the filter expressions, and the enable window (the half-open interval of `enableWindowExpr`) that the existing export path (`renderProject` to `rasterizeAndComposite`) already has. A single frame only applies `-ss <T>` and `-frames:v 1` to the same expression. **Do not keep the expression twice** (duplication is the bill the preview-parity contract already paid).
- For overlays, reuse what `probe-frame.mjs` already does: one frame of the same overlay sheet as production, at time T. Composite the footage frame, captions, overlay, and FX on the same filter chain.
- `renderFrameAt` is also **the seam to engine v2**. In v2, an implementation with the same signature is swapped for the GPU compositor, and capture, preview, and export call the same function.
- After this command is implemented, `akari internal beat-sync-probe-frame` **stays for one release of compatibility and then retires** (point the beat-sync-edit skill at `capture`).
- The contact sheet shares `contact-sheet.mjs` (`akari media` contract §1.1).

## 4. Acceptance of agreement (the core of the acceptance conditions)

- On a fixture (a small edit.json with 3 cuts, captions, 1 overlay, 1 layer, and 1 FX), **compare capture at the same T with a render-cut output frame**. The comparison target is taken from an intermediate of a render-cut run in a lossless or high-quality setting (ProRes 4444, `-crf 0`, or a PNG sequence. The task picks one and records it), so the lossy degradation of the export is left out.
- Pass line: mean absolute difference at most 2/255, and pixels that hold the maximum difference are under 0.1 percent (allow a sub-pixel rasterization difference). A larger difference is a **bug**. Find the cause and fix it, or append it to this contract as a known difference (the same style as preview-parity §2.4).
- Two captures of the same input are **byte-identical** (determinism).
- The time list from `--auto` matches `contact_sheet.timestamps_seconds` in render-cut's `render.json`.

## 5. Relation to the ledger

- capture observes the **edit (edit.json)**, not the **footage**, so it does not write the footage ledger (analysis.json). The record lives in `capture.json` (§1) and in the report of the skill that called it (for example `critique.md` from `critique-cut`).
- `.akari/reports/capture/` is verification evidence (project-structure v0 §1). It can be regenerated, but it is not deleted automatically (the same treatment as a render report).

## 6. Out of scope

- Export of audio or of a video clip (render-cut's job).
- A "capture this time" button in the shell (later. The CLI comes first).
- Capturing an unsaved edit.
- Agreement with the preview side (Web UI or shell) is left to the existing preview-parity procedure. What this contract accepts is capture equals export.

## 7. Acceptance conditions (the measure for the implementation task)

- `akari capture -t 0 4.5 11` returns one 3-frame sheet and `capture.json` on the fixture, and stdout is JSON Lines only.
- `--separate`, `--full`, `--per-sheet`, `--auto`, and `--edit` each behave as this contract says.
- The agreement check in §4 exists as a test and is fully green (the comparison method and the tolerance are written in the test).
- `renderFrameAt` is also called from render-cut itself, and the composite expression is defined in one place for the export path and the capture path (a grep shows no new assembly of an enable expression other than `enableWindowExpr`).
- The existing render-cut tests (on the order of 295) are fully green, and the export artifact does not change (SHA-256 of existing fixtures is unchanged).
- Launcher: `akari capture --help`, the guidance when akari-tools is absent, and the guidance when Chrome is absent (reuse the existing message from `findChromePath`).

## 9. v1 revision (2026-08-30). Move onto the v2 path

> **Current state (2026-09-27).** The legacy branch and the non-macOS fallback below are the design record of that time. Export today has `auto` choose GPU or OSR by GPU eligibility on every OS, and `--engine legacy` is rejected.

### 9.1 Why revise (settled facts)

- The v0 implementation has `packages/akari-tools/src/capture/run.mjs` call `renderProject(…, { engine: "legacy" })` as a **fixed** engine. `packages/render-cut/src/frame-at.mjs` runs `plan.commands` of the old ffmpeg filter graph from the start through the target frame (the overlay stage shoots every frame from 0 through T with `captureWithPuppeteer`). **It does not go through v2 (osr or gpu).**
- On 2026-08-28, #90 made **v2 the default export** (`resolveEngineChoice("auto")` is direct GPU on macOS when eligible, otherwise OSR, and legacy off macOS). The measure in §0, "capture equals export", loses its meaning unless it is taken again against the default export, which is v2.
- On a real job (v2, with tracks, a Three.js overlay, 11 seconds) v0 took **18 minutes 50 seconds** (98.7 percent of one critique-cut pass). That fights the §0 purpose, "look without exporting".

### 9.2 v1 spec (the delta against §1 through §7. An item not written here stays v0)

- Add **`--engine auto|osr|gpu|legacy`** (default `auto`). Resolution uses render-cut's `resolveEngineChoice` and the GPU eligibility check **as the same functions**, and it always lands on the same engine as export's `auto`. capture does not pick an engine different from export.
- **The v2 path builds the same page as export, evaluates only frame N, and makes one picture. It does not run 0 through N.**
  - The page is the same one render-cut passes to `exportWithOsr` or `exportWithGpu` (`page-builder` input is edit, captions, overlays, width, height, and fps).
  - osr runs the frame loop in `osr-export/src/electron-main.mjs` (seek, then capturePaint, then verifyStamp, then write) **once, for frame N only**, and writes the bitmap after `stripStampRow` to PNG without encoding. Do not skip verify (stamp match means N).
  - gpu does a one-shot evaluation of frame N in the `gpu-export` page runtime (one `evaluateFrame` in frame-engine), then a readback (`frame-engine/src/exits/readback.ts`), then PNG. Caption sprites, HTML-in-canvas, and 3D go through the same path as export (if ineligible, `auto` falls through to osr, the same as export).
  - For several times, start the page once and evaluate N in order. Do not start Chrome or Electron per time.
- **The legacy path (frame-at.mjs) is only for an explicit `--engine legacy` and for the non-macOS fallback.** Do not delete it.
- **`capture.json`** records `engine` (requested, resolved, and fallback) and `renderer` (`osr-export@<version>`, `gpu-export@<version>`, or `render-cut@<version>`). The receipt shows that **the same page and the same runtime were used** (copy the stamp and verify result from the osr or gpu receipt).
- **Replace the contact sheet with `renderLabeledContactSheet` in `contact-sheet.mjs`** (media contract §1.1, at most 2576 by 1456). Retire the v0-only tiler (one frame fixed at 720p, no cap, so 4 by 3 became 5120 by 2160).
- Performance target (acceptance): on the v2 field-test job (internal repo `fieldtest/2026-08-29-critique-cut-v2`, 11 seconds, 1080p, 2 HTML overlays including Three.js, captions, and a LUT), **one frame is at most 10 seconds, and three frames are at most 20 seconds**, including page startup. It **does not scale with duration** (doubling that job's duration stays within ±2 seconds).

### 9.3 The measure of agreement (v1)

- **capture(engine, N) equals frame N of an export on the same engine.**
  **The primary bar (revised 2026-08-30) is a lossless comparison.** Compare the **raw frame immediately before export hands it to the encoder** (for osr, BGRA after `stripStampRow`, which `AKARI_OSR_DUMP_FRAMES` can dump) with the capture PNG. Require **MAD 0, maxDelta 0, and 0 percent differing pixels** (a bit match). That is the §0 measure itself.
- **A reference value is the comparison taken from an mp4.** A comparison that pulls frame N from an mp4 exported with the same `--engine` includes H.264 4:2:0 coding loss, so it is **not a pass or fail bar** (measured: on a color-bar footage at maximum saturation, the overlay rectangle is MAD 2.9 to 3.5 and the full frame is 1.1 to 1.7 from coding loss alone. The lossless comparison is MAD 0 at the same time). Put it in the report as a reference.
- While the gpu side has no raw-frame dump, a substitute of three points is allowed. (1) MAD taken from the mp4 is in the same range as osr. (2) Two passes are byte-identical. (3) A frame with no overlay matches the SHA of an osr capture. Adding a dump mechanism is a separate ticket.
- **Structural proof of identity.** Show in code that capture and export go through the **same page-builder, the same page runtime, and the same verify** (capture has no composite expression of its own and no page of its own). A grep shows capture does not reference `plan.commands` except on the legacy path.
- Determinism: two captures of the same input are byte-identical. osr may differ by GPU dependence, so it follows the existing osr determinism bar (SHA of two hardware passes).

### 9.4 Out of scope

- New page-runtime features (how far captions, HTML, and 3D reach is decided by the #120b through #120f contracts. capture only rides them).
- Changing GPU eligibility.
- A screenshot feature from preview (shell or Web UI). In engine v2 it is the same function, so it is not needed.
- Speeding up the v0 legacy path (`--engine legacy` stays as it is).

## 8. Change history

- 2026-08-30 (the second change that day). §9.3 revises the agreement bar. The primary bar is a lossless comparison (a bit match with the raw frame at the encoder input). MAD at most 1.0 taken from an mp4 does not function, because of coding loss, so it becomes a reference value (measured on implementation lane `2026-08-30-capture-v2-engine`).
- 2026-08-30. §9 v1 revision. Move onto the v2 path (a one-shot evaluation of frame N in the osr or gpu page runtime). Record the fact that v0 was fixed to legacy, and the 18m50s on a real job. The sheet moves to the shared function from media.
- 2026-08-29. v0 draft (reflects the owner ruling "I want to check the stacked finished picture without calling render-cut" and "for thumbnails too". The history of the ruling stays in a private internal record).
