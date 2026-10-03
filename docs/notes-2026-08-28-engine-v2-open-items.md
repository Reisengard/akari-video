**English** | [Japanese](./notes-2026-08-28-engine-v2-open-items.ja.md)

# Open items for engine v2

Updated: 2026-08-28

## 1. Where this list sits

This is the list of technical items that remain public after engine v2 was folded into golden-frame acceptance. It is not a list of exceptions that weaken the current pass rule. Each item closes on its own. It meets its own completion condition, and the contract and the acceptance check are updated in the same change.

## 2. Machines and platforms

### #14 OSR on a Windows machine

- On a Windows machine, run OSR through sequential capture, encode, audio mux, and the final compare.
- For software rendering, two runs match on SHA-256 for every frame. For the GPU, record the match rate of two runs on the same machine as a diagnostic value.
- Do not require a GPU result that is byte-exact across different machines. Use the on-device result to decide whether OSR can be the default on Windows.

### A real Theia boot of `--render`

- Start `--render` from packaged Theia and Electron. On that real boot, check OSR storage, the exit code, and handoff of the artifacts.
- A direct launch during development is not enough to call the item a pass.

### Software-render assumptions, and a verification environment that can hold them

- A measurement on 2026-08-28 fixed the cause. The failure is not a macOS-only condition, and it is not a regression on the decoder side. It comes from a per-worktree difference in the Electron-bundled `libffmpeg.dylib`. `npm run build` in `apps/shell` has a known side effect. It replaces that library with the non-proprietary build through `@theia/ffmpeg`.
- The replacement is 1,203,568 bytes and does not contain the string `H264 Decoder`. Under SwiftShader, or with `AKARI_OSR_SOFT=1`, `VideoDecoder.configure()` fails for every requested config. GPU rendering uses VideoToolbox, so the replacement does not affect it. `VideoDecoder.isConfigSupported()` still returns `true` for `prefer-software` on the replacement, so do not use that call as the check.
- In verification and in CI, decide by machine that `libffmpeg.dylib` is the stock build. The stock build contains the string `H264 Decoder`, is 2,160,944 bytes, and has SHA-256 `5651a2ba1e9d2a57a9dc684729bff4cfb9460ed8be64aed74e8025ba8c12de9f`. If the check finds the replacement, name the cause and how to restore the stock build, then fail closed.
- Detail is in section 11.3, "Software-render assumptions", of the [OSR export contract](./contract-2026-08-28-osr-export-v0.md). This branch does not have section 11.3 yet. The section appears in that file after it merges to public main.
- Do not build `apps/shell` in a worktree used only for verification. If you did build it, put the stock build back. Do not use a tree whose shell has already been built when you accept software rendering. CI runs acceptance on the stock build from immediately after `npm ci`.

## 3. Decode, determinism, and performance

### #16 Non-sequential seek and determinism

- Define a method whose finished picture does not depend on history, even after non-sequential seek, chunk splits, and parallel work are added.
- The candidates are a fixed warm-up history from the start or from a sync point, and an independent golden acceptance of the finished picture.
- Do not silently extend the byte-exact rule from two sequential runs to the non-sequential case.

### #70 WebCodecs decode read-ahead

- Set the warm-up and lookahead caps for a given GOP distance, the cache discard rule, and the memory cap on a long duration.
- Keep the current baselines as the regression baselines. They are `test:seek requestCount = 94`, `bFrame.rows = 720`, and `performance.lookahead.hits = 8`.

### #70 Backpressure on stdin

- When raw BGRA is passed to the encoder on stdin, honor the return value of `write()` and honor `drain`.
- Treat these as failures. The producer runs ahead with no limit. The run is treated as a success before the pipe ends. Frames at the end are missing.

### Remove the GPU-to-CPU round trip

- Stop reading a GPU composite back to raw BGRA on the CPU and then handing that buffer to the encoder again.
- Look for a future WebCodecs `VideoEncoder` path that takes a GPU surface directly. Set acceptance separately for color space, timestamps, B frames, audio mux, and determinism.

## 4. OSR isolation and how exact acceptance is

### Isolate storage for each OSR Electron

- Give each OSR that runs at the same time its own user data, origin, and OPFS, so fixtures and intermediate state do not collide.
- Run two renders in parallel. Accept the setup only when they do not touch each other's frames, manifest, or shutdown.

### Remove the one-frame lag in verify

- Line up the capture-request time, the DOM commit, the end of GPU raster, and the raw BGRA read on the same frame number.
- Keep the current matte-sync baseline of `300` frames and `0` mismatches. Remove the implicit `+1 frame` that was used as a correction.

### Move render-cut verify from plus or minus 3 to plus or minus 0 on OSR

- Do not carry the legacy frame tolerance of plus or minus 3 into the OSR exit.
- OSR passes only when the requested frame number and the captured frame number match at plus or minus 0. A mismatch is a failure.

## 5. Separate tickets for picture treatment and for audio

### Turn the three screen effects into deterministic kernels

- Make `noise`, `particles`, and `flare` evaluable from the same time, the same seed, and the same color space.
- For each of the three, add a positive point at a fixed time and a negative point that changes 1 px. Remove the approximation only after those points exist.

### Bring still-image cuts into the v2 container, and retire the img branch

- Evaluate a still image as a frame-engine source. Do not depend on switching the compatibility `<video>` container over to `<img>`.
- Add framing, transform, freeze, a run of seeks, and the boundary with a video cut to the golden set. Retire the branch only after those cases are in the set.

### One shared envelope for ducking

- Done under the 2026-09-02 contract. The fixed rectangle and `sidechaincompress` are gone. Depth, the target, the narration key, the speech key, attack, and release now live in one shared deterministic envelope.

## 6. Legacy retirement, #100b

Leave the legacy composite path, both code and tests, in place through the compatibility period. Move on to deletion when either condition below is true.

1. OSR passes on a Windows machine under #14.
2. The owner decides that OSR is the default on Windows too.

After a condition is met, inventory every reference. The inventory covers legacy engine selection, ffmpeg filtergraph compositing, the compatibility `<video>` preview, and the dedicated acceptance. Before a condition is met, do not delete that code, do not make it unreachable, and do not disable its tests.
