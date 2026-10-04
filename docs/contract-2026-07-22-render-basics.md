**English** | [日本語](./contract-2026-07-22-render-basics.ja.md)

# Render basics contract

Speed, chroma-key background replacement, basic transitions, LUT, audio master, framing, and freeze.

> End note, 2026-09-01. ffmpeg filter-graph compositing was retired in #130d. The ffmpeg implementation text below stays as a reference record.

- Date: 2026-07-22. Added 2026-08-06: section 6 framing and section 7 freeze. Added 2026-08-09: the generalization onto `layers[].keyframes` in section 4-4.
- Status: draft. It becomes approved as implementation proceeds. This document is the technical spec only. The reasoning and the lane operations stay in private internal records. This repo does not hold them.
- Depends on: `contract-2026-07-17-data-contract-versioning.md` (the three principles), `contract-2026-07-13-m1-m4.md` (the edit.json source of truth), and `contract-2026-07-14-edit-json-v1-audio.md` (the audio schema).
- Governing rule. Done means it appears in the output file. Every item takes a machine check of a real rendered output as its acceptance condition. Do not ship a spec first and then let the backend drop the feature silently. Deliver the schema, the implementation, lint, and output verification together.

## 1. Scope

Seven features. Each one connects straight to ffmpeg.

| # | Feature | edit.json extension (additive only) | ffmpeg implementation | Output check |
|---|---|---|---|---|
| 1 | Constant speed change (faster or slower, per clip) | `cuts[].speed` (number, default 1.0). v0 is constant speed only. A ramp is later. | `setpts` plus `atempo` (chained when faster than 2x or slower than 0.5x) | Output duration matches the theoretical value (ffprobe). One listen for pitch and sync. |
| 2 | Chroma-key background replacement | `source.chroma_key`: `{color, similarity, blend, background}` where background is a color or an image or video path | `chromakey` or `colorkey`, plus `overlay` of the background input | On a green-background fixture, pixel samples show that the background was replaced. |
| 3 | Basic transitions | `cuts[].transition_out`: `{type: dissolve, fade-black, fade-white, reveal-down, or reveal-up, duration}` | `xfade`, and only on a cut boundary that declares a transition. Reveal uses ffmpeg `revealdown` or `revealup`. | Frame extraction shows a real mid-blend at the boundary. A boundary with no declaration stays a hard cut. Reveal does not mix colors, so measure the top half and the bottom half of a mid-transition frame separately and confirm that the previous cut and the next cut are both present. |
| 4 | Color look (LUT) | `output.look`: `{lut` (a preset reference or a path), `intensity}` | `lut3d`. Intensity also uses `blend`. | Pixel difference between two output frames, with and without the LUT. Preset table in `presets/luts/`. Start with 2 or 3 files. Moved from `catalog/luts/` on 2026-07-29. |
| 5 | Audio master | `audio.master`: `{denoise` (`off`, `std`, or `strong`), `loudnorm` (target LUFS, default -14)} | `afftdn` and `loudnorm`. v0 allows one pass, not two. | Measured output loudness (ffmpeg ebur128) is within 1 LU of the target. |
| 6 | Framing (static crop, zoom keyframes, stepped shrink) | `cuts[].framing`: `{crop?: {x,y,w,h}` (0 to 1, relative to the output, static), `keyframes?: [{t, scale, cx?, cy?}]` (`t` is seconds inside the cut, linear interpolation. Two points zoom. Three or more step the shrink. `cx` and `cy` default to 0.5 when omitted)} | Fit the frame to the output canvas, cut a window with `crop`, and scale it back up (a punch-in). A static `crop` has constant `w`, `h`, `x`, and `y`. For a zoom, this ffmpeg build evaluates `crop` `w` and `h` only once at init, so widen `scale` by `scale(t)` with `eval=frame`, keep `crop` at a fixed `w=width:h=height`, and drive only `x` and `y` as functions of `t`. Detail is in section 4-1. | A static crop is measured on output-frame pixels and matches the declared crop position. For a zoom, the scale inferred from the measured size of a visible element at the start, middle, and end frames matches the linear-interpolation theory within 5 percent. Three keyframes show two shrink steps in extracted frames. |
| 7 | Freeze (hold the video) | `cuts[].freeze`: `{at_sec, duration_sec}`. `at_sec` is seconds inside the cut, and the frame holds there. The cut grows by the hold. Content is not removed. | Split with `trim`, then `tpad` (`stop_mode=clone`), then `concat`. A hold at the start of the cut (`at_sec` is 0) does not use `tpad` `start_mode=clone`. On this machine's ffmpeg, that mode plus a downstream `fps` filter drops the last frame. Confirmed on a real render. Instead, take a one-frame seed with a frame-index trim (`start_frame=0:end_frame=1`), stretch it with `stop_mode=clone`, and concat it at the front. Detail is in section 4-2. Audio in that span is silence (`anullsrc`). Do not continue the previous sound. Detail is in section 4-3. | Two frames inside the hold match pixel for pixel, measured with a lossless encode. Output duration equals the original duration plus `duration_sec` (ffprobe). Audio in the hold is silent (`silencedetect` and `volumedetect`). |

Left out, and sent to a later stage: blend modes, picture-in-picture, and a pre-rendered composite rail. Those need a layer mechanism first.

Current state (2026-09-05). The ffmpeg `lut3d` path has been removed. `output.look` is applied by the frame-engine final pass (WebGL2 LUT) on both the gpu and osr exits. Per-clip color correction is applied by the same engine in the order in section 4 of `contract-2026-09-03-clip-adjust-v0.md` (Japanese): item adjust, then composite, then look.

## 2. Rules that apply to every feature

1. The schema is additive only. Every existing edit.json stays valid with no edit. Update validate-edit, edit-lint, fixtures, and tests in the same change.
2. Preview (the successor frame-engine; `packages/preview-engine` was deleted on 2026-08-28) does not need an approximation in v0. Ignoring the feature is allowed. Output comes first. Apply the rule "preview is the approximation, export is exact" to every item. Preview catch-up is another contract.
3. `output.look` (the LUT in item 4) applies only to the main picture in `cuts[]`. It does not apply to `layers[]` (picture-in-picture, a person matte, B-roll) or to `overlays[]`. When stacked footage should match the main picture's color, declare the same `id` and `intensity` explicitly on `layers[].filter` (`{type:"lut", id, intensity}`). The source of truth is section 4 of `contract-2026-08-12-region-filter-layer-v0.md` (Japanese). A real miss on 2026-08-14, during a reel: only the main picture got `cinematic`, the stacked person cutout stayed at its raw color, and skin color disagreed at the window seam. This is easy to misread as "the color of the whole project", so it is written here.
4. Export engine default, revised 2026-08-28. When `--engine` is omitted, the value is `auto`. On every platform, resolve to GPU when the machine qualifies, and to OSR when it does not. `legacy` is retired.

### 2-4. Reveal transitions

`reveal-down` and `reveal-up`. Added 2026-08-14.

The previous cut moves entirely in that direction and leaves the frame. The next cut appears from the side that opened. The previous cut is cropped at the frame edge while it moves. It does not mix the way a dissolve does, so a talk scene that keeps the same composition still reads as a scene change. That is why it was adopted. Owner direction on 2026-08-14: it is required as a basic template transition.

- `reveal-down`. The previous cut moves down. The next cut comes in from the top of the frame.
- `reveal-up`. The previous cut leaves through the top. The next cut comes in from the bottom of the frame.
- Measured at 64 by 64, 10 fps, duration 1 second, mid-transition at t = 2.5 seconds. For `reveal-down`, the top half is RGB(0, 0, 253), the next cut, and the bottom half is RGB(252, 0, 0), the previous cut. `reveal-up` swaps those halves.
- As with the other xfade transitions, the timeline shrinks by the overlap, `duration` seconds per boundary. In a project that places `layers[]`, `overlays[]`, or `audio.sfx[]` by hand in timeline seconds, adding a transition shifts every later placement. Captions are written as `(src, source seconds)`, so the engine follows them. Hand-placed elements have to be redrawn. If the duration must not change, express the change as an overlay instead of a transition (bake the last frame of the previous cut and move it). That escape makes a still, and it needs a project-specific bake, so it is not the default.

## 3. Decisions still open

1. Whether keeping pitch on `speed` (`atempo` keeps pitch) is the default, or whether there is also an option that lets pitch change.
2. What the first LUT catalog contains.
3. How far the render-cut concat structure is rebuilt for the xfade move. v0 is only boundaries that declare a transition, or everything becomes xfade.

## 4. Implementation decisions for items 6 and 7

Added 2026-08-06. Framing and freeze.

### 4-1. Framing (`cuts[].framing`)

- Crop and keyframes together. When both are declared, `keyframes` wins. `crop` is the degenerate form of a one-point zoom. There is no meaning in which both apply, and keeping both is a place for copies to drift.
- Geometry basis. Added 2026-09-02, a cross-reference. `output.geometry` omitted means fit-compatible. `"source"` is a marker for actual-size basis. The source of truth is section 2.2 of `contract-2026-08-02-preview-parity.md` (Japanese). G1 does not change drawing. Redefining framing is G2.
- `scale` below 1. `keyframes[].scale` works by shrinking the crop window and enlarging it, so a value below 1 (showing past the canvas, a reveal) cannot be expressed. The renderer clamps with `max(1, scale)`. This is not a silent drop. The contract states it as a limit of the mechanism.
- `crop` `w` and `h` are evaluated only once at init. ffmpeg's `crop` filter re-evaluates `x` and `y` every frame when they use `t`, but on this ffmpeg build `w` and `h` are fixed to the one evaluation at filter init. There is no `eval` option. A real render confirmed that a `w` or `h` expression containing `t` returns `Error when evaluating the expression` for `crop=... w='...t...'`. The implementation therefore widens `scale` with `eval=frame` to `width*scale(t) : height*scale(t)`, then crops at the fixed size `width:height`. Widening the crop window is the time function on `scale`. Pan position is the time function on `crop` `x` and `y`.
- `crop` `x` and `y` do not look at the real size of the upstream frame. The same filter's `iw` and `ih` constants point at the negotiated fixed link size, even when the upstream size is dynamic, and they stay fixed at the first frame's size. A real render confirmed that. So the `x` and `y` expressions do not refer to `iw` or `ih`. They recompute the same `scale(t)` expression the `scale` side uses. The two sides match, and that recomputation is the only current value that is correct from `crop`'s point of view.
- Left-right flicker during a zoom, fixed. Added 2026-08-06 after an owner saw it on a real render (`ws:framing-zoom-flicker`). On ffmpeg, `crop` `x` and `y` can only be integer pixel positions. A continuously changing `scale(t)` is quantized to 1 px steps every frame. The difference between that staircase and the smooth path shows up as a left-right snap on a fine repeating pattern. A checkerboard fixture confirmed it. The original implementation reversed direction between consecutive frames 78 percent of the time, and the residual standard deviation from the smooth trend was 0.51 px. Changing the `scale` flag from `bilinear` to `lanczos` did nothing. It changes interpolation quality of the values, not the position precision of `crop`. What worked was supersampling. Compute the zoom for `cuts[].framing.keyframes` at twice the canvas resolution (`SUPERSAMPLE=2`), then scale down to the real resolution with a high-quality filter. The 1 px quantization step of `crop` becomes half an output pixel, so the flicker shrinks. On the same fixture, standard deviation went from 0.51 px to 0.26 px, and the consecutive-frame reversal rate went from 78 percent to 41 percent, about a 48 percent improvement on both. The expression for "the size after the current enlargement", which both `scale` and `crop` read, was also unified on even rounding (`trunc(x/2)*2`). That closes the case where the integer size `scale` actually outputs and the size `crop` assumes disagree on some frames, which fired an implicit clamp inside `crop`. A static `crop` (`framing.crop`, a one-point window, not a zoom) does not change with time, so it is out of this fix and unchanged.

### 4-2. Freeze (`cuts[].freeze`)

Limits of the ffmpeg implementation.

- Do not use `tpad` `start_mode=clone`. Implementing a hold at the start of a cut (`at_sec` is 0) as `tpad=start_mode=clone:start_duration=X` drops the last output frame whenever any later `fps` filter is in the chain, including another pass of this feature. Confirmed on a real render of this ffmpeg build. `stop_mode=clone` does not have the same bug. That was also confirmed. Instead, `split` a copy of the full-range trim, cut one side to one frame with `trim=start_frame=0:end_frame=1` (frame numbers, so it does not depend on fps), stretch it with `stop_mode=clone` and `stop=<frame count minus 1>` (an integer frame count, not the time-based `stop_duration`), and concat it onto the original full range.
- Audio during a freeze is inserted silence. Do not continue or loop the direct sound. Looping the previous sound clicks at the loop boundary, because the PCM join is not at a zero crossing. Inserted silence is deterministic and has no glitch. Narration, BGM, and sound effects are placed independently at absolute seconds on the output timeline, the same premise as `cuts[].speed`, so they are not shifted automatically when a freeze lengthens the cut.
- v0 cannot be combined with a gap-aware timeline (explicit `at` and `track`). The gap-aware path (`computeVideoRuns`) maps output seconds to source seconds with a linear formula that assumes only a speed coefficient. A nonlinear hold from a freeze breaks that map. When `cuts[].freeze` is declared and the gap-aware test (`needsGapAwareCutTimeline`) is true, render-cut throws and stops. It does not ignore the feature quietly, which matches the rule against a silent drop. Freeze works only on the default sequential timeline.
- v1, added 2026-08-18, has the same limit. `contract-2026-08-18-v1-render-parity.md` (Japanese) added a gap-aware timeline (`buildGapAwareMultiSourceCutCommand`) to v1 `buildMultiSourceCutCommand` for `sources[]`. The reason is exactly the v0 reason. The linear map in `computeVideoRuns` cannot express a freeze. The combination of `cuts[].freeze` and explicit `at` or `track` stops with the same exception on v1.

### 4-3. Preview disagreement

Framing (`cuts[].framing`) and freeze (`cuts[].freeze`) are implemented only in the renderer (items 6 and 7 of this contract). The web UI and the shell preview do not follow them yet. The compatibility table in `contract-2026-08-02-preview-parity.md` (Japanese) says so.

### 4-4. Generalizing transform keyframes

`layers[].keyframes`. Added 2026-08-09.

The shape that `cuts[].framing.keyframes` established (item 6, section 4-1), an array of partial state with a time, linear interpolation, and hold before and after, was generalized as `layers[].keyframes`, a shared mechanism for the transforms on `layers[]` (picture-in-picture): `transform.x`, `y`, `scale`, and `rotate`, plus `crop` and `perspective`. Owner direction on 2026-08-09. Do not build a mechanism that exists only for perspective. `layers[]` is not in the scope table in section 1. The contracts for `layers[].crop` and `layers[].perspective` themselves have their source of truth in sections 2.4.1 and 2.4.4 of `contract-2026-08-02-preview-parity.md` (Japanese). Apply order, interpolation rules, the ffmpeg implementation (the `eval=frame` piecewise-linear form, the anisotropic scale-up then crop-down technique for crop, and the layer-split fallback for perspective), and the preview reproduction are all written in section 2.4.7 of that contract. This file does not repeat them. The source of truth is one place. Perspective has the same "not evaluated per frame" limit as `crop` `w` and `h`, but the ffmpeg side has no time variable at all, so even that technique cannot be used and the path falls back to splitting the layer. That is the difference from crop and framing.

- Fixed canvas for layer enlargement and crop. Added 2026-08-24. For `layers[].keyframes` with a normal blend and no perspective or rotate, stop changing the footage's integer bitmap size every frame from `transform.scale` and stop centering that variable `overlay_w` and `overlay_h`. Interpolate scale and crop inside a fixed grid at twice the footage's native size (`LAYER_KEYFRAME_SUPERSAMPLE=2`), place the result at even coordinates on a fixed transparent canvas of the maximum footprint, crop that fixed canvas, then scale down to the real size with Lanczos. The overlay's outer size is then the same on every frame. The plus or minus 1 px oscillation of the center coordinate, caused by the enlarged size flipping between even and odd, goes away, while the picture-in-picture footprint itself still grows and shrinks continuously inside the fixed grid. The factor matches `SUPERSAMPLE=2` in `cut-framing.mjs`, but the two builders are independent. One is output-relative framing. The other is a layer relative to the footage's native size. The constants are not shared, so the implementation modules do not depend on each other in reverse. A filter string with no keyframes does not change. Perspective uses the bitmap outline as the basis of the four corners. Rotate, and a blend that is not normal, cannot rule out a change to the existing meaning if the outline is fixed. Those combinations keep the previous compatible path.
- Fixed canvas for main-picture cut enlargement and crop. Added 2026-08-25. `transform.scale` and crop keyframes that were converted from a v2 main-picture track into gap-aware cuts use the same `layerFixedCanvasKeyframeSteps` as the layer path. Only when the blend is normal, perspective is not declared, and rotate is 0 both as a static value and in keyframes: interpolate on a grid at twice the footage's native size, place at even coordinates on a fixed transparent canvas of the maximum footprint, then scale down to the real size with Lanczos. That removes the combination of a bitmap size that changes every frame and a centered overlay, and it prevents the plus or minus 1 px oscillation from the enlarged size flipping between even and odd. Perspective, rotate, and a blend that is not normal keep the previous compatible path. A cut with no keyframes does not change its filter string.
- Added condition for rotate. 2026-08-25. The phrase above, "rotate is 0 both as a static value and in keyframes", is read as whether a rotate step actually appears in the downstream filter. Apply the fixed canvas only when `rotateConstant === 0`. Even when a static `transform.rotate` is not 0, a keyframe that declares `transform` resolves rotate to the keyframe default of 0, no rotate step appears, and the cut is in scope. The drawing meaning of rotate does not change. This matches the guard of the same name in `layers.mjs`. A static rotate that is not 0 with no transform keyframe, a keyframe rotate that is not 0, and a rotate that changes over time all emit a rotate step, so they keep the previous compatible path.

## 5. Reference record of the retired browser rasterizer

Ended 2026-09-01.

- On macOS, do not start the Chrome executable inside the `.app` directly as a child process. Create a unique `user-data-dir` for export, and start a new instance through LaunchServices with `/usr/bin/open -na <Chrome.app> --args`.
- Start with `--remote-debugging-port=0`, wait with a timeout for `DevToolsActivePort` in the dedicated profile, then `puppeteer.connect()`. The ordinary numbered-PNG path and the still-image path use the same start, connect, and shutdown layer. Linux and Windows start the executable directly with `puppeteer.launch()` inside the shared layer.
- Whether the run succeeded or failed, close a connected Chrome with the CDP equivalent of `Browser.close`, and delete the dedicated profile. The macOS shutdown does not guess a PID and does not depend on a wide `kill`.
- If Chrome is missing, if the executable is not a `.app`, or if waiting for `DevToolsActivePort` or connecting fails, say in Japanese that the browser for caption rendering failed to start and that Chrome should be checked, and stop the export with a non-zero status. Do not fall back to a simpler caption style.

## 6. H.264 encoder choice

Added 2026-08-28.

`--encoder` is one of `auto`, `videotoolbox`, `nvenc`, `qsv`, `amf`, `mf`, or `x264`. `master` quality is x264 only. An explicit hardware encoder is rejected.

| Value | ffmpeg encoder | Where it runs, and how quality is controlled |
|---|---|---|
| `videotoolbox` | `h264_videotoolbox` | macOS. Bitrate control. |
| `nvenc` | `h264_nvenc` | Windows, NVIDIA. VBR plus CQ. |
| `qsv` | `h264_qsv` | Windows, Intel. Global quality. |
| `amf` | `h264_amf` | Windows, AMD. CQP. |
| `mf` | `h264_mf` | Windows Media Foundation. Quality 0 to 100. |
| `x264` | `libx264` | Every environment. CRF. |

`auto` resolves in this order. On macOS, VideoToolbox, then x264. On Windows, NVENC, then QSV, then AMF, then Media Foundation, then x264. On any other environment, x264. Do not decide hardware support from the `ffmpeg -encoders` list alone. Adopt an encoder only when a real one-frame trial encode also succeeds. The four Windows methods trial-encode at 256 by 144, so a wrong minimum resolution is not accepted. When `AKARI_EXPORT_FORCE_X264=1`, skip the trial and reject all of them. If an explicit Windows method is unavailable, stop. Do not move to x264 quietly. If a Windows method is named explicitly while `AKARI_EXPORT_FORCE_X264=1` is set, stop the same way.

## 7. Cut intermediates in a v2 export

Added 2026-08-29.

In an OSR or GPU v2 export, the picture engine draws directly from `edit.sources`, so the cut stage and the tail-pad stage generate audio-only intermediates. Normally that file is `cut-audio.mp4`. When audio padding out to the final duration is required, use `cut-audio-tail-padded.mp4`. Both pass `-vn` and do not process picture. The old legacy export used `cut.mp4` and, when needed, `cut-tail-padded.mp4`. That path is retired. Audio input seeks on the input side per cut (`-ss` and `-t`), with a 0.5 second read-ahead guard at the start of the cut for AAC overlap-add. The cost of the cut stage does not depend on the footage length.
