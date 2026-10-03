**English** | [Japanese](./contract-2026-08-12-still-image-cut-source-v0.ja.md)

---
lifecycle: draft
created: 2026-08-12
updated: 2026-08-12
---

# Still-image cut source contract v0

> **How to read the title.** The `-v0` in the title is the revision of this contract document. It is not the edit.json schema `version`. This contract covers both `source.path` on edit v0 and `sources[].path` on edit v1. The vocabulary split is [contract-2026-07-17-data-contract-versioning.md](./contract-2026-07-17-data-contract-versioning.md) §5.

- Date: 2026-08-12
- Status: **draft** (fix it at the same time as the v0 implementation. A mismatch found in implementation is resolved by appending).
- Depends on:
  - `contract-2026-07-22-render-basics.md` (the remaining rulings for speed, freeze, framing, and transition_out on cuts[]. This contract extends the reach of speed and freeze to a still-image source).
  - The control-tower ruling equivalent to `contract-2026-08-10-image-layer-parity.md` (extension detection on `layers[].src`. This contract imports that onto `cuts[]`, the main timeline).
  - `contract-2026-08-02-preview-parity.md` (the principle of parity across render, Web UI, and shell. The conformance table this contract updates is §3 of that file).
  - `contract-2026-07-17-data-contract-versioning.md` (the three principles: integer version, append only, lenient reader).
- Scope: `cuts[]` in `edit.json` can read a still-image source (png, jpg, jpeg, webp, bmp, gif) directly on the main timeline. **Do not add a new schema field.** Detection is the extension only.
- Added 2026-08-31 (issue #30). The frame-engine path (`--engine gpu` or `osr`, and the v2 preview) draws with the same semantics. When the runtime registers footage as `CachedStillImageSource` by extension, `plan.ts` evaluates it as a base layer with `kind: 'image'` (`sourceTimeUs` is always 0, the duration is `out - in`, transform, crop, and keyframes match a video cut, and it can be the outgoing or incoming side of a transition). The compositor ties the same texture cache used by layers into the base RGBA path. Before that, `layerFromPlacement` accepted only a source that has `decode`, and it failed with `no video frame source registered` (an acceptance gap against legacy).

## 0. Background

Until now `cuts[]` assumed only "a video that has a timeline". To put an image on the timeline, the user had to join the images into one video first and then place that video in `edit.json` (reported on a real machine, 2026-08-12). The old reference implementation `akari-video-on-os` has run a still-image clip path in production since 2026-05-09 (`isStatic` flag, `-loop 1 -t <duration>`, and silent mix with `anullsrc`). The new implementation had missed that import. `layers[]` (PinP and B-roll layers) already gained extension-based still-image support in image-layer-parity on 2026-08-10. This contract imports that detection onto `cuts[]` on the main timeline.

## 1. Detection rule (control-tower ruling)

- **Detection is the extension only.** If v1 `sources[].path` or v0 `source.path` matches `/\.(png|jpe?g|webp|bmp|gif)$/i`, treat it as a still-image source.
- **Do not add** a new schema field such as `isStatic`. The shapes of `cutV0`, `cutV1`, `sourceV0`, and `sourceV1` in `edit.schema.json` stay unchanged. Only a `$comment` is appended.
- This regular expression is the same set as `IMAGE_LAYER_SOURCE_PATTERN` in `packages/render-cut/src/layers.mjs` (the earlier image-layer ruling). The detection logic itself lives in three places, separately. Do not import across packages. Each package must still build and typecheck alone. `packages/render-cut/src/plan.mjs` and `render-cut.mjs` are inside the same package, so they import `isImageLayerSource` from `layers.mjs` as it is.
  - `packages/render-cut/src/layers.mjs` (`isImageLayerSource`. Existing. This contract does not change it).
  - `packages/edit-lint/src/edit-lint.mjs` (`IMAGE_CUT_SOURCE_PATTERN`).
  - `packages/preview-engine/src/clipSession.ts` (`STILL_IMAGE_SOURCE_PATTERN`).
  - `packages/preview-server/src/edit-to-timeline.mjs` and `public/app.js` (the latter reuses the existing `IMAGE_LAYER_SRC_PATTERN` and `isImageLayerSrc` for cut detection too).

## 2. Render (render-cut)

### 2.1 ffmpeg recipe

A still-image input is turned into video with `-loop 1` (the same idea as the recipe the old reference implementation `akari-video-on-os` has run since 2026-05. The image background of `source.chroma_key.background` already uses the same `-loop 1` pattern in this repo). `-loop 1` only makes the image2 demuxer an infinite stream. The visible span is still decided by the existing `trim=start=<in>:end=<out>` filter. Every cut already passes through this trim, the same as a video source, so a separate still-image path was not needed. Do not set the frame rate explicitly. Ride the existing `fps=<output.fps>` normalization filter, which is already on every path for a video source too.

Three target paths, all in `packages/render-cut/src/plan.mjs`:

- `buildCutCommand` (the v0 default sequential-join path).
- `buildGapAwareCutCommand` (the v0 explicit at and track placement path).
- `buildMultiSourceCutCommand` (v1. It detects the extension per source, so video and stills may mix in `sources[]`).

### 2.2 Audio

A still image has no audio stream. `hasAudio` and `source.hasAudio` become `false` naturally because ffprobe finds no audio stream. **On all three paths, the existing "no audio source" branch fires as it is** (the branch that mixes silent stereo from `anullsrc`). That branch was not added for still images. It was already the default for a video source that has no audio track (a silent video). The ruling that a still span is silent and a video span keeps its original audio falls out of this existing branch.

### 2.3 Duration-probe exception

ffprobe does not report `format.duration` for a raw still-image file (the same when probed with `-loop 1`. Confirmed by measurement). `measureCapabilities` in `packages/render-cut/src/render-cut.mjs` used to reject that absence immediately as "ffprobe did not return a positive duration", so passing a still-image source always failed at the duration probe. Skip the duration positivity check for a still-image source only. Leave `sourceDuration` and `sourceInputs[].duration` as `null` (for the reason in §2.4, no path actually reads this `null`).

### 2.4 v0 "empty cuts means the whole source" does not hold

v0 historically has a shorthand: when `cuts` is an empty array, treat the whole source as one cut (`predictedDuration` returns `sourceDuration` as the duration). A still image has no notion of duration, so the shorthand does not hold. **If the source is a still image and `cuts` is empty, edit-lint stops with an error** (§3.3). `buildPlan` in `packages/render-cut/src/plan.mjs` also has a defensive backstop for the same condition (for a direct call that does not go through lint. The same posture as the `transition_out` backstop in `buildTrackStackPlan`).

## 3. Semantics of in, out, freeze, and speed (edit-lint checks them)

### 3.1 in and out

The visible duration of a still-image cut is `out - in`. A still image has no notion of "where inside the footage" `in` points, so **0 is recommended**. If a value other than 0 is set, the render still uses only the duration `out - in`. The value of `in` itself does not change the picture (it is used as the trim start offset, but every point inside an infinite loop looks the same). A value other than 0 makes edit-lint emit a **warning** (`cuts.still-image-in`).

### 3.2 freeze and speed

- `cuts[].freeze` is a visual no-op on a still image (adding "hold still" to a picture that is already still changes nothing). Only the duration grows by `freeze.duration_sec`. It runs (it does not crash), but the intent is easy to mix up, so edit-lint emits a **warning** (`cuts.still-image-freeze`). The message includes the alternative: to get the same longer duration, extend `out` directly.
- `cuts[].speed` likewise has no visual effect (a still image has no frame-step). It only rescales the visible duration to `(out - in) / speed`. It runs, and edit-lint emits a **warning** (`cuts.still-image-speed`).

### 3.3 Reject empty cuts on v0

When `source.path` is a still image and `cuts` is empty, edit-lint stops with an **error** (`cuts.still-image-cuts-required`) (§2.4).

### 3.4 Skip the duration probe

When `source.path` (v0) is a still image, edit-lint skips the `probeDuration` call itself (the same reason as §2.3. ffprobe does not return a duration. Without the skip, edit-lint itself dies with `ExecutionError` and cannot return a PASS or FAIL verdict). Record the reason in `skipped[]`.

## 4. Schema

A `$comment` was appended to `sourceV0` and `sourceV1` in `edit.schema.json` (a pointer to the detection rule and to the cut-side semantics). The structure of `cutV0` and `cutV1` is unchanged. A v1 valid example that mixes mp4 and png was added at `packages/schemas/examples/edit-cuts-still-image-source-valid/`.

## 5. Preview (Web UI)

### 5.1 preview-engine (revised 2026-08-28)

`packages/preview-engine` was deleted on 2026-08-28. The successor preview composite base is `packages/frame-engine`. The current preview implementation of a still-image cut takes §5.2 as canonical.

### 5.2 preview-server (the Web UI itself)

An `<img id="preview-image">` was added to `packages/preview-server/public/index.html`. It overlaps `<video id="preview-video">` at the same position and size (default `display: none`). When the current segment is a still image, `app.js` calls `pause()` on `<video>`, hides it, and shows `<img>` with `src` set to that segment's image (`showStillImageForSegment` and `showVideoBase`). Do not rebuild the `<video>` element. `MediaElementAudioSourceNode` is tied to the element that created it, so replacing the element breaks the audio graph. `playedCutLocalSeconds` (the elapsed seconds inside the cut, used to judge `framing` and `freeze`) is computed directly from the master clock `outputTime` during a still span, instead of from `video.currentTime` (the image does not seek, so `video.currentTime` does not update).

### 5.3 apps/shell (out of scope)

Preview support in the Electron shell itself (`apps/shell`) is out of scope for this task. image-layer-parity for `layers[]` also updated the shell webview at the same time, but the control-tower ruling for this task split the shell into a separate task. The shell column of the conformance table in §3 is recorded as not supported.

**Added (2026-08-17).** The split-out shell support was implemented in task/2026-08-17-shell-still-image-cut-preview. The method matches the Web UI (§5.2). Stack `#preview-still` (`<img>`) on `#preview-video`. The clock for a still segment shares the wall-clock origin used by a gap segment. Cut transform, framing, and selection drag mirror the video element's inline style every frame, so the existing rail is reused as it is. The still-image filmstrip on the timeline (akari-annotations) was also corrected in the same task. The `duration>0` guard in `probeForFilmstrip` had turned the existing isImage branch into dead code for a still image, because ffprobe does not report a duration (§2.3). Conformance is in §3 of the parity contract.

## 6. Conformance update

A `cuts[].static-image-source` row was added to the conformance table in `contract-2026-08-02-preview-parity.md` §3 (Web UI and shell columns).
