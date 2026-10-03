**English** | [Japanese](./contract-2026-08-02-preview-parity.ja.md)

# Engine v2 parity contract. Golden-frame acceptance

> **Revised 2026-08-28, v2.** This contract changed from comparing a separate draw implementation per surface to one frame-engine consumed by two containers and two exits. Only §4.3 covers the compatibility path. It is not part of the canonical spec.

## Revision history

| Date | Version | Contents |
|---|---|---|
| 2026-08-02 | v0 | Combined the behavior spec of the Web UI and the shell |
| 2026-08-28 | v2 | Unified onto the semantics of `packages/frame-engine`, and unified acceptance onto golden frames. Fixed the exits at two, OSR and GPU direct, and moved the compatibility path into the retirement section |
| 2026-08-31 | v2.1 | Appended to §5.2. Fragment CSS `vw` and `vh` units are resolved against the output size (`viewport-units.js`. A fix for a machine report that the preview resolved them against the window width) |
| 2026-09-02 | v2.2 | Appended the caption-clock rule to §2.8 (both previews judge the active cue in output seconds. Shared kernel `caption-clock`). Recorded the four points that aligned the Web UI with the shell (caption clock, caption font name, the `slot-params.js` insert, and the track rule for the bottom cut) |
| 2026-09-10 | v2.3 | Added to §5.8 the shell composite surface's internal resolution (auto, a manual scale, and 1x while stopped) and the tolerance for composition agreement |

## 1. Role split

### 1.1 Engine

The engine is only `packages/frame-engine`. It takes a declared edit, source, sidecar, and time `T`, and returns the finished frame at that time. One evaluation function, **`T` to frame**, is the canonical semantics. Do not copy cut, layer, transition, matte, LUT, freeze, framing, keyframe evaluation order, or the time mapping into a container.

Audio gets start, trim, loop, gain, fade, and the ducking span from the same deterministic schedule. The processing difference between immediate playback and the delivery master follows [v2 audio role split](./contract-2026-08-28-v2-audio-roles-v0.md).

### 1.2 Containers

There are two containers. A container loads input, owns the playback clock, seeks, calls frame-engine, presents the finished frame and the DOM overlay, and shows diagnostic values. That is the whole duty.

| Container | Body | Duty |
|---|---|---|
| Web UI | `packages/preview-server` | Interactive preview in the browser, scrub, edit operations, and presenting the frame-engine result |
| shell | `akari-preview` in `apps/shell` | Interactive preview in the Theia webview, scrub, edit operations, and presenting the same frame-engine result |

A container has no pixel semantics of its own. The difference between containers is the host, the input method, the UI chrome, and the transfer used when presenting a frame.

### 1.3 Exits

The exits are two. OSR in `packages/osr-export`, and GPU direct in `packages/gpu-export`. OSR captures, as a whole page, the frame-engine finished frame and an overlay sheet that uses the same DOM rules. GPU direct moves an eligible DOM layer onto a sprite on the engine canvas, and passes the finished canvas straight to a `VideoFrame` and WebCodecs. OSR page, stamp, and seek-paint are owned by [whole-page OSR export v0](./contract-2026-08-28-osr-export-v0.md). GPU eligibility, readback, and mux are owned by [GPU direct export v0](./contract-2026-08-28-gpu-export-v0.md).

## 2. Engine semantics

### 2.1 Cuts and time

`cuts[]` is evaluated as an output timeline that has resolved explicit `at` placement, track, source `in` and `out`, speed, and gap. If no cut is active at the requested time `T`, return the background. Overlap on the same track, stacking of different tracks, and the choice at a cut boundary are decided by the resolved timeline and z-order, not by declaration order.

**Acceptance.** Base parity **28 points**, layer parity **36 points**, and frame lifetime **1000 frames**, judged by raw frame `diff 0`.

### 2.2 Framing, transform, opacity, freeze, and keyframes

> **2026-09-22. Non-uniform scale v1.** `transform.scaleX` and `scaleY` are independent positive numbers. The effective value is `(scaleX ?? scale ?? 1, scaleY ?? scale ?? 1)`. A negative value and 0 are not allowed. `source.kind === 'group'` cannot specify per axis. The parent is always uniform. Composition with a uniform parent multiplies each of the child's effective values by the parent's `scale`, and the inverse divides by the same value. On write, if the two axes' effective values are equal, fold them into `scale`. An existing declaration of `scale` alone is not changed. Keyframes resolve the endpoints to each axis's effective value, then interpolate (mixing `scale` and `scaleX` is allowed). Overlay CSS is `translate(...) rotate(...) scale(sx, sy)`. Both an overlay and footage stretch on each axis and then rotate (`R*S`). Footage multiplies each axis into the crop width and height. A four-corner resize applies the same factor to both axes and keeps the aspect ratio.

- `framing.crop` windows the fitted frame and scales it back up to the output size.
- `framing.keyframes` and transform keyframes are evaluated in output seconds inside the cut, using the declared interpolation of hold, linear, or ease-in-out.
- `cuts[].transform` applies scale, rotate, and x / y around the output center. `opacity` multiplies the alpha before composite.
- Framing and transform fix their order in one evaluation graph. Do not leave the semantics to a container's CSS pivot or element box.
- For a v2 media item (what edit-store projects onto `cuts`), static `crop` and `transform`, `crop`, and `opacity` on `keyframes[]` are evaluated as **layer-style** (a box of source size times scale, a crop window, rotate around the box center. The same geometry as a layer in §2.3). The frame-engine base path draws that straight into GPU and OSR export (issue #39, 2026-09-01). `keyframes[].t` is the cut's output-local seconds (it keeps advancing during a freeze). A cut that has no `crop`, no `perspective`, and fewer than 2 `keyframes` stays byte-identical to the old fit basis. `perspective` is not applied on the base path yet, and a warning is emitted, `cut <id>: perspective is not applied by the frame-engine base path yet (issue #39)` (it is not dropped without a warning).
- `freeze = {at_sec, duration_sec}` holds the specified frame, extends the cut's output duration by `duration_sec`, and shifts the following sequential cuts. Do not confuse the freeze picture with the independent audio schedule.
- **`output.geometry` (the geometry basis. Appended 2026-09-02).** Unset means **fit compatible** (a cut is contain-fitted to the output, then transformed, as above). `"source"` means **source-size basis** (a box of source size times scale. The same geometry as a layer and a layer-style cut). The vocabulary is only `"source"`. The marker means "every media item that is currently drawn on the fit basis had `scale * fit` baked in once" (`fit = min(outputW / srcW, outputH / srcH)`, and srcW / srcH are after display rotation). A partial apply is forbidden. Migration is `packages/edit-store/bin/normalize-geometry.mjs`. x, y, and rotate mean the same thing on both bases, so they are not touched. **"Source size" is the original's logical size (after display rotation), not the decoded frame's pixel size (appended 2026-09-18).** Decoding a proxy does not move this basis. The ambiguity made a base cut's crop use the decoded frame, which is the proxy size, so the size basis disagreed with an added layer (bug note item 10. A 1920 by 1080 original and a 960 by 540 proxy, with crop width 0.5 and scale 1, became 480 by 540 instead of 960 by 1080). The frame-engine side uses the `NativeFrameSource.logicalSize` declaration as the basis, and falls back to the decoded size only when the declaration is absent or broken (`compositionSourceSize`). A caller that may decode a proxy therefore owns declaring `logicalSize` from the original metadata. Adding the declaration and removing the scale compensation that came with the proxy swap are **the same unit of work**, so the correction is not applied twice. **Under G1 (the marker, the migration, and lint warning `geometry.fit-compat`) the engine does not read this marker, and drawing does not change by one byte. Drawing picks it up at G2.** Cross ref: `docs/contract-2026-07-22-render-basics.md` §4-1 (item 6, framing operations).

**Acceptance.** Base parity **28 points** including framing, transform, opacity, and freeze. Frame lifetime **1000 frames** across a freeze. A negative point that must FAIL on a deliberate **1 px** difference.

### 2.3 Layers and keyframes

`layers[]` stack in z-order above the base and below captions and overlays. Source trim, loop, crop, transform, opacity, corner-pin perspective, and each keyframe are evaluated at the requested time `T`. The crop anchor, the four corners of perspective, and the bounding box after rotate are resolved in the same coordinate system inside frame-engine.

**Acceptance.** Layer parity **36 points**, judged by `diff 0`.

### 2.4 Transition

`dissolve`, `fade-black`, `fade-white`, `reveal-down`, and `reveal-up` between cuts evaluate the two source frames, before and after, at the same time during the transition span and composite them. The boundary, the progress ratio, the curve, the color plate, and the reveal direction are fixed in frame-engine semantics. Do not depend on a container, or on an ffmpeg-specific xfade pseudo-random sequence.

**Acceptance.** Transition parity **90 points** and transition semantics **30 points**, judged by `diff 0`.

### 2.5 Matte and chroma key

A person matte and a chroma key generate alpha for the source or the layer, and apply it at the fixed place after color correction and before stacking. The matte frame number comes from the same `T` as the finished picture. Do not reuse an async response or the previous frame. A DOM expression placed behind a person stays in sync with the same frame stamp as this alpha.

Alpha WebM and MOV are ingested at the container and exit input boundary into H.264 straight color and a `gray-h264-fullrange` mask. Only these two inputs are passed to frame-engine itself. Conversion of the same footage is idempotent, and concurrent calls join into one. On failure, omit that layer with a warning and continue evaluating the base. A compatible `<video>` and the legacy filtergraph are outside this conversion.

**Acceptance.** Matte parity **3 points or more**, and matte sync **300 frames with mismatches 0**. Compare the finished picture of the ingested alpha footage with the form split into color plus mask ahead of time, at 3 points or more. Require mean channel absolute difference **at most 1.0**, and p99.9 **at most 3**.

### 2.6 LUT and output look

`output.look` applies the LUT at a place that does not break chroma and alpha semantics. `intensity` is a linear mix of not applied and fully applied. Color conversion treats `bt709-limited` as canonical, and does not match legacy's conversion that treats untagged footage as bt601.

**Acceptance.** Look parity **20 points**, judged by `diff 0`. The color ruling's measurement is grounded in OSR §11.2. bt601 MAD **9.28** and maxDelta **155**. bt709 MAD **0.886**.

### 2.7 GOP, B frames, and the final frame

A seek decodes from the keyframe up to the target time, and reflects the presentation timestamp and the edit-list media time. Even with a negative DTS, a B-frame reorder delay, or the end of a GOP, do not return the previous frame or a frame 2 early. The end of a source handles both the declared duration and the last presentation frame that actually exists.

**Acceptance.** gopTail **9 points**. bFrame **160 rows** (summary **10**). bFrameTail **24 rows**. `test:seek` requestCount **94**. bFrame.rows **720** (coverage full). bFrameTail.rows **24**. finalFrameNumber **239**. lookahead hits **8**.

### 2.8 Captions

Captions normalize the active cue, style, safe area, and word timing of `captions.json` into one DOM rule. The Web UI and shell previews present them as a DOM layer. Export builds the overlay sheet from the same DOM rule. There is no container-specific caption HTML, and no exit-specific re-layout.

Line `style_vars` have a single kernel definition, `resolveCaptionLineStyleVars` and `mergeCaptionLineTextStyles` in `packages/edit-store/src/caption-display.ts`. The shell, the Web UI, render-cut, and `display_policy`, four surfaces, call the same functions. Stroke on the `display_policy` path also emits `-webkit-text-stroke` as `width_px * 2`, drawn with `paint-order: stroke fill` (ruling 2026-09-13).

Both previews judge the active cue in **output seconds**. A source-seconds cue (`time_domain: "source"`, and undeclared legacy) is projected to output seconds by `normalizeCaptionClock` in the shared kernel `packages/edit-store/src/caption-clock.ts`, using the cut map. A cue that crosses a deleted span is split one by one (`<id>-output-<n>`, and the original id is `sourceCueId`). The shell's `normalizePreviewCaptionClock` and the Web UI's `updateCaption` read this normalized table. The draw layer does not judge the domain (2026-09-02. Until then the Web UI judged in source seconds).

**Acceptance.** For two soft-draw OSR runs of the same fixture, require SHA-256 agreement of the raw BGRA of every frame, including captions.

### 2.9 Overlays

Free HTML, tables, graphs, and 2D or 3D expressions in `overlays[]` are evaluated with the same DOM rule and the same time stamp. They are a DOM layer on the Web UI and the shell, and an overlay sheet on OSR. Do not rebuild the DOM per active span. Update a page whose state is fixed, in a seek-safe way.

**Acceptance.** For two soft-draw OSR runs of the same fixture, require SHA-256 agreement of the raw BGRA of every frame, including the overlay sheet. GPU records the same-machine match rate as a diagnostic.

### 2.10 Audio

Start, trim, loop, gain, fade, and the ducking span come from the same deterministic schedule as the picture. A container plays immediately with Web Audio. An exit builds the delivery master with ffmpeg, including acrossfade, mix, `afftdn`, `loudnorm`, and a true-peak guard. A -12 dB rectangular duck and skipping master processing are declared approximations. Do not mix them into pixel parity.

**Acceptance.** 29 points of a 5 minute straight play, plus 30 seeks, 59 points in total. Maximum drift **16.667 ms**, p95 **6.666 ms**, cap **33 ms**. Loudness difference leaves the I, LRA, and TP of audio-roles §3.2, and the measured ducking, as diagnostics.

## 3. Conformance

Legend. `check` is a path of this contract. `partial` is a contracted approximation or a remaining machine issue. `n/a` is not this boundary's duty.

| Feature | Engine (`frame-engine`) | Web UI container (`preview-server`) | shell container (`akari-preview`) | OSR exit (`osr-export`) | GPU exit (`gpu-export`) |
|---|---|---|---|---|---|
| Time `T`, cuts, gap, track | check. Evaluates | check. Calls and presents | check. Calls and presents | check. Sequential drive | check. Sequential drive |
| framing / transform / opacity / freeze | check. Evaluates | check. Presents the finished frame | check. Presents the finished frame | check. Captures the finished frame | check. Canvas goes direct |
| layers / perspective / keyframes | check. Evaluates | check. Presents the finished frame | check. Presents the finished frame | check. Captures the finished frame | check. Canvas goes direct |
| crop / transform / opacity keyframes on cuts (v2 media item, layer-style) | check. Evaluates (2026-09-01) | partial. Waiting to regenerate `public/frame-engine.bundle.js` | check. DOM layer (`applyLayerStyleMediaLayout`) | check. Captures the finished frame | check. Canvas goes direct |
| perspective on cuts | partial. Not applied, warning only (issue #39) | partial. Same as the cell to the left | check. DOM layer | partial. Warning goes to run.json (seek warnings are collected) | partial. Warning goes to run.json |
| 5 transitions | check. Evaluates | check. Presents the finished frame | check. Presents the finished frame | check. Captures the finished frame | check. Canvas goes direct |
| matte / chroma key | check. Evaluates | check. Stamp sync | check. Stamp sync | check. Stamp sync and capture | check. Same-frame evaluation |
| Alpha-layer intake (`.webm` / `.mov` to color plus mask mp4) | n/a. Outside the input boundary (media-bin `alpha-intake` is canonical) | check. Server-side `prepareAlphaLayers` (`frameEngine.intake`) | check. Node RPC `prepareAlphaIntake` (the same media-bin and the same derivative, 2026-09-02) | check. page-builder | check. page-builder |
| LUT / `bt709-limited` | check. Evaluates | check. Presents | check. Presents | check. Captures and encodes | check. The canvas after the LUT goes direct |
| Captions | n/a. Supplies active state to the DOM rule | check. DOM layer | check. DOM layer | check. Overlay sheet of the same rule | partial. An eligible cue becomes a sprite |
| overlays / 3D | n/a. Supplies time to the DOM rule | check. DOM layer | check. DOM layer | check. Overlay sheet of the same rule | partial. Static and declarative 3D only |
| Audio schedule | check. Evaluates spans | partial. Web Audio approximation | partial. Web Audio approximation | check. ffmpeg delivery master | check. The same master after the carrier |
| Windows on a real machine | check. platform-neutral | n/a. Web browser | partial. Remaining machine issue | partial. Remaining machine issue | n/a. Unsupported in v0 |

Open items move to [engine v2 open items](./notes-2026-08-28-engine-v2-open-items.md). The canonical judgment of approximations is [engine v2 approximation ledger](./contract-2026-08-28-v2-approximation-ledger.md).

Field-level conformance is owned by `packages/schemas/engine-capabilities.json`, which `edit-lint --engine` reads.

## 4. Acceptance and retirement

### 4.1 Golden-frame acceptance

The engine's pixel acceptance is unified into `packages/frame-engine/test/golden`. Building a separate finished picture per container and comparing by eye is not used as pass or fail.

| Acceptance group | Points or measured value | Pass condition |
|---|---:|---|
| base parity | 28 points | preview and export raw frame `diff 0` |
| layer parity | 36 points | `diff 0` |
| matte parity | 3 points or more | `diff 0` |
| transition parity | 90 points | `diff 0` |
| transition semantics | 30 points | `diff 0` |
| look parity | 20 points | `diff 0` |
| GOP tail | 9 points | Matches the target presentation frame |
| B frame | 160 sampled rows, summary 10 | Matches the target presentation frame |
| B frame tail | 24 rows | Matches the final frame |
| frame lifetime | 1000 frames | Every frame completes, no stale frame |
| matte sync | 300 frames | mismatches 0 |
| negative | a deliberate 1 px difference | Must FAIL |
| `test:seek` | 94 requests, 720 B-frame rows, 24 tail rows | coverage full, finalFrameNumber 239, lookahead hits 8 |

### 4.2 Tolerance

| Boundary | Tolerance | Pass or fail |
|---|---|---|
| frame-engine golden | raw frame `diff 0` | Even 1 px fails |
| OSR soft draw | All-frame raw BGRA SHA-256 matches across 2 runs of the same input | Even 1 disagreeing frame fails |
| OSR GPU, same machine | Record the 2-run match rate, `differingPixels`, and `maxDelta` | byte-exact is a diagnostic, not pass or fail |
| OSR GPU, another machine | Record the platform difference, including the #14 Windows machine | A shared byte-exact is not required |
| GPU direct, engine span | per-frame MAD against the OSR decode comparison is at most 1.0 | Over the cap fails |
| GPU direct, captions | Lower-half MAD at 5 representative cue times is at most 1.0 | Over the cap fails |
| GPU direct, 3D | MAD on the 3D-active span is at most 1.0 | Over the cap fails |
| GPU direct, DOM layer | MAD inside the overlay bounding box is at most 1.0, at 5 representative times including t=0 | Any excess, or a sentinel mismatch, fails |

OSR comparison uses the raw BGRA captured at the time, not an image redecoded from H.264. Do not confuse soft-draw acceptance with GPU diagnostic values.

### 4.3 What stays of the compatibility path, and the retirement schedule

The `<video>`-based preview that remains in the Web UI and the shell, and render-cut's legacy composite path through the ffmpeg filtergraph,

> **Retired 2026-09-01.** The compatibility-period text below is a historical record. The current export exits are GPU and OSR only.

were a **compatibility-period leftover** to support existing users during the migration, and to support Windows. Neither is canonical for engine semantics or for the finished-picture spec.

- The two `<video>`-based compatibility previews are kept for **2 releases** after frame-engine becomes the default in each container.
- At the time, the plan was to keep legacy export as an explicit compatibility choice. It is abolished now.
- Legacy deletion (#100b) starts only when OSR PASSes on the #14 Windows machine, or when an owner ruling makes OSR the default on Windows too.
- Even before retirement, do not add new semantics to the compatibility path. Record the difference on the ledger. v2 pass or fail is decided by §4.1 and §4.2.

## 5. Container rules (outside engine semantics)

### 5.1 Caption DOM defaults

The look of captions and the line breaks are owned by the §2.8 caption DOM rule, shared by the containers and the overlay sheet.

- The edge is a real stroke, not a shadow. The default is `-webkit-text-stroke: 0.14em rgba(0,0,0,.9)` and `paint-order: stroke fill`. `text_style.stroke.width_px` is the **thickness that looks outside**, so the CSS stroke width is twice the specified value.
- The plate default is none, using `--plate-bg: transparent`. A background is drawn opt-in, only when it is specified.
- Treat `output.height > output.width` as portrait, and everything else as landscape, and pick the following defaults.

| Item | Landscape | Portrait |
|---|---:|---:|
| Font size | 38 px | `round(output.width * 0.06)` px |
| Character budget per line | 20 | 10 |
| A caption that becomes multiple lines with no specification | Show every line statically | If `words[]` exists, auto-promote to reveal. Otherwise show statically |

- Line breaks split on **an explicit newline, then immediately after `。` (except at the end of a line)**. Only when a span exceeds the character budget, pick a wrap candidate in this order. **Immediately after `、` (the rightmost one that stays inside the budget), then a space, then a phrase boundary, then the character cap.** If it fits the budget, keep it on one line even when it contains `、`. A split point in the middle of a word snaps to the nearest word boundary. Revised 2026-10-02. By owner instruction, stop letting `、` turn a short caption into two lines.
- An explicit specification of style, size, line count, display mode, and similar always wins over the defaults above.

### 5.2 Resolving overlays

If `overlays[].html` starts with `<`, it is inline HTML. Otherwise it resolves as a file path relative to the directory that holds `edit.json`. `vars` applies only keys that start with `--` as CSS custom properties on the overlay root. Other keys are not injected into the DOM or into JavaScript.

`vw`, `vh`, `vmin`, and `vmax` in fragment CSS (including prefixed forms such as `dvw`, and including `vi` and `vb`) resolve **against the output size** (`1vw` = `output.width / 100` px). Export draws the overlay sheet in a viewport that is exactly the output size, so the raw unit is already correct. A container preview fits the stage into the pane with `scale()`, so a raw `vw` would resolve against the window width. On mount, the container rewrites `<number><unit>` inside `<style>` and `style=""` through `packages/overlay-runtime/src/viewport-units.js` into `calc(<number> * var(--akari-vw, 1vw))`, and defines `--akari-vw` and the rest (output size / 100 px) on the stage element so they agree (2026-08-31. Shared by shell and Web. A prelude such as `@media`, a string, and `url()` are not rewritten).

### 5.3 Write path

Every write to `edit.json` or `captions.json`, whether it comes from the UI, an API, or RPC, passes the edit-lint gate. If the lint runner cannot be found, **fail-open** (owner ruling 2026-08-02). Show and record a warning, then continue the save. A write is an atomic update by writing a tmp file and renaming. The implementation is unified in `packages/edit-store`. Do not add a container-specific or entry-specific write implementation.

Writing back `crop` on a main cut (the edge bars of the selection frame) applies **only to an edit.json version 2 document**. The legacy `cuts[]` schema has no seat for it, so the load layer refuses it. On a document that does not declare `output.geometry`, a cut with no crop is drawn contain-fitted to the output canvas, so **the first crop and the same patch bake the fit factor into `transform.scale`** (so that moving to source-size layer-style does not change the on-screen position or size).

### 5.4 Pen

The single canonical source for pen drawing is `PEN_TUNING` and the draw primitives in `packages/pen-visuals`. A container or an overlay sheet must not own its own interpolation, thickness, opacity, or erase rule. The fade time is **600 ms** (owner ruling 2026-08-02).

### 5.5 Preview proxy spec

A preview proxy that frame-engine random-accesses is H.264 High Profile, 8-bit `yuv420p`, GOP of 1 second or less, no B frames, and faststart. The GOP uses the source's measured fps rounded to a frame count, and specifies `-g <fps> -keyint_min <fps> -sc_threshold 0 -bf 0`. After conversion, duration and frame count still match the source. A 29.97 fps GOP is 30 frames, which is 1.001 seconds, so the threshold for a machine check in doctor or lint is 1.05 seconds.

There are two generation paths, the shell's HEVC fallback and preview-server's HEVC proxy. Both use `packages/media-bin/src/proxy-recipe.mjs` as the only definition. Recipe version `gop1s-v1` is included in the shell's cache key and in preview-server's output name, so an old-spec cache is not reused on the next lookup.

### 5.6 Load budget, and the original versus proxy selection rule

frame-engine's source load budget, when `Content-Length` is available, is `max(10 seconds, bytes / 8 MiB per second)`. While receive progress continues past the budget, do not abort. Fail when progress stops for 5 seconds. A fetch of the same URL is once per session. A retry reuses the bytes already fetched and the parsed moov and keyframe index.

The default v2 preview selection is this order.

1. If a declared proxy exists, use the proxy (`declared`).
2. If there is no proxy, probe the codec. If `hw || any` can handle it, use the original (`hardware-ok` / `decoder-ok`).
3. If it cannot be handled, ask preview-server for an automatic proxy, and show a non-fatal notice while it generates (`auto-proxy`).

The Web UI's `?frameEngineSource=original`, or the shell's `AKARI_FRAME_ENGINE_SOURCE=original`, skips step 1 and goes to the container's capability judgment. `=proxy` prefers the proxy unconditionally, as before. `AKARI_FRAME_ENGINE_FORCE_SW=1` is a test switch that simulates hardware decode being unavailable. HEVC does not pass `prefer-software`, so ClipSessionPool does not learn a software fallback for a series whose codec probe returned `sw=false`. The software-fallback learner covers H.264 only.

Footage whose tkhd has a 90, 180, or 270 degree rotation does not, by default, rebake the decoder output onto an OffscreenCanvas every frame. frame-engine attaches the rotation metadata to the frame, and the compositor's UV inverse map applies the display rotation once. crop, framing, keyframe, and the existing transform and perspective use the logical space after rotation. At 90 and 270 degrees, the logical size swaps coded width and height. This rule is shared by the VideoFrame direct upload path and the copyTo path.

A decoder error is thrown as a window-wide event, so it cannot be told apart from another clip's failure. After detection, frame-engine waits `decoderErrorGraceMs` (default 1 second) for its own operation to succeed, and ignores that error if success arrives in time. The attempt fails only when prime returns no frame and an error was observed.

### 5.7 How a video source is read, and parity

Whether frame-engine reads an MP4 as a whole stream, or as an `ftyp` and `moov` index plus the compressed samples it needs by Range, does not affect finished-picture semantics. Both read paths must supply a VideoFrame at the same presentation time to the evaluation points of §4.1, and must meet golden `diff 0`, including `elst.media_time`, B-frame reorder, and the end of the media. A change in how the source is fetched is not an allowed reason for a parity difference.

### 5.8 Preview internal resolution (render scale)

The shell's frame-engine composite surface may use a per-side scale `s` in `{1, 0.5, 0.25}`. The vocabulary of setting `akari.preview.renderScale` is `'auto' | '1' | '0.5' | '0.25'`. The default is `'auto'`. The environment variable `AKARI_FRAME_ENGINE_RENDER_SCALE` beats the setting. An illegal value is `auto`. It is a setting only. There is no dedicated button or popup.

`auto` picks the smallest scale that satisfies `output.width * s` at least the display width and `output.height * s` at least the display height, against the display size of the canvas `getBoundingClientRect()` times `devicePixelRatio`. The cap is `1`. A display size of 0 is also `1`. Re-evaluate on the canvas `ResizeObserver` and on a change of `matchMedia('(resolution: <dpr>dppx)')`, debounced by 100 ms. The internal size is `roundEven(output size * s)` on each side (round to the nearest even, and round a tie up), with a floor of 2 px.

Under `auto`, 250 ms after playback stops or a scrub ends, redraw one frame at `s = 1`, and return to the scale that matches the display size when playback or scrub resumes. A manual scale stays fixed while stopped, and stopping does not draw an extra frame. A scale change updates the width and height of the shared `renderOutput` in place, the one the scheduler, the evaluation plan, and compose share. Do not rebuild the scheduler and throw away warmup. A size update while stopped is reflected as a one-frame redraw. The developerMode measurement panel shows scale, internal size, 1x size, and mode on one line.

Layer and layer-style cut geometry in the engine is in output px (box = crop times footage px times scale, output center plus (x, y)), so the shell projects the evaluation plan's px-basis transform (x / y, and a px-basis scale) by `s` before composing. The scale of an ordinary fit-basis cut, and normalized coordinates, stay unchanged. The input plan is not modified. `plan.output` keeps the shared reference. The engine, golden acceptance, and export are unchanged.

The agreement condition is **composition agreement, meaning position, size, time, and knob values agree**. The internal pixel count may differ. Extend the exception in [vgpu layer contract §4](./contract-2026-09-06-vgpu-layer-v0.md) to the whole shell composite surface. Compare an image that was drawn at 1x and then scaled down with an image drawn at the reduced scale, and require MAD **at most 2.0 / 255** from `packages/frame-engine/src/metrics/frame-diff.ts`. Grain-noise FX and the dissolve span are excluded from this comparison. The DOM layer (captions, overlay, 3D, pen), `summary.output`, `frameScale`, hit testing, the inspector, and the write-path rules are unchanged.

**Export and golden acceptance are always 1x, and they are outside this setting.** Do not change the GPU or OSR page-runtime, the export receipt, the golden and the tolerance of §4.1 and §4.2, or `packages/frame-engine` and its generated bundle. The Web UI composite surface, decode resolution, the vgpu-specific `previewScale`, and 3D `PREVIEW_3D_MAX_RENDER_SIZE` are also out of scope.
