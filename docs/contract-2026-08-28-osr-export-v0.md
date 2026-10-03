**English** | [Japanese](./contract-2026-08-28-osr-export-v0.ja.md)

# Whole-page OSR export contract v0

## 1. Scope

This contract defines the picture page that `render-cut --engine osr` builds, and the protocol that drives that page with Electron offscreen rendering.

**Revised 2026-09-01.** The default of `--engine` is `auto`, and every platform resolves it with the same rule. `legacy` is abolished. OSR launcher tier 3 is an explicit error.

| platform | `auto` resolution | Note |
|---|---|---|
| darwin | `gpu` when eligible, otherwise `osr` | No GPU executable means OSR. No OSR executable means an error. |
| win32 | `gpu` when eligible, otherwise `osr` | No GPU executable means OSR. No OSR executable means an error. |
| linux | `gpu` when eligible, otherwise `osr` | No GPU executable means OSR. No OSR executable means an error. |

Provenance in `.akari/render.json` records the requested value as `engine_requested` and the resolved run as `engine`. When the OSR launcher is tier 3, show how to obtain Electron (the app bundle, `npm install electron`, or `AKARI_OSR_ELECTRON`), stop with exit 2, and do not write `render.json` or `engine_fallback`. `engine_fallback` has only one shape, gpu to osr. After `auto` resolves to `gpu`, if that launcher is tier 3, record `{ from: "gpu", reason: <launcher.reason> }`.

## 2. Page contract

The page is output width `W` and picture height `H`, plus one verification row, so `W` by `(H + 1)`. The picture region stacks four layers from bottom to top.

1. The frame-engine canvas. It evaluates cuts, layers, transition, matte, and LUT.
2. DOM captions generated from `captions.json`.
3. Free HTML from `edit.json`.
4. The Three.js canvas inside the free HTML.

Captions, free HTML, and 3D sit on the canvas as a transparent same-origin iframe, produced by the same overlay-sheet generator as render-cut. Invalid tracks never enter the DOM. The DOM is not rebuilt per active span.

The page exposes these APIs.

- `window.__akariReady`. A Promise for fonts, images, video, 3D, and frame-engine prime.
- `window.__akariSeek(seconds, frameNumber)`. Completes, in order, frame-engine evaluation, the overlay-sheet seek, the stamp update, and two `requestAnimationFrame` waits.
- `window.__akariSettle()`. Advances two `requestAnimationFrame` frames when verification disagrees.

CSS animation is paused, and `currentTime` is set to the composite time. Three.js draws at the local time of the span. Video elements wait until the presented frame is fixed. `frameNumber` is passed from main. It is not recomputed from seconds.

On each seek, the overlay sheet sets `data-akari-active` on the free-HTML container of the active span and removes it when the span is inactive. `#stage` keeps `data-no-timeline` for compatibility. A fragment that uses either firing gate stays on the same timeline time under OSR.

## 3. Stamp row

The bottom row encodes frame number `n mod 65536` as follows.

```text
R = n & 255
G = (n >> 8) & 255
B = 0x55
A = 255
```

In a BGRA bitmap that is `[0x55, G, R, 255]`. Decode the left, center, and right pixels, and require all three to match the expected number. After the check, strip the bottom row with `buffer.subarray(0, W * H * 4)` before handing the buffer to ffmpeg.

`--verify stamp|hash|off` exists. The default is `stamp`. For `hash`, if the SHA-256 matches the previous picture region, recapture after settle. The cap is 8 times and `OSR_STAMP_RETRY_BUDGET_MS`. Do not stretch the wait. If a still image hits the cap, record the ambiguous count and accept it. `off` is for comparison measurement. Do not disable verify on a normal export.

## 4. Drive protocol

Each frame is processed in this order.

```text
seek -> ready -> invalidate -> paint -> verify -> write
```

If `paint` does not arrive within the default 10 seconds, record a failure. The bitmap must be `W` by `(H + 1)`. On a mismatch, settle and `invalidate` again, and stop at 8 attempts.

BGRA of the picture region goes to a bounded queue whose default depth is 3. If ffmpeg stdin `write()` returns false, always wait for `drain`. An unbounded pre-buffer is forbidden. v0 evaluates sequential frames with 1 worker from the start to the end.

`run.json` records p50 and p95 of seek, paint, toBitmap, verify, and write, a median every 1000 frames, `driftRatio` at the head and the tail, paint timeout, verify retry, the pre-verify delta histogram, backpressure, memory, and the ffprobe result.

**Appended 2026-09-28 (#113 / #88).** A stamp retry fails at the earlier of a 3000 ms time budget or 32 attempts. From the second try, wait an extra 16, 32, 64, and so on, up to 500 ms, before settle. Measured under concurrency, 1 retry is about 33 to 40 ms. Even with 2 to 3 concurrent runs, retries stay at most 2, and the mean per frame is 212 to 312 ms. The old fixed cap of 8 gave up in about 0.3 seconds, so 3 seconds is about 10 times the mean frame while concurrent. The failure text keeps the old prefix, then the stamp value that was read and its class, the active overlays and CSS features, the budget, and how to rerun. `run.json` records `verify.budget` and `verify.retryElapsedMs` on both completion and failure. `verify.failure` is recorded only on a stamp failure.

## 5. LUT

The `output.look` LUT is applied by `sampler3D` inside the frame-engine canvas. Do not put a CSS filter on the whole page. Captions, free HTML, and 3D stay outside the LUT. Only the video canvas is color-converted.

## 6. Electron host

Launch resolves in three tiers.

1. Reuse the installed AKARI Video Electron executable with `--render`.
2. Use the npm `optionalDependency` `electron`. Check that the two license files in `dist`, the version, and the platform executable are all present.
3. If Electron is missing, warn and fall back to the current render-cut path.

Tiers 1 and 2 both pass `--force-device-scale-factor=1`, `--force-color-profile=srgb`, and the background-throttling disable switch on the real process command line. npm Electron keeps the script path at `argv[1]` and puts Chromium switches after it. Soft draw also passes the GPU-disable and SwiftShader switches.

Tiers 1 and 2 both pass `--user-data-dir`, separate from the app's single-instance lock (per `userData`). The default is a short unique directory that `launchElectronExport` creates per export with `mkdtemp("akari-osr-")` under `os.tmpdir()`, deleted in `finally` after the child `close`. If the caller passes `userDataDir`, use it, and do not create or delete it. Export can run while the app is running. If the child exits 0 without producing output, the launcher treats it as failure. **Revised 2026-09-28 (#114).** Putting the directory next to the output made the project path plus the Chromium cache exceed Windows `MAX_PATH`, and cache-create errors went to stderr.

**Temporary per-app GPU preference on Windows (appended 2026-09-01, §11.7).** When `platform === "win32"` and the draw is not soft, tiers 1 and 2, at the shared spawn point `launchElectronExport` (gpu and osr), write `HKCU\Software\Microsoft\DirectX\UserGpuPreferences` immediately before spawn. The value name is the executable full path normalized with `path.win32.resolve`, and the `REG_SZ` data is `GpuPreference=2;`. Under `auto` this write happens only for the GPU exit (`options.exit === "gpu"`, gpu-export `electron-main`). Under `force` it also happens for the OSR exit. After the child `close` (any exit code, and on a spawn error), `finally` always restores exactly once. Delete the value if it was absent. Restore the old value if it was present. Policy resolves in order: the caller's `gpuPreference`, then env `AKARI_EXPORT_GPU_PREFERENCE`, then `auto`. `auto` does not silently overwrite a value the user set explicitly (`GpuPreference=1;` and similar). Only `force` overwrites and restores. Before writing, place the sidecar `<AKARI_HOME ?? ~/.akari>/gpu-preference-override.json`, and delete it after restore. At the start of every call, `launchElectronExport` restores a leftover sidecar first. The record is the return value `gpuPreference` (including `exit`) and receipt `provenance.gpu_preference`. The reason the OSR exit is excluded under `auto` is §11.7 (revised 2026-09-02). Other operating systems are a byte-identical no-op (the record keeps only `reason: platform`). For development, `AKARI_EXPORT_ALLOW_DESKTOP=0` drops tier 1 (the installed app) from the candidates. An explicit `allowDesktop` argument beats the env var.

`--render` is caught by `package.json` `main` (`electron-entry.js`) before Theia. It does not start the backend fork, the initial window, a contribution, or the single-instance lock. It goes straight to the runtime named by `--akari-main` (default `osr-export`, and `gpu-export` is also allowed), so no splash is shown. A normal launch without `--render` still starts Theia.

Linux v0 uses tier 3. A future seat between tier 1 and tier 2 may add a Chrome headless launcher that uses `HeadlessExperimental.beginFrame`. This contract does not implement it.

## 7. Encode, audio, and check

The ffmpeg input is `-f rawvideo -pixel_format bgra -video_size WxH -framerate fps -i -`. Quality and encoder use render-cut's `master|high|standard|light` and `auto|videotoolbox|x264`. Video is compressed to H.264 for one generation only. Later audio processing and mux copy the video.

The ffprobe timeout is `max(120000, frames * 100)` ms. Match duration, frame count, and resolution to the plan.

## 8. Memory and long duration

- GPU draw warning line: 768 MiB per export. Hard stop: 1,024 MiB per export (1080p baseline).
- Soft draw (SwiftShader) reaches about 1.1 GiB at 1080p, so it uses a separate frame. Warning 1,536 MiB, hard stop 2,048 MiB.
- The default hard stop is "resolution scale, plus 25% of physical memory as a floor and 50% as a cap" (one formula shared by gpu and soft). `hard stop = min(max(baseline * pixel ratio, floor(totalmem * 0.25)), floor(totalmem * 0.5))`, in MiB. The pixel ratio rounds up. The floor and the cap round down.
  - When the output pixel count exceeds 1080p (1920 by 1080), scale the baseline by that ratio (4K is 4 times). The warning scales by the same ratio.
  - 25% of physical memory is the floor, always, regardless of resolution. A 15.7 GB machine goes to 4,021 MiB. An 8 GB machine goes to 2,048 MiB. A 7 GB runner goes to 1,792 MiB. When the floor applies, set the warning to 75% of the hard stop and record `memory.machine_floor: true` on the receipt. When the value equals the baseline, record false.
  - 50% of physical memory is the cap. When the scaled value exceeds it, clamp, and put the warning at 75% of the hard stop (`memory.machine_capped`). Floor is always less than cap by the ratio. Only the scale side is clamped by the cap.
  - `memory` on the receipt and on `run.json` records `budget_scale`, `machine_floor`, `machine_capped`, and `total_memory_bytes` (physical memory).
  - Revised 2026-09-01 (resolution scale plus the 50% cap). Same-day supplement. Even at 720p or 1080p output, RSS grew with the size of the input footage (long 4K HEVC, several files) and hit the fixed 1 GiB (issue #28). The rule "defaults at or below 1080p do not change by machine" was withdrawn, and the floor was added. The 4K coefficient is a prediction and is uncalibrated. Calibrate it on the first measured peak.
- `AKARI_OSR_MEMORY_WARN_MIB` and `AKARI_OSR_MEMORY_HARD_STOP_MIB` can override to a positive integer MiB. The override is absolute. It does not take the scale, the floor, or the cap. Applied values require warning less than hard stop. If only the hard stop is overridden and the default warning is at or above it, follow the warning to 75% of the hard stop. The GPU direct exit (gpu-export) reads the same variables.
- Export is strictly forward and does not reread past frames, so a decoder session for a cut that has left the evaluation plan is released (`StreamReaper`). frame-engine collects `streamId` from `plan.base` and `plan.layers` and drops those past 1 second of grace after the last used frame via `LookaheadFrameSource.releaseStream`. Without release, one session per cut stacks to the end, RSS grows monotonically, and a longer job hits the hard stop later (added 2026-09-04, issue #52). A machine report of 244 seconds and 7,320 frames was at the 98% point with RSS 4.01 GB. An outgoing cut during a transition stays on the plan, so it stays.
- `memory.decoderSessions` on the receipt and on `run.json` records the live session count (`live`) and the cumulative releases (`released`). RSS is proportional to the session count, so a later ramp can be matched against the record (same issue #52). At the time of #28 the proportion was known, but there was no record, and a recurrence meant probing by hand again.
- A GPU direct-exit failure that hits the hard stop uses reasonCode `memory-hard-stop`. With `--engine auto` it reruns on OSR to completion (`FALLBACK_REASONS`, same issue #52). Until then the result was zero artifacts, a regression versus the previous version that could export. An explicit `--engine gpu` stays fail-closed.
- The parallel budget of 1 worker = 1 GiB is a GPU-assumption value. The v0 worker count is 1.
- Record RSS every 10 seconds, including after the window is destroyed.
- Do not regenerate the page every fixed N frames. Regeneration is allowed only at a page boundary, a renderer crash, or watchdog recovery.

A non-sequential seek can change draw history, so chunking and parallelism do not coexist with byte-reproduction mode. A future introduction needs a warm-up history from the start, or a separate acceptance of the finished picture.

## 9. Acceptance

Finished-picture acceptance is unified into the [engine v2 parity contract](./contract-2026-08-02-preview-parity.md) §4. frame-engine requires a golden all-points `diff 0`. OSR requires the soft-draw two runs in this section, with an all-frame SHA-256 match. GPU records the same-machine match rate as a diagnostic and does not make byte-exact a pass or fail.

CI requires an all-frame SHA-256 match for two sequential soft-draw runs. The product defaults to GPU and records the same-machine two-run match rate, `differingPixels`, and `maxDelta` as diagnostics. GPU byte-exact is not pass or fail. Diff investigation uses the raw BGRA captured at the time, not an image redecoded from H.264.

Comparison with legacy records MAD and `differingPixels` at each specified time for captions, free HTML, and 3D.

OSR warm-up immediately after launch (§11.8) must not affect output, and that is part of acceptance. On the same fixture and the same GPU, `frameHashes` of a run with `warm_up.empty_attempts > 0` and a run with `0` (or, if there is no zero run, several runs on the same GPU) match SHA-256 on every frame (appended 2026-09-02). Between iGPU and dGPU the frames do not match, because of GPU-dependent rounding, so compare only inside the same GPU.

## 10. Intermediate rules the OSR path does not use

The OSR path does not use any of the following.

- An alpha intermediate video.
- A PNG sequence.
- An ffmpeg overlay.
- A second video encode.
- A separate 3D capture.
- A DOM rebuild of captions per active span.
- Dropping duplicate still frames.
- Page regeneration every fixed N frames.

## 11. Known limits

### 11.1 B-frame reorder delay (revised 2026-08-28, root-fixed)

The reorder delay of B-frame footage that starts with a negative DTS was root-fixed on main `b30057de` by correcting `elst.media_time`. Even footage with `has_b_frames=2` is evaluated with presentation time aligned to the edit-list media time, so the old constant shift of 2 frames early does not remain.

### 11.2 Full-frame pixel difference versus legacy

Comparing the same raw BGRA, against the bt601 conversion ffmpeg uses by default for untagged footage, MAD was 9.28 and maxDelta was 155. Against bt709, MAD was 0.886. The residual is chroma interpolation. The engine composites at `bt709-limited`. **G3 ruling (2026-08-28).** v2 `bt709-limited` is canonical, and legacy's bt601 side is treated as an approximation.

On a fixture whose base is a solid color, comparing the final MP4 of legacy and OSR gave MAD 0.019 to 0.345 and maxDelta 7 to 78. Captions, free HTML, and 3D drawing match. The main cause of the full-frame difference is the base video's YUV to RGB conversion. Match the overlay layers on a solid-color base.

### 11.3 Soft-draw premise (appended 2026-08-28)

Soft draw (`AKARI_OSR_SOFT=1`) assumes the Electron-bundled `libffmpeg.dylib` contains an H.264 decoder. The `apps/shell` build replaces it with the non-proprietary build via `@theia/ffmpeg`, so in a built work tree soft-draw `VideoDecoder.configure` fails for every config. GPU draw uses VideoToolbox, so it is unaffected. The soft-draw diff-0 condition holds only under this premise. Judge by whether `libffmpeg.dylib` contains the string `H264 Decoder`. `isConfigSupported()` returns true even on the replaced build, so it is not reliable.

### 11.4 Tier 1 while the app is running (root-fixed 2026-08-28)

Before v0.1.24, Theia's `singleInstance` made a child started as tier 1, while the AKARI Video desktop app was running, exit 0 with no output. The launcher did not inspect output, so later this failure masqueraded as ffmpeg `ENOENT`. It was root-fixed by separating `userData` per run and treating exit 0 with no output as failure. The Windows electron-builder NSIS per-user default install path is `%LOCALAPPDATA%\Programs\@akari-videoshell`.

In v0.1.25, when the contribution method hit a missing bundled runtime, an in-startup `app.exit(1)` masqueraded as `SIGTRAP` or Windows `0x80000003`. Even with the bundle complete, Theia's quit that starts from `window-all-closed` could race the OSR runtime's window creation. On 2026-08-29 the move to `electron-entry.js` caught `--render` before Theia starts and removed that race.

### 11.5 Installed-app tier 1 crashes by racing startup (appended 2026-08-29)

Demonstrated on a real v0.1.26 build (signing on, unmodified). Launching installed AKARI Video with `--render`, the `akari-osr-export` contribution destroys the initial window, then Theia's `handleMainCommand` to `openDefaultWindow` calls `loadURL` on the destroyed window and throws `TypeError: Object has been destroyed` (unhandled rejection), then a V8 fatal, then `SIGTRAP` (exit 133 or Windows `0x80000003`), ending with 0 `PROGRESS` lines. This remains after the §11.4 single-instance fix. It is a structural race of the contribution method. It can also race `window-all-closed` to `app.quit()`. This path (the default tier-1 candidate) has not one receipt in fieldtest or acceptance, and it has never run.

Behavior from v0.1.27. `resolveOsrLauncher` (the product entry) drops the installed app from candidates by default (`allowInstalledDesktop: false`). An explicit `AKARI_OSR_ELECTRON` stays tier 1 as before. Packaged builds of that time with no npm Electron (tier 2) fell to tier 3, which was legacy, with a warning. Now there is no fallback to legacy. If OSR's Electron cannot be found, the export is refused. The root fix is an export-only Electron entry that catches `--render` before Theia (a separate ticket). Restore the default once that entry lands.

**Appended 2026-08-29 (root-fixed).** The export-only entry `apps/shell/electron-entry.js` landed (§6 and §11.4). The default of `resolveOsrLauncher` was restored, and the installed app is a tier-1 candidate again (v0.1.28 onward). `allowInstalledDesktop: false` remains an explicit opt-out.

### 11.6 The parent's `ELECTRON_RUN_AS_NODE` is inherited by the Electron child (appended 2026-08-29, #27)

Demonstrated on v0.1.28 machines (macOS Apple Silicon and Windows RTX 5060). The shell-distributed `akari` shim (`ELECTRON_RUN_AS_NODE=1 exec <bundled Electron> akari.mjs`), in-app export, and the partner CLI server set this variable in order to use the bundled Electron as node. `launchElectronExport` passed the parent's environment through, so tier-1 AKARI Video rejected Chromium switches as `bad option` and exited 9, and tier-2 npm Electron ran `electron-main.mjs` as plain Node, `app` was undefined, and both ended with 0 `PROGRESS` lines. The GPU exit (§12) shares the launcher, so it fails at the same time. This is a launch-environment problem exposed after §11.4 and §11.5 were fixed.

After the fix, `spawnAndWait` starts with the environment from `electronChildEnvironment(env)` (`ELECTRON_CHILD_ENV_BLOCKLIST = ["ELECTRON_RUN_AS_NODE"]`, compared case-insensitively to match Windows). Other variables (`AKARI_OSR_*`, `AKARI_FFMPEG_BIN`, `PATH`, and the rest) are still inherited. Do not adopt the idea of unsetting the variable on the shim side. A variable set outside the shim would survive, and guarding it uniformly on the export side is the only boundary.

### 11.7 On a Windows hybrid-GPU machine the export child lands on the iGPU (appended 2026-09-01)

Measured on a Windows 11 machine with RTX 5060 Laptop plus Intel UHD, launching a tier-2 `electron.exe` with no HKCU value (Electron 39.8.7 / Chromium 142) as a hidden `BrowserWindow` plus a `file://` page, and reading `app.getGPUInfo("complete")` and `VideoEncoder.isConfigSupported`.

| Launch | Active adapter (`gpuPreference`) | `prefer-hardware` 4K `avc1.640033` 3840 by 2160 at 30, 45 Mbps / 1080p `avc1.640028` 12 Mbps | `prefer-software` |
|---|---|---|---|
| Default (no switch) | Intel UHD Graphics (2) | **false / false** | true / true |
| `--force_high_performance_gpu` | NVIDIA GeForce RTX 5060 Laptop GPU (3) | **false / false** | true / true |
| `--use-adapter-luid=<RTX LUID in decimal>` | RTX (3) | **false / false** | true / true |
| HKCU `Software\Microsoft\DirectX\UserGpuPreferences`, value name = exe full path and `GpuPreference=2;`, written just before spawn and deleted after exit | RTX (2) | **true / true** | true / true |

Fact. Chromium switches put ANGLE and WebGL on the dGPU, but the Media Foundation H.264 encoder stays on the iGPU, so an in-process switch is impossible. Only the OS per-app GPU setting works, and it is evaluated at process creation, so writing just before spawn needs neither a reboot nor admin. Deleting restores the previous state. On product Windows the export child process is `AKARI Video.exe` itself (tier 1), and the value is per exe, so leaving it would put the app itself on the dGPU from the next launch (a laptop's battery). Temporary override plus restore is the right shape. Which GPU it landed on is known inside the child from `gpuDevice[]` (`vendorId`, `deviceId`, `deviceString`, `active`, `gpuPreference`). Intel UHD (driver 32.0.101.5972) has `prefer-hardware` false even at 1080p.

Ruling. Implementation is `packages/osr-export/src/gpu-preference.mjs`, `gpu-adapters.mjs`, and `packages/gpu-export/src/gpu-diagnostics.mjs`.

1. **Apply point (revised 2026-09-02, feedback-r1).** `launchElectronExport`, the shared spawn for gpu and osr. It runs only when `platform === "win32"` and `options.soft` is false. Other operating systems and soft are no-ops (record the reason only). **`auto` applies only to the GPU exit** (a launch that starts gpu-export's `electron-main`, which is export or capture. `launchGpuExport` passes `options.exit = "gpu"`). The OSR exit (osr-export `electron-main`, which is export or capture. `exportWithOsr` and `captureFramesWithOsr` pass `exit: "osr"`) does not write under `auto` (skip, reason `not-gpu-exit`) and writes only under `force` (restore after exit is the same). An unspecified `exit` is treated as `"osr"` (conservative).
2. **Policy value `gpuPreference`.** `"auto"` (default), `"off"`, or `"force"`. Resolve order is the caller's `options.gpuPreference`, then env `AKARI_EXPORT_GPU_PREFERENCE`, then `"auto"`. An illegal value throws a message that includes the allowed values. render-cut has `--gpu-preference auto|off|force`.
3. **Target exe** is `launcher.executable` normalized with `path.win32.resolve` (slash to backslash, the form the Windows Settings app writes). The registry is `HKCU\Software\Microsoft\DirectX\UserGpuPreferences`, the value name is the exe full path, and the `REG_SZ` data is `GpuPreference=2;`. Read and write by spawning `%SystemRoot%\System32\reg.exe` (`query`, `add ... /f`, `delete ... /f`) with `spawnSync`. No native module. No admin. `reg query` parses only the value portion (ASCII). The `registry` dependency `{ read, write, remove }` is injectable.
4. **The judgment is a pure function** `planGpuPreference({ platform, policy, soft, current, exit })` returning `{ action: "write" | "skip", value, restore, reason }`. Platform other than win32 skips with `platform`. Soft skips with `soft`. `off` skips with `policy-off`. **`auto` and exit other than gpu skips with `not-gpu-exit` (revised 2026-09-02).** `current === GpuPreference=2;` skips with `already-high-performance`. `current === null` writes and removes after exit. Any other current (`GpuPreference=1;` and similar): `auto` skips with `user-preference-respected` (do not silently overwrite the user's explicit setting), and `force` writes and restores `current` after exit. Four defensive skip reasons (each warns on stderr and continues the spawn; r0 accepted): `executable-missing` (the normalized exe does not exist), `registry-unavailable` (cannot spawn `reg query`), `sidecar-unavailable` (the sidecar cannot be written, so the registry is not written either), `write-failed` (`reg add` failed, delete the sidecar and continue).
5. **Order and restore.** Write, then spawn, then the child's `close` (any exit code, and on a spawn error), then `finally` always restores once. If restore fails, print `[gpu-preference] restore failed: ...` on stderr and record `restored: false` (do not throw).
6. **Crash tolerance.** Just before write, write the sidecar `<AKARI_HOME ?? ~/.akari>/gpu-preference-override.json` (`{ version: 1, executable, previous, written_at }`) and delete it after restore completes. If a sidecar exists at the start of every call, `launchElectronExport` restores it first (`previous` null means remove, otherwise write `previous`) and then continues (record `recovered_stale: true`). `AKARI_HOME` resolution is held locally as `env.AKARI_HOME || ~/.akari` (do not import akari-launcher).
7. **Records.** The `launchElectronExport` return value includes `gpuPreference: { platform, policy, exit, executable, applied, previous, restored, reason, recovered_stale }`. gpu and osr receipts include `provenance.gpu_preference` (snake_case: `applied`, `previous`, `restored`, `reason`, `recovered_stale`, `policy`, `exit`). The child, after `app.whenReady()`, cuts `app.getGPUInfo("complete")` at 3 seconds and records `gpuDevice` on `run.json` `gpu.devices` (`vendor_id`, `device_id`, `device_string`, `active`, `gpu_preference`) on both completed and failed, and on all four paths of export and capture. The one Japanese failure line on the GPU exit is owned by GPU contract §8.1.

**Basis for revising ruling 1 (2026-09-02, feedback-r1).** The OSR exit encodes with ffmpeg, so it does not need the dGPU. On RTX, the offscreen paint just after launch has a transient that returns an empty bitmap, and whether it fits inside `captureNonEmptyBitmap`'s cap of 8 splits per run (this implementation, 3 of 4 wins; pre-T5 code, 1 of 4 wins; about 10 failures in about 40 real renders run on tier 2; 0 on iGPU). Elapsed time is also RTX 17 to 19 s versus iGPU 17.3 s, so there is no benefit. Because exposing it is this feature, until the OSR warm-up fix (`paint-bitmap.mjs`, a separate task) lands, OSR keeps the iGPU as the default and writes only under `force`.

Out of scope. Theia's settings UI, a line in `akari doctor`, automatic OSR fallback when hardware is unavailable (keep GPU contract §12.3 fail-closed), and persisting the value (the user's setting is always restored).

### 11.8 Empty paint just after launch, and warm-up (appended 2026-09-02)

Measured on the same Windows 11 machine with RTX 5060 Laptop plus Intel UHD (Electron 39.8.7 / Chromium 142, tier-2 `electron.exe`, HKCU unchanged, so Intel), calling `exportWithOsr` directly on the same fixture (a copy of `templates/project-default` plus testsrc2 at 1280 by 720, 30 fps, 10 s, v2 `edit.json`). Control tower 2026-09-02. Pre-fix main `2db19275` / `82bbcb99` failed 8 of 8. The implementer, the same day, on pre-fix code, 17 direct calls plus 6 via render-cut, failed 23 of 23. The same shape on RTX. 26 failed real OSR renders of the updated installed app v0.1.32 are the same shape.

- The failure text is `frame 0: offscreen paint returned an empty bitmap 8 times`. `run.json` is `status: "failed"`, `emptyPaints: [{ frame: 0, attempts: 8 }]`, `paintTimeouts: []`, viewport `requested 1280x721 = measured`, `emulated: false` (the T5 resize and emulation path is not running), and it ends in 1.0 to 1.8 seconds.
- Mechanism. `capturePaint` is `webContents.invalidate()` then a wait for one `paint` event (timeout 10 s). `paint` arrives, but the image is 0 by 0 or the bitmap length is 0 (`readPaintBitmap` `empty: true`). The old `captureNonEmptyBitmap` only counted `maximumEmptyAttempts = 8` with `settle()` (`window.__akariSettle()`) between them and gave up within about 1 second. Both iGPU and dGPU have a transient where the compositor returns empty frames just after launch (on this machine, 12 to 15 times, about 0.4 to 0.5 seconds), and success splits on whether it fits in 8.
- Reusing `user-data-dir` is not the cause (a fresh directory still fails). Via render-cut (started after the cut phase) it passes more often, but it can still fail in the same shape.
- `frameHashes` and output of a successful run are deterministic (§9). Warm-up must not affect output.

Ruling. Implementation is `packages/osr-export/src/paint-bitmap.mjs`, `electron-main.mjs`, `receipt.mjs`, and `index.mjs`.

1. **Warm-up stage.** On both export and capture, immediately after `settleWindowViewport` and before the frame-0 seek, repeat `capturePaint` then `readPaintBitmap` until one non-empty bitmap is obtained (`settle` between them). Budget `OSR_WARM_UP_BUDGET_MS = 5000`. Record `run.json` `warm_up: { attempts, empty_attempts, elapsed_ms, satisfied }` on running, completed, and failed. Exceeding the budget is fail-closed with `offscreen paint warm-up: ${empty_attempts} empty paints over ${elapsed_ms} ms (GPU: ${active_device ?? "unknown"})`. Discard the warm-up bitmap. Frame 0 stays seek then capture, as before. The pure-function part is `warmUpOffscreenPaint({ capture, settle, readBitmap, budgetMs, now })` and does not depend on electron.
2. **`captureNonEmptyBitmap` becomes a time budget.** Add argument `emptyPaintBudgetMs` (default `2000`) and cap both it and `maximumEmptyAttempts` (the default `8` becomes `64`). Throw when either is reached. The time `settle` takes is inside the budget. The return value and `onEmpty(frame)` stay unchanged. The failure text is `frame ${frame}: offscreen paint returned an empty bitmap ${attempts} times over ${elapsedMs} ms (GPU: ${active_device ?? "unknown"})`. `active_device` is passed as a string by electron-main from the active entry of `run.json` `gpu.devices` (`summarizeGpuAdapters` in `gpu-adapters.mjs`). `paint-bitmap.mjs` stays free of electron.
3. **Records.** Extend `emptyPaints` elements to `{ frame, attempts, elapsed_ms }`. The meaning of the existing `attempts` is unchanged. `elapsed_ms` is elapsed from the start of the capture call, and stamp or hash retries of the same frame are added in. The receipt (`buildOsrReceipt({ warmUp })`) carries `warm_up` (snake_case, null if absent). `exportWithOsr` (`index.mjs`) passes `run.json` `warm_up` to `buildOsrReceipt`, and the receipt of `captureFramesWithOsr` (no `provenance` block) also lines up a normalized `warm_up` key (2026-09-02 r1; feedback-r1 added `index.mjs` and `test/index.test.mjs` to the ownership column). In render-cut's `.akari/render.json` it is `provenance.osr.warm_up`.
4. **Determinism.** Warm-up finishes before seek, so it does not affect `frameHashes` or output. Acceptance requires the same `frameHashes` between a run whose warm-up `empty_attempts` is greater than 0 and a run whose is 0 (or, if there is no zero run, several runs on the same GPU) (§9). Between iGPU and dGPU the frames do not match, because of GPU-dependent rounding (table L1-e), so compare inside the same GPU.
5. **The clock is injectable** (`now = () => performance.now()`) so a unit test can advance it. `settle` and `capture` stay injectable as before.

Measurement on 2026-09-02, implementer L1, same fixture, tier 2, a direct call equivalent to `AKARI_EXPORT_ALLOW_DESKTOP=0`, and render-cut.

| Run | Code | GPU it landed on | Result |
|---|---|---|---|
| L1-a `exportWithOsr` direct, 5 runs | Pre-fix (same paint path as main `82bbcb99`) | Intel UHD (`auto`) | **5 of 5 failed.** `emptyPaints [{ frame: 0, attempts: 8 }]`. Ended in 1.0 to 1.3 s. The same day's extra 12 direct calls and 6 render-cut runs also all failed. |
| L1-b direct, 10 runs in a row | After the fix | Intel UHD (`auto`) | **10 of 10 completed.** `warm_up` attempts 14 to 16, empty_attempts 13 to 15, elapsed_ms 461 to 510, satisfied. Frame loop `emptyPaints []`. Elapsed 17.6 to 23.5 s. |
| L1-c direct, 5 runs in a row | After the fix | NVIDIA RTX 5060 (`AKARI_EXPORT_GPU_PREFERENCE=force`) | **5 of 5 completed.** attempts 13 to 15, empty_attempts 12 to 14, elapsed_ms 399 to 469. `emptyPaints []`. 16.9 to 19.7 s. No HKCU value after the run. |
| L1-d render-cut `--engine osr`, 3 runs | After the fix | Intel UHD (`auto`) | **3 of 3** exit 0. Elapsed 22 / 18 / 20 s. ffprobe 1280 by 720, 30 fps, 300 frames, 10.000 s. `.akari/osr-run.json` `warm_up` empty_attempts 12 to 13, 418 to 434 ms. `emptyPaints []`. Receipt `provenance.osr.warm_up` was null in r0 (the wiring was outside the boundary). After r1 wiring, one run (exit 0, 21 s, 300 frames, 10.000 s) was `{ attempts: 12, empty_attempts: 11, elapsed_ms: 366, satisfied: true }` and matched `.akari/osr-run.json`. |
| L1-e determinism | After the fix | Intel 13 runs / RTX 5 runs | On the same GPU all 300 frames match SHA-256 (Intel is 10 direct plus 3 render-cut, empty_attempts 12 to 15; RTX is 5 runs, 12 to 14). A run with `empty_attempts = 0` does not appear on this machine. Intel versus RTX mismatches every frame, but mean PSNR is 48.2 dB (min 46.8) and MSE is 0.2 to 0.7, a GPU-dependent rounding difference. The warm-up discarded before seek is not the cause. |

Out of scope. Explaining the root cause of the empty paint (the compositor's startup transient), the gpu-export side, changing the paint timeout (10 s), and adding a retry on the render-cut side.

## 12. Shared boundary with the GPU direct exit (appended 2026-08-28)

[GPU direct export v0](./contract-2026-08-28-gpu-export-v0.md) reuses this contract's 3-tier launcher, static server, page-builder input resolution, memory guard, ffprobe, audio mux, and receipt vocabulary. Defaults of optional arguments keep this contract's OSR behavior. GPU-exit eligibility, the readback ban, mp4box direct mux, and fail-closed conditions are owned by the GPU contract and must not flow back into the OSR seek, paint, and stamp path. The darwin `auto` to `osr` in §1 is a description from before the GPU exit was added. Read it as the choice when GPU-contract eligibility is not met, or when the GPU launcher is unavailable. When eligible, `auto` to `gpu` prefers the GPU contract.

## 13. v2 cut-audio intermediates (appended 2026-08-29)

OSR-path video reads `edit.sources` directly on the page and does not use the video of `cut.mp4`. The cut stage therefore generates `cut-audio.mp4`, and when the duration must be extended it then generates `cut-audio-tail-padded.mp4`, and passes only the audio stream to the final mux. Both commands use `-vn` and do not decode, filter, or encode video. The semantics of audio trim, speed, freeze silence, transition, gap, and AAC 48 kHz match the old cut and tail-pad that included video. The legacy path still uses intermediates that include video. Audio input seeks on the input side per cut (`-ss` / `-t`), sets a 0.5 s lookahead guard at the head of the cut (for AAC overlap-add), and does not make the cut-stage cost depend on the footage length.
