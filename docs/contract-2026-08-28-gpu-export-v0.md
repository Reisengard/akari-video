**English** | [Japanese](./contract-2026-08-28-gpu-export-v0.ja.md)

# GPU direct export contract v0

## 1. Scope

This contract defines the second picture exit, provided by `render-cut --engine gpu` and `packages/gpu-export`. It passes the shared frame-engine's finished canvas through `VideoFrame(canvas)`, the WebCodecs `VideoEncoder`, and mp4box direct mux, in that order. It does not read back raw RGBA or BGRA, it does not pipe a raw frame from the renderer to main, it does not convert color on the CPU, and it does not re-encode the picture.

Evaluation runs from the start to the end in 1 process, 1 timeline, sequential frames. Span parallelism and multi-process parallelism are not part of the v0 determinism contract. Encoder submission is controlled by `encodeQueueSize` and a bounded `queueDepth`.

## 2. Eligibility

Eligibility is judged mechanically at declaration time, from the HTML string, the caption cues, and the edit declaration. Every result stays on the receipt. Free HTML is judged on the string after HTML comments `<!-- ... -->` are removed. `data-akari-3d-scene`, tags, URLs, and CSS vocabulary inside a comment do not affect eligibility. The contents of a CSS comment and of `<script type="application/json">` stay in the string that is judged, as before.

| Class | Eligible | Meaning |
|---|---|---|
| `same` | yes | Static HTML is sprited once at launch. A supported caption is sprited once, when the unit first becomes active. |
| `three` | yes | An overlay that has a declarative 3D scene in JSON and a canvas to draw into. The Three.js canvas is updated every frame. An entrance is handled by `three-scene-entrance-curve`, `three-scene-entrance-sampled`, or `three-scene-sampled-composite`. |
| `vgpu` | yes | A pure `data-akari-vgpu-scene` is drawn to a WebGPU canvas and transferred to a sprite every frame ([vgpu v0 contract](./contract-2026-09-06-vgpu-layer-v0.md)). |
| `degraded` | no | Raster itself is possible, but the same change over time as the live DOM cannot be guaranteed. |
| `unsupported` | no | Outside the v0 expression range, and a correct finished picture cannot be produced. |

Free HTML detects an absolute URL, an external font, image, or background, a runtime script, iframe, object, or embed, canvas or video, CSS animation, transition, or keyframes, and filter, mask, clip-path, and similar. Only static HTML with no such condition is `same`. The exception is a declarative 3D whose only detected condition is `three-or-canvas-runtime`, which has exactly one `<script type="application/json" data-akari-3d-scene>` declaration regardless of attribute order, and which has no other script and no video. That is `three`. The canvas that 3D draws into is allowed.

Text injection into `data-akari-slot` (`source.params`. Canonical `contract-2026-08-22-overlay-html-slots.md`) is applied, immediately before a static HTML is sprited and when the DOM layer mounts, by `renderTextSlots` in `packages/overlay-runtime/src/slot-params.js`, the same function the legacy rasterize path and the preview overlay-runtime use. If even one overlay has params, inline that runtime on the page, and leave `textSlotOverlayCount` on the receipt manifest. Params with no runtime is fail-closed. Do not silently bake the default wording (2026-08-31, issue #32).

The frame-engine main time axis (cuts) draws a still-image source (`isStillImageSourcePath` in edit-store) as a base layer of `kind: 'image'` (duration is `out - in`, there is no source time, and transform, crop, and keyframes match a video cut. Canonical `contract-2026-08-12-still-image-cut-source-v0.md`. 2026-08-31, issue #30). A video clip on the second visual track or later keeps `at` and `track` and is placed absolutely. A higher-numbered track is in front (v2 `tracks[]` array order). Track 0 stays the old joined chain (a freeze extends it, and a transition overlap is recomputed from the declaration) (2026-08-31, issue #31. Until then the GPU and OSR runtimes stripped the derived `at` and `track` from every cut, so an upper-track clip was joined in series, pushed outside the output duration, and the picture disappeared while the check still PASSed). Apply the same rule to the other two surfaces that pass cuts to frame-engine (the preview-server Web UI preview, and the shell preview), so preview and export draw the same picture (preview parity. The shell treats the minimum `renderTrack` as the bottom track).

Captions are rasterized per cue. Appear, loop, and disappear are reproduced with an analytic opacity and a center-based affine transform. In v2, karaoke, pop, reveal, and reveal-word that have `words[]`, and `emphasis_words`, are also composited GPU-native as word-rectangle tiles. The following stay `unsupported`.

- A unit that mixes karaoke color interpolation with a geometric deformation of pop, one-char-bang, one-char-jumble, or size-pulse.
- A per-word vertical caption that a word-rectangle tile cannot reproduce.
- An unknown motion, and push, typewriter, wipe, or glitch that uses clip-path.
- swing, which needs `transform-origin: top center`.

### 2.1 Per-word captions (v2)

The semantics of a per-word caption are owned by the DOM and CSS that `packages/render-cut/src/captions.mjs` generates. The GPU exit does not rebuild that DOM in another implementation. It measures each word's rectangle with `getClientRects()` from the same DOM. If one word returns several rectangles because it crosses a line break, keep every rectangle. On a portrait output, a cue with no style specified, with `words[]`, that becomes multiple lines, is auto-promoted to reveal by the same line-break function as the canonical path. Measurement is done on each insertion of an independent DOM root, and it is measured again until every measured value of every variant matches exactly on two consecutive passes. The cap is 32. If it does not converge, leave `caption-measure-unstable` as the reason code and the warning, and fail closed. 32 is the margin against a measurement whose max was 6 on hardware and 7 on soft. Do not hide run-to-run jitter with a tolerance, an average, or rounding.

| Target | State every frame |
|---|---|
| karaoke | The base color until the word's start. From start to end, linear-interpolate the whole word's color. After end, the highlight color. |
| pop | For 0.2 seconds from start, at the word-rectangle center, `translateY` from 0 to -0.08em and back to 0, and `scale` from 1 to 1.12 and back to 1. |
| reveal-word | opacity 0 to 1 over 0.01 seconds from start. |
| reveal | Advance line groups with opacity and translateY keyframes at 0, 12, 99.99, and 100 percent. The previous group disappears when it ends. |
| one-char-bang / one-char-jumble | Per character, opacity 0 to 1 and scale 1.6 to 1. jumble's static deformation stays on the raster. |
| size-pulse | At the word-rectangle center, scale 1 to 1.25 and back to 1. |
| emphasis of color, weight, or stroke only | Baked into the static base raster. There is no per-frame state evaluation. |

karaoke is not a wipe from left to right. The canonical keyframes are only `color` from and to, so mix the base-color raster and the highlight-color raster inside the word tile by the time ratio. A CSS timing function applies per keyframe span. Ease the 0 to 50 percent and 50 to 100 percent of pop and size-pulse, then interpolate.

A raster unit is called a unit. Normally one cue is one unit. reveal treats one overlapping `.akari-caption__reveal-group` as one unit. A unit has at most 2 rasters. The color mode is base color or highlight color. The geometry mode is plate background or text on a transparent background. No state means only the one base raster. At launch, check that every word rectangle of a 2-state DOM differs by at most 0.01 px on each component. Over the cap is fail-closed. Build the raster once per unit. Every frame composites integer tiles, split with no gaps by the line strip and the word boundary, in array order. There is no third raster, and no per-frame rasterize.

The raster SVG is not the full frame. Its `viewBox` is only the caption band, keeping the output width. One batch is at most 8 consecutive units in start-time order, and a total band height of at most 4096 px. Stack each unit's 1 or 2 states as vertical bands in one SVG, and decode once per batch. Variant CSS is scoped per `data-akari-band`. An embedded font's `@font-face` appears once inside the SVG. Register the batch of a unit the first time it is needed. Release the GPU texture per unit when the active span ends. Do not extend its life for the batch. Discard the CPU canvas used to cut out after upload, and the decoded image, too.

SVG input is fixed to a data URL. A Blob URL and a same-origin HTTP URL taint a canvas that contains an in-SVG font, so not only `getImageData` but also `texImage2D(canvas)` throws `SecurityError`. Do not use them. Build the font data URL's `encodeURIComponent` string once and reuse it. Do not cache raw base64.

An eligible cue has reason `words-native`. The receipt records `mode` (`sprite` or `words-native`), style, unit count, word count, raster count, band count, tile count, `captionLayoutMaxDeltaPx`, the measurement attempt count, p50, and max, the batch measurement, and the caption raster total time. An unknown style is `caption-style-unsupported:<value>`. A mix of color and geometry is `words-native-color-and-geometry-mixed`.

Acceptance requires, for 5 styles times 5 times each, a lower-quarter MAD of the GPU and OSR decode at most 1.0, a visual check of at most 6 word-boundary comparison images, a median added cost of word-state evaluation and composite at most 1 ms per frame, a 2-run match of the specified fixture on hardware and on software, and 0 readback on the product path. The performance gate is cue-raster p50 at most 500 ms, akari-video-pv with 44 karaoke cues at most 18 ms per frame, and a small fixture (360 frames, 3 cues) with RSS peak at most 900 MB.

`--engine auto` chooses `gpu` on every platform when every item is eligible, and `osr` when it is not. An explicit `--engine gpu` combined with ineligible items shows every reason and fails closed. It does not silently switch to OSR. An explicit request whose GPU launcher is unavailable also fails closed.

## 3. Composite order and LUT

The frame-engine canvas evaluates cuts, layers, transition, matte, and LUT. On the final canvas, sprites composite above that in the order static HTML, 3D, then captions. The LUT therefore applies only inside the picture engine canvas. Captions, HTML, and 3D stay outside the LUT. Every upload requires `uploadPath = "direct"`. Stop the export on a frame where a fallback is detected.

A frame whose cuts and layers are both empty composites as one black frame at the output resolution. The later sprite composite of static HTML, 3D, and captions still stacks on top of that black frame-engine canvas, as usual.

3D is driven by passing the local seconds from the engine clock straight to `threeRuntime.render(container, t)`. The GPU exit does not use the overlay sheet's `__akariSeek`. Per-frame DOM animation sync and a visibility update of every container must not be pulled into the 3D canvas texture update. The sheet's `__akariReady` is awaited once at launch. If a scene is not ready, fail closed and name the overlay id and the state. Whether a span is active is decided by whether it is pushed onto the final compositor's draw.

**Revised 2026-09-04 (issue #53).** Only the video seek wait is an exception. Every frame, before the 3D draw, call `__akariSeekVideos(seconds)`, which the sheet publishes (the video part cut out of `__akariSeek`, the same implementation as OSR). A video texture in a 3D fragment comes from the presented frame of a `<video>`, so the order must be seek, then the presented frame is fixed, then the 3D draw (`3d.md`). Without the call, a video texture on the GPU path stays stuck on the picture at 0 seconds from launch. If the sheet has no `<video>`, do not call it.

## 4. Zero readback

The product run path does not use an API that reads the GPU frame surface back to the CPU. The static audit, excluding only `src/verify-readback.js`, requires 0 WebGL or 2D pixel reads, 0 `VideoFrame` byte copies, 0 bitmap conversions, and 0 canvas data or blob exports. Taking out the encoded H.264 byte sequence is not a raw-frame readback.

`AKARI_GPU_TRAP_READBACK=1` or `--trap-readback` makes those APIs throw, and requires a complete run with the call counter still 0. The verification-only raw-frame SHA path is isolated in another module, and it cannot be enabled at the same time as the trap.

## 5. Encode, mux, and audio

The picture is H.264 High profile. The level is the smallest value that satisfies resolution, fps, and bitrate, derived from H.264 Table A-1 (MaxFS, MaxMBPS, and MaxBR times 1.25). The floor is Level 4.0. 1080p30 is `avc1.640028` (byte-identical to before). 1080p60 is `avc1.64002a`. 1440p30 is `avc1.640032`. 4K30 is `avc1.640033`. 4K60 is `avc1.640034`. A `codec` option can override to an explicit string (revised 2026-09-01. The fixed `avc1.640028` made Blink's `VerifyCodecSupportStatic` refuse MaxFS above 8192 MB, so 1440p and 4K were `isConfigSupported=false` on every OS, hardware and software. Investigation of 2026-08-29, §5-4). A keyframe every 2 seconds. The product specifies hardware preference. `--soft` specifies software preference. The bitrate is owned by the GPU bitrate value in render-cut's quality preset (on Mac, shared with the VideoToolbox value). **On a 1080p (1920 by 1080) basis,** `high = 12 Mbps`, `standard = 8 Mbps`, and `light = 5 Mbps`. When the output pixel count exceeds 1080p, scale by that ratio (4K is 4 times, so `high = 48 Mbps`. 1440p is about 1.78 times. Round to 100 kbps). Below the basis, stay at 1 times (revised 2026-09-01. The receipt `bitrateSource` is `quality-preset-scaled`). An explicit `--bitrate` beats quality, and it does not scale. `master` does not declare a VideoToolbox bitrate, so on the GPU exit, if `--bitrate` is absent, fail closed with a reason.

Pass the encoded Annex B sample to the main process. The incremental muxer builds avcC from SPS/PPS or the decoder config and appends it directly to `out.mp4`. There is no temporary video file, and no extra video process. The MP4 timescale is the rate numerator that `frameRateRational(fps)` returns. One frame is the denominator ticks that the same function returns. The track duration is `frames * frameTicks`. dts equals cts. There is no ctts. Reserve a `free` box, sized to the upper bound computed from `frames`, immediately after `ftyp`. On finish, overwrite moov onto the head of that box and leave the remainder as `free`. mdat is 64-bit largesize from the start. Sample positions are co64. Do not move the body. Place moov before mdat. Revised 2026-09-01. This shape was reached through #37 (ffmpeg remux, 2026-08-31 to 2026-09-01).

GPU video is video-only. So that the current canonical audio filtergraph can read the audio of input 0, copy the original cut audio. If there is no audio, attach a silent carrier of `frames / fps` seconds. Later mux requires `-c:v copy` and `-t frames/fps`. The final MP4's video frame count matches the requested value exactly. A mismatch is fail-closed. The A/V end difference must be within 1 frame.

Appended 2026-09-02 (issue #43). Attach the silent carrier above only when an **explicit audio source** has no audio stream. When no audio source is specified, do not call the audio muxer. Copy the video-only intermediate to the artifact, and the result is picture only, with no audio track. In that case, do not check audio presence or the A/V end difference. The low-level CLI `--audio <path>` probes for an audio stream before export. If there is none, do not build a carrier. Stop with exit code 2. The product path that mixes edit.json audio is §11, `render-cut --engine gpu`.

## 6. Determinism and the parity gate

| mode | Required condition |
|---|---|
| hardware | Two runs of the specified fixture on the same machine. Every frame's SHA-256 matches, and the MP4 SHA-256 matches. |
| software | Two runs of a 360-frame fixture. The pre-encode raw-frame SHA-256 matches 360 of 360. |
| software H.264 unsupported | Leave `unsupported` on the receipt. Only the raw-frame SHA is required. |

A software MP4 SHA is required only when the encoder is deterministic. Otherwise it is a diagnostic with a warning. The GPU versus OSR decode comparison uses fixed thresholds. per-frame MAD at most 1.0 on an engine-only span. Lower-half MAD at most 1.0 at 5 representative times of a caption cue. MAD at most 1.0 on a 3D span.

**Added 2026-09-04 (issue #53). Four points that must be the same on both paths.**

1. **The time passed to an overlay is `frameNumber / fps`.** Do not round to microseconds. An overlay's `start` is always `atFrames / fps`, so rounding flips the comparison by 1 ulp, and only the one frame at a cut boundary disagrees. This `seconds` flows into the time-window test, the CSS animation phase, and the frame number of item keyframes.
2. **A container outside the time window is also paused every frame, and `currentTime` is written.** If it is skipped, a fragment's CSS animation outside the window runs out on the wall clock (an export is on the order of minutes) and enters the window stuck on the final pose of `animation-fill-mode: both` or `forwards`. The same time then draws a different picture depending on what was captured just before. OSR's `__akariSyncAnimations` has no active test.
3. **`data-no-timeline` on the DOM stage root.** A fragment's rule has two arms, `[data-akari-active] .x, [data-no-timeline] .x { animation: ... }`. The OSR sheet has this on `#stage`. If the GPU side lacks it, a fragment declared only on the no-timeline arm does not move on GPU alone.
4. **A static sprite does not drop the overlay's `transform`.** Declare the same `translate`, `scale`, and `rotate`, plus `transform-origin: center`, on `.akari-sprite-root` as on OSR's `.akari-overlay-container` (`role: "background"` is fixed to identity on both paths).

Also, if an overlay's `start` or `duration` is not a finite number when the manifest is generated, fail closed. Putting a default (`?? 0` or `?? duration`) makes the worst asymmetry when the value is missing. OSR never shows it, and GPU shows it for the whole duration (OSR writes `"NaN"` from `formatNumber(undefined)`, and `seconds >= NaN` is always false).

## 7. Receipt

`.akari/render.json` has `provenance.engine = "gpu"` and a GPU receipt. The GPU receipt records at least the following.

```json
{
  "provenance": {
    "engine": "gpu",
    "launcher_tier": 2,
    "mux": "incremental-mp4",
    "video_reencode": false
  },
  "audio": {
    "mode": "copy",
    "source": "cut-audio.mp4",
    "source_has_audio": true
  },
  "gpu": {
    "platform": "win32",
    "chromium": "140.0.0.0",
    "renderer": { "vendor": "NVIDIA Corporation", "renderer": "ANGLE (NVIDIA GeForce RTX)" },
    "encoder_support": { "prefer-hardware": true, "prefer-software": false },
    "encoder": "WebCodecsH264Encoder",
    "hardware": "prefer-hardware",
    "uploadPath": "direct",
    "quality": "high",
    "bitrate": 12000000,
    "queueDepth": 4,
    "rss_peak": 0,
    "readback": {},
    "eligibility": []
  }
}
```

`audio.mode` is one of `copy` (copy the audio of an explicit source), `silent-carrier` (the explicit source has no audio, and the §5 carrier is attached), or `none` (no audio source was specified, picture only). `source` records only the basename. Do not keep an absolute path. For `none`, both `source` and `source_has_audio` are `null`.

`gpu.eligibility[]` lists, without omission, the overlay, caption, or edit id, the 4-way class, the reason, and the detected conditions. memory uses the same warning and hard-stop vocabulary as the OSR receipt. `--engine osr` and `--engine gpu` share the final artifact path and naming, and the place of `.akari/render.json`, apart from the receipt.

`gpu.platform` and `gpu.chromium` are the Electron main process's runtime. `gpu.renderer` is the vendor and renderer taken from `WEBGL_debug_renderer_info` in the renderer process (`null` if it cannot be read). `gpu.encoder_support` records whether `prefer-hardware` and `prefer-software` are supported, with only `hardwareAcceleration` swapped on the same H.264 config as the product (`null` if it cannot be read). WebCodecs does not expose the encoder implementation that was actually used, so a claim that "the hardware encoder was used" is checked by combining `encoder_support` with the export speed.

## 8. Limits of v0 and v2

- Staging that a word rectangle cannot express, a cue where color interpolation and a geometric deformation coexist, and a vertical per-word caption need a later stage such as a glyph atlas.
- Dynamic free HTML needs OSR or a pre-bake.
- On every platform, if launcher tier 1 or 2 is present, `auto` uses GPU when eligible and OSR when not.
- Span parallelism and multi-process parallelism for a long duration are unsupported.
- ~~GPU export through the installed desktop app (launcher tier 1) is unwired.~~ **Resolved 2026-08-29.** The shell's `electron-entry.js` accepts `--akari-main packages/gpu-export/src/electron-main.mjs`, and `buildElectronArguments` passes that to tier 1 (OSR contract §6). The fail-closed of `resolveGpuLauncher` (allowDesktop default false) was lifted in v0.1.28. The following is the record of v0.1.26 through v0.1.27 (found in v0.1.25). The shell's `--render` reads only the OSR runtime, and `buildElectronArguments` passes mainScript only to tier 2. From v0.1.26, `resolveGpuLauncher` drops tier 1 from the candidates (fail-closed). `auto` goes to OSR (provenance records `engine_fallback` and the reason). An explicit `--engine gpu` is refused. Wiring tier 1 (adding a GPU runtime choice to the shell contribution) is a separate ticket.

## 8.1 Platforms

| platform | `--engine gpu` | `--engine auto` | launcher |
|---|---|---|---|
| macOS | Explicit use is allowed | GPU when eligible, otherwise OSR | tier 1 or 2 (tier 1 is currently unwired and fail-closed) |
| Windows | Explicit use is allowed | GPU when eligible, otherwise OSR | tier 1 or 2 (same as above). On a hybrid-GPU machine the child process (both tier 1 and tier 2) lands on the iGPU by default, and `prefer-hardware` is unsupported regardless of resolution (measured 2026-09-01). The launcher therefore temporarily overwrites the Windows per-app GPU setting (HKCU `UserGpuPreferences`, `GpuPreference=2;`) immediately before spawn on a GPU-exit launch, and restores it after exit (`auto` applies only to the GPU exit, and the OSR exit writes only under `force`, revised 2026-09-02) (OSR contract §6 and §11.7, `AKARI_EXPORT_GPU_PREFERENCE=auto\|off\|force`, `render-cut --gpu-preference`). See the note below. |
| Linux | Explicit use is allowed | GPU when eligible, otherwise OSR | tier 1 or 2 (same as above) |

**Windows note (appended 2026-09-01, revised 2026-09-02).** The judgment table, order, sidecar, and records of the temporary overwrite are owned by OSR contract §11.7, rulings 1 through 7. The `auto` temporary overwrite applies only to a GPU-exit launch (`launchGpuExport` passes `exit: "gpu"`). The OSR exit writes only under `force` (ruling 1 revised, basis in §11.7). The receipt `provenance.gpu_preference` carries `exit`. The GPU exit adds the following three points.

(a) A page-runtime throw of `WebCodecs H.264 config is unsupported` attaches `renderer` and `encoder_support` to the error (a `gpuDiagnostics` property, plus ` renderer=<UNMASKED_RENDERER>` and a marker at the end of the message). The failed run.json of `electron-main.mjs` fills `gpu.renderer` and `gpu.encoder_support` from that. Do not leave the fixed `null`.

(b) `attachGpuFailureContext` of `exportWithGpu` replaces `error.message` with the one-line hardware-encoder failure text from `describeHardwareEncoderFailure` only when run.json `error` contains that same sentence. The replacement is one line, with no newline, and it ends by quoting the original one-line English error as the cause. The original is kept on `error.originalMessage`. The wording branches on `hybrid` and `active_is_high_performance`, summarized by `summarizeGpuAdapters` from run.json `gpu.devices`, and on the launcher's `gpuPreference.reason` and `applied`. Hybrid, iGPU, and `user-preference-respected` explains the power-saving lock and how to use `force`. Hybrid, iGPU, and `policy-off` explains how to use `auto`. Hybrid, iGPU, and `applied` says the value was written but did not take effect, and points at the Settings app. A dGPU that is still unsupported says to update the driver or use `--engine osr`. Not hybrid says `--engine osr`. devices null says the same point from the renderer string alone, and says the GPU info could not be obtained. render-cut prints `render-cut execution error: <this one line>` as the last stderr line. This is the one failure line that stays the localized sentence produced by `describeHardwareEncoderFailure`.

(c) Do not add an automatic OSR fallback when hardware is unavailable (keep the §12.3 fail-closed).

npm Electron tier 2 requires `node_modules/electron/path.txt`. The value is `electron.exe` on win32, `Electron.app/Contents/MacOS/Electron` on darwin, and `electron` on linux. Distributing the installed-app tier 1 assumes `packages/gpu-export` is bundled in the shell's `extraResources`. The current tier 1 is still dropped from the candidates, as `GPU_DESKTOP_TIER_UNWIRED_REASON` says, so an OSR run is not recorded by mistake as a GPU receipt.

## 9. v1. HTML-in-Canvas DOM layer

v1 makes free HTML whose time changes through CSS animation, transition, `@keyframes`, Web Animations, or `@property` eligible as class `dom`. Only at export, mount the DOM as a child of a dynamically created `canvas[layoutsubtree]`, pause and seek the original animation on the engine clock, then transfer it to a transparent 2D canvas with `drawElementImage`. That canvas becomes a texture directly through `SpriteCompositor.updateSprite`. A Three.js canvas stays a separate texture, as before, and is not placed in the DOM host.

Only the GPU exit adds `--enable-features=CanvasDrawElement`, `--disable-gpu-vsync`, and `--disable-frame-rate-limit`, and it keeps `--force-device-scale-factor=1`. A DOM run groups consecutive items of `overlays[]` in declaration order. Composite static HTML, 3D, and DOM runs in the original index order, then place captions last. All of them are outside the LUT.

CSS 3D is judged in the following three groups.

- Geometry (`perspective`, `perspective-origin`, `rotateX`, `rotateY`, `rotate3d`, `matrix3d`, and a non-zero `translateZ` or `translate3d`) is `dom` eligible. A measurement on 2026-09-03 of 8 fixtures times 5 times had a maximum MAD inside the bounding box of 0.5336 (the 2D noise floor is 0.1929, the budget is 1.0). Keep the following exception. **Exception (2026-08-31, issue #34).** `translateZ(0)` and `translate3d(x, y, 0)` whose Z component is the literal 0 are not detected as 3D, because the draw matches a 2D `translate` (measured: YMAX is 0 on every frame of a static sprite). If Z is not 0, if the argument count differs, or if Z cannot be read as a literal because it is `var()` or `calc()` or similar, treat it as 3D geometry. Argument extraction counts nested parentheses, so a literal Z of 0 can still be read when X or Y is driven by a CSS variable or calc, as in `translate3d(var(--x), calc(1px + 2px), 0)` (overlay rules naturally emit adjustment values as CSS variables).
- CSS 3D that comes with `backface-visibility: hidden` stays fail-closed as `css-3d-backface-hidden`. A measurement on 2026-09-03 of 8 fixtures times 5 times had MAD 13.4318 inside the bounding box, and at most 207,679 px that appear only on the GPU. Back-face culling was not transferred.
- `transform-style: preserve-3d` is `dom` eligible. The occlusion order on the GPU path becomes DOM order. If a contradictory pair is detected, where descendant draw regions cross on screen and the front element is drawn first in the DOM, warn. Do not fail closed.

The vgpu reason vocabulary is `vgpu-scene-canvas-direct`, `vgpu-stateful-unsupported`, `vgpu-invalid-declaration`, and `vgpu-condition:<conditions joined by commas>` ([vgpu v0 contract](./contract-2026-09-06-vgpu-layer-v0.md)). `vgpu-scene-stateful-direct` means a valid `mode: "stateful"` declaration. A stateful WebGPU effect goes direct to the canvas by fixed-step replay.

The following conditions stay fail-closed as `degraded`, and the receipt keeps every overlay id, reason, and detected condition.

- An embedded context of `iframe`, `object`, or `embed`.
- A clock that runs itself with `requestAnimationFrame`, `setTimeout`, `setInterval`, `Date.now`, or `performance.now`.
- `video`, `audio`, a runtime other than canvas or declarative 3D, and a script other than JSON.
- An absolute URL and an external font, image, or background resource. A scan of `url(` in `background` or `background-image` stops at a declaration separator (`;` and `}`) and also at a quote or a tag boundary (`"`, `'`, `<`, `>`). A same-document fragment reference `url(#id)` is not treated as external (2026-08-31, issue #33. Until then a scan from an inline style with no trailing `;` reached a later SVG `fill="url(#id)"` and false-detected it).
- A runtime where `drawElementImage` is unavailable, or where the device pixel ratio is not 1.
- If a declarative 3D does not meet an entry condition of the composite path (`three-or-canvas-runtime`, `animation-timing`, `css-3d-transform`, or `advanced-css`), the reason is `three-sampled-condition:<condition names joined by commas>`. Do not reuse a curve-parse failure reason. CSS 3D geometry is eligible, because the composite path transfers the whole fragment.
- `three-sampled-chain-css:<property>`, for `filter`, `clip-path`, `mask` or `mask-image`, `backdrop-filter`, or `mix-blend-mode` on the ancestor chain from the root to the Three canvas, is kept on the scanner as a guard only for method A (sampled), which composites the canvas alone. Method B (composite) transfers the whole fragment, inside and outside the chain, so it lets `advanced-css` through.
- If a composite candidate has `@property`, the reason is `three-composite-property`. Custom-property interpolation may split between the overlay sheet's WAAPI clone and the DOM layer's raw CSS animation, so stay fail-closed until it is measured.
- If an element that declares `transform-style: preserve-3d` has, among its children, both an element on the ancestor chain to the Three canvas and an element outside the chain that declares a transform with Z, the reason is `three-composite-preserve-3d-siblings`. If it cannot be judged statically, fall to degraded for the same reason (measured 2026-09-04. Bounding-box MAD 5.0082. OSR stacks by z depth, and GPU stacks by DOM order).

settle is decided once, at mount. On a Chromium that has `canvas.requestPaint`, after 2 rAF frames, wait for `requestPaint()` and a `paint` event (cap 250 ms). On a Chromium without the API, synchronously read computed style, the bounding rect, and the host height to fix the layout, then transfer immediately. The adopted policy, the API probe, and p50 and p95 of the DOM layer's freeze, wait, transfer, and upload are recorded on the receipt `gpu.domLayer`.

Under `--verify-frames`, color the 8 by 8 sentinel at the top left of each DOM run deterministically from the frame number, and check every frame that the top-left 4 by 4 of the texture after transfer matches the expected RGB within plus or minus 8. An environment whose CSS `mod()` self-check fails switches to a JS channel specification, and that mode is recorded too. A pixel read is allowed only on the verification path isolated in `src/verify-readback.js`. The product path's zero-readback contract does not change.

The DOM layer's OSR decode comparison, at 5 representative times including the animation start, requires either (1) MAD at most 1.0 inside the overlay bounding box, or (2) structural agreement (full-frame MAD at most 0.2, and the total of pixels that appear on only one side at most 0.5 percent of the bounding-box area). 0.5 percent is based on antialias difference growing with the perimeter, not the area (measured. A structural-agreement example of two-level preserve-3d is 193 to 273 px on one side, which is 0.136 to 0.161 percent of the bounding box, about 17 percent of the bounding-box perimeter. A failing example where a whole face appears is 207,679 px on one side, three orders away). A time whose bounding-box area has collapsed below 1,000 px (for example the instant a full face turns edge-on and disappears) does not use (1). Judge it only by full-frame MAD at most 0.2. An overlay whose `gpu.domLayer.preserve3dOrderConflicts` is non-empty is outside this comparison, and **the fact that a warning was emitted** is the pass condition (it is let through with the known limit below in mind). The sentinel must match on every requested frame. Known limits are the karaoke word texture, a self-running clock, a DOM entrance animation of a 3D scene, a time mismatch of `@property` animation that remains on OSR and legacy, and the occlusion order becoming DOM order when `preserve-3d` descendants cross. The detector warns on a contradiction with Z order and leaves it on the receipt `gpu.domLayer.preserve3dOrderConflicts`. `backface-visibility: hidden` is not transferred, so it is degraded.

Determinism has a known limit on a long duration. A short export (measured 450, 678, and 900 frames) matched all-frame SHA and MP4 SHA across 2 runs. A long export that includes many DOM overlays with large type (measured 5,400 frames) changed the antialias of a glyph edge per run, inside about 180 frames closed in one overlay span, and the all-frame SHA match broke probabilistically (MAD 0.0001 to 0.0003, 11 to 41 differing pixels). The sentinel matched on every run, so it is not one frame late. Rasterizer-related launch flags did not remove it.

**Acceptance ruling (2026-08-29, control tower).** The hardware determinism gate for an export that includes a DOM layer is not "all-frame SHA matches across 2 runs". **Treat "per-frame MAD at most 0.001 on every frame, and the sentinel matches on every frame" as agreement.** The glyph-edge antialias difference above (at most 0.0003) is inside this range, it is invisible, and it is not one frame late, so it is accepted. An export with no DOM layer (engine layer, static sprites, and per-word captions only) still requires a SHA match.

(Text as of v1 on 2026-08-28.) Caption cues were baked one by one into SVG at page launch, and baking 30 cues added about 47 seconds to a 900-frame export (about 52 ms per frame). On a short export that includes captions, the GPU exit was slower than OSR. A measurement of the same subject with captions removed was GPU 19.2 ms per frame and OSR 40.9 ms per frame.

In #120f on 2026-08-29, sprites other than the base were gathered into instanced drawing per kind. karaoke `drawArrays` became a constant 2 calls per frame, independent of the caption count, and the added GPU time of 3 cues at once versus no captions shrank from +23.4 ms per frame to +1.65 ms per frame. The limit of a per-frame caption draw cost is resolved. On the real footage `akari-video-pv` (5,999 frames) it reached 7.2 to 8.2 times GPU over OSR.

(Text as of #120f on 2026-08-29.) The remaining caption difference is not the per-frame composite cost. It is the startup cost of cue measurement and SVG raster. The real-footage PV with captions was 150.7 seconds (25.1 ms per frame). The no-caption control was 88.0 seconds (14.7 ms per frame), 1.71 times. On `akari-project/dynamic` with 30 cues, the caption raster shortened from about 47 seconds to 9.95 seconds, but on a subject of about 30 seconds the startup-cost ratio is large, and GPU over OSR stays at 1.07 to 1.14 times.

In #120h on 2026-08-30, a wrapper measured receipt `gpu.captionStartup` of the real footage `akari-video-pv` (5,999 frames, 44 cues, 88 bands, 6 batches) across 5 runs. The caption startup cost that was about 63 seconds at #120f (SVG raster 20.5 to 21.3 seconds, plus cue measurement of 88 variants) became `captionStartup.totalMs` 2.75 to 5.01 seconds and `captionRasterTotalMs` 5.90 to 7.34 seconds, **8.7 to 12.3 seconds** in total. The breakdown of one representative run is font base64 encoding 0.66 seconds (13.6 MB after encoding, once per run), cue measurement 1.54 seconds (88 stable calls, 176 passes, 264 variants, of which 0.75 seconds is waiting for the font and 0.073 seconds is layout), and SVG raster 5.90 seconds (SVG assembly 0.046 seconds, data URL allocation 0.52 seconds, decode 2.80 seconds, draw to the intermediate sheet 1.72 seconds, band blit 0.11 seconds, texture registration 0.004 seconds).

`stages.captionRasterBatch` during the frame loop is **0 times**. All 6 batches finish baking before the export starts. The frame loop's `stages.captions` is p50 0 ms and p95 0.1 ms. Reuse of a measurement applies only when the cue contents match completely (output size, CSS variables, the cue HTML, the unit index, and the CSS variant sequence). The PV's 44 cues all have different body text, so `reusedStableCalls` is 0, and the 88 stable calls stay 88 distinct keys. On a 3-cue fixture that shares the same body text, 4 of 6 stable calls are reused, and the distinct keys fall to 2. A unit whose measurement does not converge in 32 tries is demoted to a sprite for that unit only. The receipt shows `gpu.captions[].mode = "sprite"` and a warning, and the export runs to completion (it does not fail closed).

An absolute speed was not taken in the 2026-08-30 measurement. A quiet window of 1-minute load under 20 did not arrive across 3 waits of 40 minutes, and the minimum load observed was 52. Under load 77 to 421 the PV was 250.6 to 687.4 seconds. The no-caption control under the same high load was 220.4 to 785.4 seconds. The difference against the captioned run was buried in a load swing of more than 3 times per run, and some runs were faster than the control. Therefore "PV at most 110 seconds" and "dynamic at least 2 times (versus OSR)" in a quiet window are unverified. As a reference, `akari-project/dynamic` under high load was GPU 71.1 to 80.7 seconds and OSR 93.6 to 97.8 seconds (1.2 to 1.3 times), which improved from the 1.07 to 1.14 times at #120f. The RSS cap was 531 to 914 MB (within 1 GB). Readback under `--trap-readback` was 0.

## 10. v3. Entrance of a declarative 3D

v3 handles CSS animation, transition, and `@property` in the HTML part of a declarative Three.js scene, on the GPU path. Three.js itself still passes the engine clock's local seconds straight to `threeRuntime.render(container, t)`. Animation inside the scene, the video texture, and the ready check do not change. If the entrance can be parsed into the old grammar, the reason is `three-scene-entrance-curve`. If it cannot, the reason is `three-scene-entrance-sampled`, which measures the computed style. Do not fail closed only because it cannot be parsed. A declarative 3D with no CSS animation stays reason `three-scene-canvas-direct` when it has no other condition. When it comes with `advanced-css` or CSS 3D geometry, the composite path (`three-scene-sampled-composite`) transfers the whole fragment.

curve mode, as before, parses a paired selector `[data-akari-active] .root, [data-no-timeline] .root`, one keyframe with 2 endpoints, a known timing, a non-negative delay, iteration 1, normal direction, `both` or `forwards` fill, and only opacity and a 2D translate or scale. Resolve the overlay's `vars` and `transform.x`, `y`, and `scale`, and put absolute values on the manifest `entrance`.

```json
{
  "durationSec": 1.1,
  "delaySec": 0.05,
  "timing": { "x1": 0.16, "y1": 1, "x2": 0.3, "y2": 1 },
  "fill": "both",
  "from": { "opacity": 0, "tx": -380, "ty": 140, "sx": 0.817, "sy": 0.817 },
  "to": { "opacity": 1, "tx": 0, "ty": 0, "sx": 0.95, "sy": 0.95 }
}
```

The per-frame semantics are owned by the following. Before the delay, use from. After the end, use to. Apply the same eased progress, by linear interpolation, to all of opacity, tx, ty, sx, and sy.

```text
local    = seconds - overlay.start
progress = clamp((local - delaySec) / durationSec, 0, 1)
eased    = timing == linear ? progress : cubicBezierAt(progress, x1, y1, x2, y2)
value    = from + (to - from) * eased
```

`cubicBezierAt` uses frame-engine's existing export. Three real subjects were matched against Chrome headless `getComputedStyle` at 5 times (before the delay, 3 points during the entrance, and after the end). The measured difference was at most 0.00043 px of translate, at most 0.000001 of scale, and 0 of opacity. The acceptance thresholds are translate at most 0.5 px, opacity at most 0.005, and MAD at most 1.0 inside the GPU and OSR bounding box on the 3D entrance span.

sampled mode uses the paused WAAPI clone that the overlay sheet generated. Every frame, set `currentTime` to the same composite time as OSR, `seconds * 1000`. After updating `data-akari-active`, read the computed opacity and transform of each element from the overlay container to the Three canvas, and accumulate the 2D matrix, including transform-origin, from the top down. Opacity clamps the product. Sampling is a function of the engine-clock time only. It does not depend on the wall clock or on rAF advancing.

A fragment that uses `@property` is not `degraded`. It is treated as sampled. The export sheet's WAAPI clone conversion does not carry over a keyframe of a registered custom property, so that property itself is not interpolated on either GPU or OSR, and it is drawn at the initial value. opacity and transform declared directly on the same keyframe are interpolated, and the two engines agree, so parity holds. Custom-property interpolation is a separate sheet-side issue.

If the accumulated matrix is only an axis-aligned translate or scale, keep the 3D canvas as the old texture and convert it to a center-based sprite draw state. A general 2D affine that includes rotation or shear is drawn to an intermediate canvas of the output size with `setTransform(a,b,c,d,e,f)`, then composited with the identity draw state. perspective, a real Z component, and any other 3D matrix are not handled by method A. They go to method B's whole-fragment transfer.

The entry conditions of sampled method A are the two `three-or-canvas-runtime` and `animation-timing`. The target is the ancestor chain from the fragment root to the Three canvas, including both ends. An animation or transition on any element of this chain is included in the accumulated matrix. If the Three canvas CSS box does not match the full output, use the intermediate-canvas path even for an axis-aligned matrix, and keep the original position and size.

Method B (composite) handles, with reason `three-scene-sampled-composite`, a fragment that method A cannot prove is ancestor-chain-only, a fragment with CSS 3D geometry, or a fragment with `advanced-css`. Three.js draws on the overlay sheet as before, and that Three canvas is relayed every frame with `drawImage` onto the same canvas element on the DOM-layer copy side. Then seek the paused WAAPI to the composite time and `drawElementImage` the whole fragment root. `[data-akari-3d-fallback]` on the DOM-layer copy side is hidden with `hidden` and `display:none !important`. Inside a fragment, DOM order including the canvas, and z-index, apply as they are. Between fragments, composite in track z, then declaration index, as before. A 3D matrix on the ancestor chain, and `advanced-css` inside and outside the chain, are therefore transferred.

CSS 3D uses the same three groups as the DOM layer. Only the combination of `backface-visibility:hidden` and a depth transform stays degraded as `css-3d-backface-hidden`. A crossing of `transform-style:preserve-3d` is let through as composite, and when it is detected a warning is left on stderr and on the receipt `preserve3dOrderConflicts`. Other CSS 3D is let through. A fragment whose siblings reorder by z depth in `preserve-3d` space (a 3D canvas and a sibling element, for example) draws in DOM order on the GPU, so the picture differs from OSR (measured 2026-09-04. Bounding-box MAD 5.0082. On OSR only the sibling with z greater than 0 is in front of the canvas). This shape fails closed as `three-composite-preserve-3d-siblings`. Do not let a fragment whose picture changes through with no warning. Widening the DOM layer's `preserve3dOrderConflicts` detector to sibling pairs can reopen it (a candidate for the next round). A parent-child pair is let through as before, with the detector's warning left on the receipt (measured parity 0.6374). `@property` on a composite candidate may split the interpolation result between the overlay sheet and the DOM layer, so it fails closed as `three-composite-property`. Method A's `three-sampled-chain-css:<property>` guard stays, but method B draws the whole fragment inside and outside the chain, so it lets `advanced-css` through. Any other out-of-entry condition is `three-sampled-condition:<condition name>`. Do not reuse a curve-parse failure reason.

Each 3D sprite in the manifest has `entranceMode: "curve" | "sampled" | "composite" | "none"`. `gpu.three.overlays[].entrance.mode` on the run payload and the receipt records `curve`, `sampled`, or `composite`. `gpu.three.sampling` records `count`, `p50`, and `p95` milliseconds of sampled frames. When there is a composite, `gpu.three.composite` records the overlay count, the DOM element count, and p50 and p95 of the canvas relay cost and the DOM layer cost.

## 11. v2 cut-audio intermediates (appended 2026-08-29)

GPU-path video reads `edit.sources` directly on the page and does not use the video of `cut.mp4`. The cut stage therefore generates `cut-audio.mp4`, and when the duration must be extended it then generates `cut-audio-tail-padded.mp4`, and passes only the audio stream to the final mux. Both commands use `-vn` and do not decode, filter, or encode video. The semantics of audio trim, speed, freeze silence, transition, gap, and AAC 48 kHz match the old cut and tail-pad that included video. The legacy path still uses intermediates that include video. Audio input seeks on the input side per cut (`-ss` / `-t`), sets a 0.5 s lookahead guard at the head of the cut (for AAC overlap-add), and does not make the cut-stage cost depend on the footage length.

## 12. Root-fix of unstable measurement, runtime fallback, and raw-frame dump (appended 2026-08-30)

### 12.1 Facts (2026-08-30, measurement on the capture-v2-engine lane, and the control tower's code check)

- On an internal fieldtest job (11 seconds, 1080p, captions **3 cues, no `words[]`, no style specified**, 2 HTML overlays, a LUT), the §2.1 measurement **does not converge in 32 tries and fails closed with `caption-measure-unstable`**. main before `6da9a353` falls at the same point. It is an existing defect. It happens on the simplest caption, so the cause is likely in the measurement base, not in a karaoke or pop word rectangle (not identified yet).
- `render-cut.mjs` **does not catch a runtime failure** of `exportWithGpu`. `engine_fallback` fires only for launcher tier 3 (Electron absent). If the page runtime fails closed, the whole export fails. `--engine auto` chooses gpu by the eligibility check ahead of time, but measurement convergence is known only at runtime, so the eligibility check cannot reject it.
- `akari capture --engine auto` resolves the engine with the same function as export (capture contract §9.2), so the same job falls at the same point. An explicit `--engine osr` passes.
- gpu export has no mechanism to take out the frame immediately before it is passed to the encoder (the zero-readback design, §4). osr has `--dump-frames` (`raw/frame-N.bgra`), and the lossless comparison of capture contract §9.3 holds only on osr.

### 12.2 Requirement A. Identify the cause of unstable measurement, and make it deterministic

- For a try that did not converge, leave on run.json and the receipt **which value of which cue moved, and by how much** (the variant, token, and rect diff). Today only the attempt count, p50, and max are kept. Do not decide the cause by guessing. Identify it from this diff and a reproduction job.
- Put a deterministic fix against the identified cause. **Do not hide jitter with a tolerance, an average, or rounding** (the §2.1 principle is unchanged). Pick the candidate by measurement. How to wait for layout to settle (whether one `getBoundingClientRect` is enough, and rAF or font-metrics delay), pinning the root's insert position and size, pinning DPR and zoom, and similar.
- Report, in a form that can be appended to this contract, the range that was root-fixed and the conditions that were not (if any).

### 12.3 Requirement B. Runtime fallback (required)

- When `--engine auto` and the gpu page runtime fails closed with a **closed set of reason codes** (v0 is only `caption-measure-unstable`), render-cut **reruns on osr**, and the receipt keeps `provenance.engine_fallback = { from: "gpu", reason: "<reasonCode>" }` and a reference to the gpu side's failed run.json. Discard the intermediates and run osr from the start (do not reuse a part).
- An explicit `--engine gpu` stays fail-closed (show the reason, exit not 0). Fallback is `auto` only.
- `akari capture --engine auto` falls back with the same function and the same reason-code set, and records it on `capture.json.engine.fallback`.
- A failure outside the fallback set (cannot decode, an Electron crash, and similar) stays a failure, as before. Widening the set is an append to this contract.

### 12.4 Requirement C. A raw-frame dump of gpu export (verification only)

- Add `--dump-frames <n,...>` to gpu export. Read back the `finalCanvas` immediately before it is passed to the encoder, and write `raw/frame-N.rgba` (8-bit, row order stated in the same rule as the osr dump). Match the argument and the output-path shape of osr's `--dump-frames`.
- **The product path with no flag keeps zero readback** (both the `assert-zero-readback` static audit and `--trap-readback` still pass). The dump sits in the same verification-only frame as `--verify-frames`.
- Make the lossless comparison of capture contract §9.3 hold on gpu too. The PNG of `capture --engine gpu -t N` is identical to the raw of `--dump-frames N` (MAD 0).

### 12.5 Acceptance

- On a fieldtest job (a copy), `render-cut --engine auto` **runs to completion**. On gpu if it was root-fixed, and by fallback to osr if it was not. The receipt records which one, and the reason. `capture --engine auto -t 0 3 6` also runs to completion the same way.
- The diff log of a try that did not converge appears on run.json and the receipt (if a fixture cannot reproduce it, fix the shape with a unit test that injects jitter).
- The raw taken by `--dump-frames` and the PNG of `capture --engine gpu` match bit for bit (MAD 0, 3 frames).
- The mp4 SHA of an existing fixture that does not fire the fallback is unchanged. `assert-zero-readback` PASSes. `--trap-readback` runs to completion.
- The fail-closed behavior and the exit code of an explicit `--engine gpu` are unchanged (fixed by a test).

### 12.6 Append from the implementation lane's measurement (2026-08-30, after acceptance)

- **Cause (confirmed).** The entrance fade on `.akari-caption__plate` in `captions.mjs` (`akari-caption-fade 180ms ease-out`, `translateY` from `0.18em` to 0, which is 6.84 px at the default 38 px) was stopped by `settleCss` on the raster side, but **was not applied to the measurement root** (`CAPTION_WORD_FREEZE_CSS` stops only the 6 per-word selectors). Measurement sampled a live transform at an arbitrary time, so the 0 to 0.5 px residual at the end of `ease-out` differed every time, and two consecutive exact matches at zero tolerance did not hold even in 32 tries. The "#120c r0 word-rectangle y swings by at most 1.71 px" is the same phenomenon. The diff-log measurement. All 31 pairs disagree. The fields that moved are only the four `plate.y`, `plate.bottom`, `line[0].y`, and `line[0].bottom`. From try 1 to try 2 the move is -6.33 to -6.43 px (which is 0.18em).
- **Principle (added to §2.1).** **The CSS applied to the measurement root must be the same set as the CSS applied to the raster band** (measurement equals the geometry that is rasterized, guaranteed by construction). The implementation aligns measurement, probe, and both variants with `measureCss = CAPTION_WORD_FREEZE_CSS + settleCss`, and a static test fixes it ("caption measurement roots are frozen in the same settled state the raster uses"). No tolerance, rounding, or average was added.
- **Root-fix measurement.** On the fieldtest job, `captionMeasureAttempts = {count 3, p50 2, max 2}` (the theoretical floor), diffs 0, `captionLayoutMaxDeltaPx` 0, and the gpu 2-run mp4 SHA matches. The "does not converge in 32 tries" of §12.1 is, precisely, **high probability** (on the base it can also converge probabilistically).
- **The cap of 32 stays.** After the root-fix it settles in 2 tries, so the cap is effectively insurance. Lower it only after observing, separately, a condition where jitter remains.
- **Shape of `--dump-frames`.** Row order is top to bottom, the same rule as osr. Channel order stays the form the engine reads back natively (gpu is RGBA `raw/frame-N.rgba`, osr is BGRA `raw/frame-N.bgra`), and the extension says which. It is mutually exclusive with `--trap-readback`.
- **Receipt and provenance keys.** On fallback, `provenance.engine = "osr"`, `engine_fallback = { from: "gpu", reason }`, and **`provenance.gpu_failure_run`** (a project-relative path to the gpu failure run.json). capture puts the same contents on `capture.json.engine.fallback`.
- **capture's parity guard.** Against a receipt that render-cut fell back (`provenance.engine = "osr"`), if the capture side resolved `"gpu"` but `engine_fallback.from` agrees, accept it as parity (without this, capture falls before it reaches the fallback. The existing fallback that comes from launcher tier 3 had the same hole, and it was closed at the same time).
- The judgment looks only at the structured `error.reasonCode` (a message-string match does not fire it).

### 12.7 Relation to §9 (#120h "demote and run to completion"). Control-tower ruling (2026-08-30, at the r3 join)

- **Fact.** #120h (the §9 append) **demotes a unit whose measurement does not converge to a sprite and runs the export to completion** (the word animation is dropped, and it is counted on receipt `captionStartup.measure.degradedUnits`). §12.3 requires "`auto` falls back to osr, and an explicit `gpu` fails closed". The r3 join kept both by splitting them into **instability that comes from measurement equals demotion (§9), and the fault injection `AKARI_GPU_CAPTION_MEASURE_FAULT` propagates `caption-measure-unstable`, so `auto` falls back to osr and an explicit `gpu` fails closed (§12.3)**. The injection is a stand-in for a measurement failure that cannot be recovered. It is no longer a switch that hits the demotion path.
- **Ruling (v0).** **Take this split.** By the root-fix (§12.6), instability that comes from measurement converges in 2 tries, the theoretical floor, and the demotion path is insurance. When a demotion happens, a warning and `degradedUnits` record it **without staying silent** (this does not contradict §2.1 "do not hide jitter").
- **A candidate for the next version (separate ticket D, small).** Rule whether a run that reaches `degradedUnits > 0` under `auto` should choose "run to completion accurately on osr" over "run to completion as an approximation". If that is taken, treat the demotion as something like `FALLBACK_REASONS` (for example `caption-measure-degraded`) and send only `auto` to osr. An explicit `gpu` stays demotion plus a warning. An injection mode that hits the demotion path on a real machine (for example a value suffix that selects demotion) is the same ticket.
- The measurement settle implementation is unified on #120h's **`measureSettleCss` scoped to `.akari-measure-root`** (it meets the §12.6 principle, and it does not stop animation of the whole page). A stable result reused by `contentKey` includes `cssVariants` in the key, so it was always measured in the settled state (confirmed on a machine).
