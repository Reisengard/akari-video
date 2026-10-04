**English** | [Japanese](./contract-2026-08-11-analysis-vision-tracks-v0.ja.md)

---
lifecycle: draft
created: 2026-08-11
updated: 2026-08-14
---

# Analysis track contract v0. Vision landmark tracks (face-landmarks / hand-pose / body-pose-3d / face-expression) and keyframe consumption

- Date: 2026-08-11
- Status: **draft** (settle it together with the v0 implementation. A mismatch found in the implementation is resolved by appending).
- Depends on:
  - `contract-2026-07-17-data-contract-versioning.md` (the three rules: integer version, additive only, tolerant reader)
  - `contract-2026-07-23-analysis-person-matte.md` (Swift sidecar style, the analysis.json tracks contract, and how verification duties are split)
  - `contract-2026-07-25-project-structure-v0.md` (analysis sidecars live under `.akari/sidecars/`)
  - `contract-2026-08-02-preview-parity.md` (the render / Web / shell three-surface parity rule)
- Scope: the data contract for **landmark tracks** extracted from video (face, hand, and 3D body pose), the generator sidecar's input and output, how consumption (conversion into `layers[].keyframes`) is split, and the MediaPipe head-pose and expression tracks. **Do not build a new render mechanism.**

## 0. Design principles

1. **Analysis is pull-driven.** Do not analyze everything up front. When an effect is wanted, generate only the track kinds it needs and cache them in the sidecar.
2. **Analysis records facts. Staging is the consumer's job.** A track holds only the raw detection (coordinates and confidence). Smoothing, thinning, and turning values into staging parameters belong to the converter (the consumer). Another staging can be regenerated from the same track.
3. **Consumption is a conversion into an existing mechanism.** A track converts deterministically into `edit.json` `layers[].keyframes` (transform / perspective). Render, Web preview, and shell preview already share parity through the existing layers mechanism, so **this contract does not grow a new three-surface implementation** (this is the most important design choice in the contract).
4. **Provider-neutral.** The track format does not depend on what detected it. The v0 provider is Apple Vision framework (macOS) only, but a future provider (for example MediaPipe) emits the same format and only the `provider` field value changes.
5. **A capability that is not declared does not exist** (the same idea as avatar rendition and asset knobs). Analysis the environment cannot run makes `--check` return unavailable, honestly. Do not guess and run.

## 1. Additions to analysis.json (additive)

Add **3 optional keys** under `tracks`. Do **not** put them in `tracks.required` (speakers / faces / person_matte). person_matte is required because of an existing consumer. The new tracks are added as truly optional.

```jsonc
"tracks": {
  // ...existing keys...
  "face_landmarks": {            // optional. Absent means "not generated yet".
    "path": "vision/face-landmarks.json",   // relative to the directory that holds analysis.json
    "sample_fps": 24,
    "provider": "apple-vision",             // free string (do not force an enum)
    "tool": "vision-tracks.mjs v0",
    "generated_at": "2026-08-11T12:00:00Z"
  },
  "hand_pose": { /* same shape */ },
  "body_pose_3d": {             // optional. Vision 3D body pose on macOS 14+
    "path": "vision/body-pose-3d.json",
    "sample_fps": 24,
    "provider": "apple-vision",
    "tool": "vision-tracks.mjs v0",
    "generated_at": "2026-08-13T12:00:00Z"
  }
}
```

Additive 2026-08-14. Add `face_expression` in the same optional pointer shape. As with the existing 3 keys, do not put it in `tracks.required`. Not generated yet means the key is absent.

```jsonc
"face_expression": {
  "path": "vision/face-expression.json",
  "sample_fps": 24,
  "provider": "mediapipe-face-landmarker",
  "tool": "face-expression.mjs v0",
  "generated_at": "2026-08-14T12:00:00Z",
  "features": ["head-pose-ypr-radians", "mediapipe-blendshapes-52"]
}
```

## 2. Track file format (vision-tracks v0)

The JSON file that `path` points at. One file, one kind (face-landmarks, hand-pose, body-pose-3d, and face-expression are separate files).

```jsonc
{
  "version": 0,
  "kind": "face-landmarks",      // "face-landmarks" | "hand-pose" | "body-pose-3d"
  "source": { "path": "../..(relative to the source video)", "duration": 12.5 },
  "sample_fps": 24,
  "provider": { "name": "apple-vision", "os": "macOS 15.5" },
  "samples": [
    { "t": 0.0, "detections": [ /* §2.1 / §2.2 */ ] },
    { "t": 0.0417, "detections": [] }     // a frame with zero detections still keeps t (a gap is not the same as no detection)
  ]
}
```

- **Image coordinate system (the most important rule).** face-landmarks, hand-pose, and the `projection` of body-pose-3d are all **normalized 0 to 1, origin at the top left** (the same orientation as video pixels). Vision framework returns a bottom-left origin, so **the y flip is the sidecar's job**. The consumer does not convert.
- Only `position` of body-pose-3d is not an image coordinate. Store the model coordinates Vision returns (meters relative to root/hip) without converting them (§2.4).
- `samples[].t` is seconds on the source video (the same time axis as `in` / `out`). Sampling is evenly spaced at `sample_fps`.
- Raw values only. Do not store smoothed or interpolated values. Always record confidence (`conf`) beside them.

### 2.1 face-landmarks detection

```jsonc
{
  "box": [x, y, w, h],           // face rectangle (normalized)
  "conf": 0.98,
  "landmarks": {                  // from VNFaceLandmarks2D. Keys are snake_case.
    "left_pupil": [x, y],
    "right_pupil": [x, y],
    "left_eye": [[x,y], ...],     // a region is a point list
    "right_eye": [[x,y], ...],
    "outer_lips": [[x,y], ...],
    "inner_lips": [[x,y], ...]
    // v0 requires the 6 keys above. Other VNFaceLandmarkRegion2D regions may be added (additive only).
  }
}
```

### 2.2 hand-pose detection

```jsonc
{
  "chirality": "left",           // "left" | "right" | "unknown"
  "conf": 0.95,
  "joints": {                     // snake_case of VNHumanHandPoseObservation.JointName
    "thumb_tip": [x, y],
    "index_tip": [x, y]
    // v0 requires thumb_tip and index_tip. The other 19 joints may be added (additive only).
    // A joint below the confidence threshold is omitted as a key (no invention. A missing joint is missing).
  }
}
```

### 2.3 Format detail (appended at v0 implementation, 2026-08-11)

Detail of §2 found in the implementation (`vision-tracks-helper.swift` / `vision-tracks.mjs`). Principles and the duty split do not change.

- **Coordinate clamp.** Vision framework can extrapolate a joint that is occluded or cut by the frame edge slightly outside the image (measured during the v0 implementation as `y = 1.0015984773635864`). To guarantee "all normalized 0 to 1" literally, the sidecar (the Swift helper) rounds the value to `[0, 1]` after the y flip, then writes it. The rounding is the same defense as person-matte-helper's alpha clamp (`min(max(value, 0), 255)`). It is not invention. It brings a value Vision itself returned back inside the contract range.
- **Omitting a face landmark at detection grain.** A hand joint may be omitted per key (§2.2). A face is different. Vision computes the 6 regions (2 pupils, 2 eyes, 2 lips) as one lump, so if landmark computation for a face detection fails (Vision did not return `landmarks`), the Swift helper drops that detection from `detections` **as a whole**. Do not keep a reduced shape of box and conf only (do not mix a detection into the output when the 6 required keys of §2.1 are incomplete). On a measured 26.3 second clip where one person stays mostly in frame, this exclusion was 0.

### 2.4 body-pose-3d detection (additive, 2026-08-13)

Store the 17 joints that `VNDetectHumanBodyPose3DRequest` revision 1 returns. The API is macOS 14+ only. The track is raw analysis. Do not smooth, thin, or drop low confidence.

```jsonc
{
  "conf": 0.86,
  "joints": {
    "root": {
      "position": [0.0, 0.0, 0.0],       // meters relative to root/hip
      "projection": [0.51, 0.63],        // normalized 0 to 1, origin at the top left
      "conf": 0.86
    },
    "right_hip": { /* same shape */ },
    "right_knee": { /* same shape */ },
    "right_ankle": { /* same shape */ },
    "left_hip": { /* same shape */ },
    "left_knee": { /* same shape */ },
    "left_ankle": { /* same shape */ },
    "spine": { /* same shape */ },
    "center_shoulder": { /* same shape */ },
    "center_head": { /* same shape */ },
    "top_head": { /* same shape */ },
    "left_shoulder": { /* same shape */ },
    "left_elbow": { /* same shape */ },
    "left_wrist": { /* same shape */ },
    "right_shoulder": { /* same shape */ },
    "right_elbow": { /* same shape */ },
    "right_wrist": { /* same shape */ }
  }
}
```

- `position`. The translation component `[x, y, z]` of `VNHumanBodyRecognizedPoint3D.position`. Vision model coordinates, relative to root/hip, in meters. Do not convert to camera-relative coordinates.
- `projection`. The image projection returned by `VNHumanBodyPose3DObservation.pointInImage`, y-flipped and clamped to `[0, 1]`, as `[x, y]`.
- `conf`. The Vision 3D API does not publish per-joint confidence, so apple-vision provider v0 copies `VNHumanBodyPose3DObservation.confidence` onto every joint. This is not a per-joint estimate. It states that the value comes from the whole observation's confidence. A consumer's `min-confidence` uses this value.
- An observation that cannot obtain any of the 17 joints from Vision is omitted as a whole detection. Do not interpolate or invent a missing joint. A frame with `detections: []` stays, together with time `t`.
- pose-skeleton v0 consumes only the first person of each frame (`bodyIndex=0` fixed). It does not support multiple people.

### 2.5 face-expression detection (additive, 2026-08-14)

Store `facialTransformationMatrixes` and the 52 blendshape categories that MediaPipe Face Landmarker returns, without smoothing or interpolation. One file, one kind. `kind` is `face-expression`. The analysis pointer is `tracks.face_expression`. The default file name is `vision/face-expression.json`. A frame with no face detected still stays as `{ "t": ..., "detections": [] }`.

```jsonc
{
  "head": {
    "yaw": 0.12,
    "pitch": -0.04,
    "roll": 0.02
  },
  "blendshapes": {
    "_neutral": 0.07,
    "eyeBlinkLeft": 0.01,
    "mouthSmileLeft": 0.64
    // All 52 fixed MediaPipe categories. Each value is a raw score in 0..1.
  },
  "conf": 0.64
}
```

- `head` is **radians**, from row-normalizing the top-left 3 by 3 of a 4 by 4 row-major homogeneous transform and decomposing `R = Rz(roll) * Ry(yaw) * Rx(pitch)`. The right-handed reading is +X = image right, +Y = image down, +Z = canonical face forward. Positive yaw faces screen right. Positive pitch looks up. Positive roll is clockwise. Gimbal lock is fixed at `roll=0`.
- `blendshapes` is MediaPipe's fixed 52 categories, including `_neutral`. Keys are the raw scores of the expressions, and only the order is normalized to name order so the bytes stay stable. Do not smooth, clamp, or turn values into emotion labels.
- The MediaPipe Web API does not publish its internal face-presence score on the result. `conf` is not an invented constant. It deterministically records the maximum of the 52 raw scores returned on the same detection, as a signal confidence. It is not face-detection confidence itself, so a consumer mainly uses presence versus absence and the individual blendshape values.
- v0 uses `numFaces=1`. It does not track multiple people or join person identity.

## 3. Sidecar (the generator)

The same split as person-matte. **The Swift helper only converts frames. The wrapper (`.mjs`) owns the container, the time, and the assembly.**

- Place: `skills/analyze-footage/bin/vision-tracks/`
  - `vision-tracks-helper.swift`. Raw BGRA frames on stdin, **JSON Lines on stdout (one line of detections per frame)**. Built on demand with `swiftc -O`. The binary is gitignored.
  - `vision-tracks.mjs`. `ffmpeg` (decode, and unify fps and width), then the helper, then assemble the track file, then append to `tracks` in `analysis.json` (atomic replace). `--kinds face,hand,body-pose-3d`, `--fps`, and `--check` (availability of macOS 14+, swiftc, and ffmpeg. Below macOS 14, refuse as a missing capability and give the reason).
- Runbook: `skills/analyze-footage/vision-tracks.md` (an optional step at the same rank as person-matte.md). Wire it into the run order and hard rules of `SKILL.md`.
- The agent starts it (the skill runbook calls it directly). It is not a CLI subcommand (a step that involves judgment stays a skill).

### 3.1 Headless Chromium generator for face-expression (additive, 2026-08-14)

`skills/analyze-footage/bin/face-expression/face-expression.mjs` is an independent generator only for face-expression. The existing Swift helper is unchanged. ffmpeg decodes to a PNG sequence at 24 fps (`--fps` can change it) and width at most 1280, then a Chrome for Testing plus `puppeteer-core` page runs the CPU/WASM Face Landmarker in order. Chrome search order, launch arguments, and pulling results after the page finishes follow the existing headless path of avatar-vrm.

The JS build was chosen because `@mediapipe/tasks-vision` is browser and WASM only, the product already has a headless Chromium path, and this adds neither a Python wheel nor a Swift helper as a new runtime. A fixed Chrome, a fixed WASM, the CPU delegate, and a fixed time input yield the same matrix decomposition and score sequence in the same environment. The Python build adds another install surface (an arm64 wheel) and version resolution, so v0 does not take it.

The model is not stored in the repository. Fetch it only on the first run. If `AKARI_HOME` is set, prefer it. The default is `~/.akari/models/mediapipe/face-landmarker/float16-1/face_landmarker.task`. An existing file is SHA-256 checked every time. On a mismatch, error immediately. Do not hide it by refetching over the file. A new fetch writes to `.tmp-<pid>`, then renames after verification.

- URL: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`
- SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`

The browser runtime vendors the files it needs from `@mediapipe/tasks-vision@0.10.17` with no transform, so network variation stays out. The license is Apache-2.0.

| artifact | SHA-256 |
|---|---|
| npm tarball | `d3dd0759295f1adcf5455f22aa652c58b8c1d537c0d14c8db7df78646011d523` |
| `vision_bundle.mjs` | `1ada13431ea2a8ed7ea449e6c3595122d43fea2a8a4788056ed7da271469b402` |
| `vision_wasm_internal.js` | `33a4125f825b343d2d9773951a73692f40bee368c9b591af8ff652fd501af90b` |
| `vision_wasm_internal.wasm` | `c88cf472dd5cab0a3954b071e5f442102ded3701dcccc987a7a02ee8f54aae85` |
| `vision_wasm_nosimd_internal.js` | `4e8d07dcf8cbb55b343cd76b7fc30d4303220f049d5529d6412f6f93296726a8` |
| `vision_wasm_nosimd_internal.wasm` | `f840f69d7229f89dedaed39c7ac7a52f0964a7cec02d6cb1ac9eff891db86dc2` |
| `LICENSE.txt` | `b070d77bfb2c52a1dd6996de0ce5f64c49a0ca55c889b163a963ddf5cb001ee2` |

> Note. Only `LICENSE.txt` is absent from the npm tarball (confirmed by expanding the tarball). The stock Apache-2.0 full text was added by hand (see `vendor/.../README-AKARI.md` for the source). Every other row is a real file from the tarball.

After `tar -xzf`, only the bundle and WASM files above are copied. There is no esbuild or other rebuild. The npm integrity of the tarball itself is `sha512-CZWV/q6TTe8ta61cZXjfnnHsfWIdFhms03M9T7Cnd5y2mdpylJM0rF1qRq+wsQVRMLz1OYPVEBU9ph2Bx8cxrg==`.

## 4. Consumption (the converter)

A **deterministic converter** writes the track into `edit.json`. v0 has 3 consumers (another contract may implement them, and the only input is the §2 format of this contract).

| Consumer | Input | Output |
|---|---|---|
| eye-bar (eye-line black bar) | face_landmarks (both pupils) | A black-bar layer plus `layers[].keyframes` transform (x/y/rotate/scale) |
| finger-frame | hand_pose (thumb_tip and index_tip of both hands, 4 points) | `layers[].keyframes` perspective of the target layer (4-corner pin) plus the active span |
| pose-skeleton | body_pose_3d (2D `projection` of the 17 joints) | A `kind: "baked"` layer of an alpha stick figure baked ahead of time |

Wiring `face_expression` into avatar drive is left to the next consumer contract. This contract stops at the generation source of truth. It does not change the existing five-vowel mouth shapes, avatar-vrm, or avatar-drive.

- Smoothing (moving average, One Euro, and similar), keyframe thinning, and gap interpolation are **the converter's job**. Parameters are converter arguments, and they stay deterministic.
- pose-skeleton resets smoothing state on a gap and on a cut boundary, and hides a bone that includes a low-confidence joint. It does not hold across a gap. It splits into another baked clip or layer.
- pose-skeleton v0 targets only the first person of each frame, with `bodyIndex=0` fixed. It does not support multiple people.
- The ffmpeg side of perspective keyframes rides the existing time-window split fallback (`expandLayerForPerspectiveKeyframes`). Do not build a new render path.
- Do **not** use `cuts[].fx` (that seat is a full-frame post effect. Spatial tracking belongs to the layer mechanism).

## 5. Verification duties

- Do **not** add a new validator CLI under `packages/schemas/bin/` (continue the split in person-matte contract §7). The track-file JSON Schema lives at `skills/analyze-footage/references/vision-tracks.schema.json`, and the skill runbook's jsonschema check owns it.
- Adding the 4 track keys to `analysis.schema.json` is additive only.
- **Update the lightweight check in `packages/analysis-report/render-analysis-report.mjs` at the same time** (do not repeat the "consumer follow-up debt" that person_matte left, on the new tracks).
- verify is L0 (`node --test` of the package or skill that applies). L1 and L2 are out of scope because the GUI is not touched.
- face-expression unit-tests schema wiring, the fixed 52 keys, Euler decomposition agreement on the same matrix, and SHA-256 mismatch refusal for both a cached file and a downloaded file on first model placement. Detection rate, CPU time, and realtime ratio on real footage are recorded separately in a fieldtest 12 second window. Do not invent those values and write them into this contract ahead of the measurement.

## 6. Out of scope for v0

- Emotion, laughter, and audio-event analysis (SoundAnalysis). Another contract.
- Automatic reframing (saliency) and an aesthetic score. Another contract.
- Cloud execution, and a provider implementation outside macOS (keep only the format provider-neutral).
- A mechanism that makes `edit.json` reference a track file directly (consumption goes through the converter only. Do not bring "an effect depends on analysis" into the schema).
