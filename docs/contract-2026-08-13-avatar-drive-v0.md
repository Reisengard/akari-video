**English** | [Japanese](./contract-2026-08-13-avatar-drive-v0.ja.md)

---
lifecycle: stable
created: 2026-08-13
updated: 2026-08-13
---

# 2D avatar difference-sprite drive contract v0 (avatar-drive)

- Date: 2026-08-13
- Status: **v0 implemented**
- Depends on: `contract-2026-07-13-m1-m4.md` (`layers[]` and the output coordinate system), `contract-2026-07-22-prerender-rail-and-assets.md` (`kind: "baked"`), `contract-2026-07-26-avatar-registry-v0.md` (the future rendition resolution target)
- Scope: a converter that pre-bakes a 3-state mouth from audio RMS, and a deterministic procedural blink, into a small alpha clip. Expression estimation from the picture, and registry resolution, are out of scope.

## 1. Input, output, and duties

`packages/akari-tools/bin/avatar-drive.mjs <project> --sprites <dir>` reads `<project>/edit.json` and the source audio, and generates a ProRes 4444 MOV at the sprite's own resolution and at edit.json's output fps, to `.akari/cache/avatar-drive/avatar-drive.mov`. It does not bake a full output frame.

stdout is always one JSON line. On success it includes the following.

```jsonc
{
  "ok": true,
  "layers": [
    {
      "id": "avatar-drive-0",
      "t": 0,
      "duration": 12,
      "kind": "baked",
      "src": ".akari/cache/avatar-drive/avatar-drive.mov",
      "transform": { "x": 472, "y": 184, "scale": 1, "rotate": 0 },
      "preset": "avatar-drive-v0",
      "params": { "position": "right-bottom" }
    }
  ],
  "drive": {
    "mouth": ["closed", "mid", "open"],
    "eyes": ["open", "open", "closed"],
    "blink_seed": 123456789
  }
}
```

- One element of `drive.mouth[]` and of `drive.eyes[]` is one output frame.
- `--apply` appends exactly one generated layer at the end of the existing `layers[]`. Every existing field, and the order and values of existing layers, stay unchanged. If the same id already exists, do not overwrite. Fail.
- Source audio is the timeline audio that reflects cut order, `in` and `out`, and `speed`. Accept v0 `source` and v1 `sources[]` / `cuts[].src`. Do not mix BGM, SFX, or narration into the drive.
- `--position` is `right-bottom` (default), `left-bottom`, `right-top`, `left-top`, `center`, or an anchor coordinate `x,y` whose origin is the top left of the output frame. `--scale` is a positive factor (default `1`). A named preset aligns the sprite's bounding box after scale inside the margin, and does not depend on the anchor in `sprite.json`. Only an explicit `x,y` pins the sprite's anchor point to that coordinate.

## 2. Sprite-set rules

One set is one directory and a `sprite.json` directly under it. Every referenced PNG shares the same transparent canvas. Composite in the order `base`, then the selected `mouth`, then the selected `eyes`.

```text
avatar-sprites/
  sprite.json
  base.png
  mouth-closed.png
  mouth-mid.png
  mouth-open.png
  eyes-open.png
  eyes-closed.png
```

```jsonc
{
  "version": 0,
  "size": { "width": 256, "height": 256 },
  "anchor": { "x": 0.5, "y": 1 },
  "base": "base.png",
  "mouth": {
    "closed": "mouth-closed.png",
    "mid": "mouth-mid.png",
    "open": "mouth-open.png"
  },
  "eyes": {
    "open": "eyes-open.png",
    "closed": "eyes-closed.png"
  }
}
```

| Field | Rule |
|---|---|
| `version` | The integer `0`. Only a breaking change is a reason to bump. |
| `size.width/height` | An integer px of 2 or more. It matches the real size of every referenced PNG. |
| `anchor.x/y` | Normalized coordinates with the canvas top left at `(0,0)` and the bottom right at `(1,1)`. Placement pins this point. |
| `base` | A directory-relative path to a transparent PNG. |
| `mouth.closed/mid/open` | The 3 mouth states. Directory-relative paths to transparent PNGs. |
| `eyes.open/closed` | The 2 eye states. Directory-relative paths to transparent PNGs. |

Refuse an absolute path, a `..` reference outside the directory, anything other than PNG, a missing file, and a size mismatch. Unknown fields, and extra keys under `mouth` or `eyes`, are ignored by a tolerant reader, so a future difference such as a smile, brows, a costume, or an extra mouth shape **can be added**. Do not change the meaning of an existing required key, and do not bump `version` because an extra difference was added.

## 3. Drive profile v0

ffmpeg decodes the source audio after cuts to mono float PCM (4,800 Hz) and extracts the RMS of each output frame. Smooth the RMS with attack and release, and decide `closed`, `mid`, or `open` with two thresholds and hysteresis.

| Knob | CLI | Default | Meaning |
|---|---|---:|---|
| mid threshold | `--mid-threshold` | `0.025` | The center RMS between closed and mid |
| open threshold | `--open-threshold` | `0.075` | The center RMS between mid and open |
| hysteresis | `--hysteresis` | `0.008` | The on/off gap of each threshold (half before and half after the center) |
| attack | `--attack-ms` | `35` | Time constant in ms when RMS rises |
| release | `--release-ms` | `120` | Time constant in ms when RMS falls |
| blink period | `--blink-period` | `4.2` | Mean start interval in seconds |
| period jitter | `--blink-jitter` | `1.2` | Uniform jitter added to the start interval, plus or minus seconds |
| closed-eye time | `--blink-duration` | `0.12` | One closed-eye duration in seconds |

Verify that `mid < open`, that hysteresis is less than the gap between the two thresholds, and that every time value is positive. The blink pseudo-random seed is derived with SHA-256 from the normalized edit.json, sprite.json, and drive profile. Do not use the wall clock, the OS random source, or a file mtime. The same input, the same knobs, and the same ffmpeg output make the mouth-state sequence, the blink sequence, the baked picture, and the stdout layer JSON deterministic.

## 4. Reserved sections (not implemented in v0)

### 4.1 Viseme drive

A future path selects a viseme from whisper word or phoneme alignment. When it is added, v0 `mouth.closed/mid/open` stays as the required fallback, and detailed mouth-shape keys are added.

The v1 vowel drive is a coarse version that splits a transcript word span evenly by mora count. A precise version that gets phoneme boundaries from forced alignment (MFA, or Japanese-specific Julius plus OpenJTalk) stays reserved.

### 4.2 Picture-driven expression

A path that selects eye, brow, mouth, and cheek differences from the 52 blendshapes of MediaPipe Face Landmarker is for a later version. This v0 does not use the picture as expression input. It uses only audio RMS and the procedural blink.

### 4.3 Avatar registry connection

The plan is to connect a rendition's lipsync capability and a sprite-set reference to the staging-engine connection that `contract-2026-07-26-avatar-registry-v0.md` reserves as a "future contract". **This v0 does not implement search or resolution of avatar.json or rendition.json.** The only input is a direct `--sprites <dir>`.

## 5. Verification rules

1. Convert the same RMS sequence twice, and the mouth-state sequence matches, including hysteresis and attack and release.
2. A blink sequence generated from the same seed, duration, and fps matches, and a different seed changes the sequence.
3. Verify every required key of sprite.json, the reference boundary, and the real PNG size. An unknown extra difference is accepted.
4. Compare the JSON before and after `--apply`, and confirm that everything except the end of `layers[]` is unchanged.
5. On real audio, `mid` or `open` appears in a speech span, `closed` appears in a silent span, and `eyes: closed` appears somewhere in the full duration.
6. Measure the baked MOV's alpha in frame pixels, and confirm the sprite's outer edge is `alpha=0`.

## 6. v1 append (2026-08-14). Six-state vowel drive

v1 keeps v0's 3 volume states as the default and the fallback, and additively adds a path that picks `closed`, `a`, `i`, `u`, `e`, or `o` from the transcript.

| `drive.mouth[]` | VRM 1.0 expression preset | PSDToolKit mouth difference |
|---|---|---|
| `closed` | `neutral` | hiragana n (U+3093) |
| `a` | `aa` | hiragana a (U+3042) |
| `i` | `ih` | hiragana i (U+3044) |
| `u` | `ou` | hiragana u (U+3046) |
| `e` | `ee` | hiragana e (U+3048) |
| `o` | `oh` | hiragana o (U+304A) |

The default of `--mouth-mode <volume|vowel>` is `volume`. `volume` still emits `closed`, `mid`, and `open`, and omitting the argument does not change the v0 output. `vowel` requires `--transcript <path>`, and `drive.mouth[]` emits only the 6 values in the table above. A sprite.json in this mode has every `mouth.a/i/u/e/o` PNG in addition to the previously required `mouth.closed/mid/open`.

Transcript times are in seconds. Each word is `{ "text": "...", "start": 0.12, "end": 0.34 }`. Accept the following two forms, and normalize every word to ascending `start`.

1. The captions asset form. An array of caption records, or `{ "captions": [...] }`. Flatten each caption's `words[]`. A caption whose `words` are missing or empty is ignored.
2. The minimal form. A top-level `[{ "text": "...", "start": 0.12, "end": 0.34 }, ...]`.

A kana-only word is split into morae from the left. A youon and a small written vowel join the previous kana into one mora, and the vowel of the small written side is used. The sokuon (U+3063 and U+30C3) and the hatsuon (U+3093 and U+30F3) are `closed`. The choonpu (U+30FC) continues the vowel of the previous mora. A choonpu at the start is `closed`. A word that contains unknown kana, or a kanji, a digit, or a symbol, has no vowel information and falls back to volume. An ASCII-romaji-only word is also split coarsely. That split is best effort, and it does not fully handle an ambiguous consonant cluster or an uncommon spelling. The kana path is the regular input.

When a frame time `f / fps` falls in a word span `[start, end)`, split that span evenly by mora count and pick the mouth shape. Then AND-gate it with the v0 RMS state sequence. If RMS is `closed`, `closed` wins regardless of the transcript. If RMS is `mid` or `open` during speech and a vowel was obtained, use that mouth shape. If the vowel is unknown because of a gap between words or an unsupported word, fall back to `a`.

In a vowel-mode stdout example, one element is still one output frame, as before.

```jsonc
{
  "ok": true,
  "drive": {
    "mouth": ["closed", "a", "i", "u", "e", "o"],
    "eyes": ["open", "open", "open", "open", "closed", "open"]
  }
}
```

## v0.2 append (2026-08-14). face-expression drive

`--expression-track <path>` accepts a track of `kind:"face-expression"` directly, or an analysis.json that has `tracks.face_expression.path`. A pointer resolves against analysis.json. `source.path` resolves against the track itself. When omitted, the procedural blink and stdout stay byte-identical to v0 and v1. Only when it is set are `drive.fps`, `drive.head[]`, and `drive.emotion[]` added, and `drive.eyes[]` switches to blendshape drive. The sprite bake does not use head or emotion for drawing. It composites only mouth and eyes, as before.

### v0.2.1 Time mapping and head

Place the timeline time `f / output.fps` of output frame `f` into the span of the existing `timeline.cuts[]`, joined with no gaps in declaration order. The source time of that cut is `cut.in + (timelineTime - cutTimelineStart) * cut.speed`. A track sample is nearest-neighbor resampled onto the source time. With multiple sources, drive only the cut whose path matches the track's `source.path`. A frame of another source is head `null`, eyes `open`, and emotion `neutral`.

The track's head is yaw, pitch, and roll in radians. `drive.head[]` converts them to degrees so they can be passed straight to the `avatar-vrm` drive seat. The sign is not flipped. A sample with no detection holds only the head at the previous valid value. If nothing has been detected from the start, it is `null`. `--head-smoothing <frames>` is a centered moving-average window on output frames. The default is `5`. `0` or `1` means no smoothing. A `null` inside the window is excluded.

### v0.2.2 Blink occlusion gate

On the original track samples, before resampling, only a contiguous run that meets all of the following is `eyes:"closed"`.

| Parameter | Value |
|---|---:|
| Closed-eye threshold on each side | `eyeBlinkLeft >= 0.30` and `eyeBlinkRight >= 0.30` |
| Left-right symmetry threshold | `abs(left - right) <= 0.12` |
| Minimum duration | 2 contiguous samples |

A measured real blink (19.125 to 19.208 seconds, peak `0.5853 / 0.5544`) is accepted. A false spike at 10.3 to 10.5 seconds, where a finger occluded the face, is rejected, because even when some frames cross the amplitude threshold the left-right difference splits the run. A hand-pose proximity gate is not implemented. This left-right symmetry plus duration gate is the contract.

### v0.2.3 Emotion mapping

Each score is the arithmetic mean of the blendshapes in the table. Use hysteresis of `enter=0.45` and `exit=0.30`, and pick the highest score among candidates that crossed enter. On a tie the priority is `happy > sad > angry > surprised`. While there is no enter candidate, hold the current value until it falls below exit, then return to `neutral`. No detection is `neutral`.

| emotion | blendshape |
|---|---|
| `happy` | `mouthSmileLeft`, `mouthSmileRight` |
| `sad` | `mouthFrownLeft`, `mouthFrownRight` |
| `angry` | `browDownLeft`, `browDownRight` |
| `surprised` | `browOuterUpLeft`, `browOuterUpRight`, `jawOpen` |
| `neutral` | none of the active states above |

head, eyes, and emotion built from the same track, cuts, fps, and smoothing window are deterministic. They do not read the wall clock or a random source.

## v1.1 append (2026-08-14). PNGTuber motion

Add breath, a speech bounce, and a small tilt per speech onset to the sprite bake. The default of `--motion-intensity <0..1>` is `0.5`. `--no-motion` is another name for intensity `0`, and specifying it together with `--motion-intensity` is refused, to avoid ambiguity. At intensity `0`, every frame is the exact identity `scaleX=scaleY=1, tx=ty=rotateDeg=0`, and the path is the old raw RGBA to ProRes path that does not go through an affine transform or a canvas expansion at all.

Let frame be `f`, `t=f/fps`, and intensity be `I`. Phases `p0` and `p1` come from the input hash, and the breath wave is the following.

```text
breath(t) = (sin(2 * pi * 0.25 * t + p0) + 0.20 * sin(2 * pi * 0.50 * t + p1)) / 1.20
```

Speech is `mouth != "closed"`. The speech envelope `E` is exponentially smoothed toward target `1` (speech) or `0` (not speech). The time constants are attack `0.06 s` and release `0.12 s`. From speech onset frame `o`, `pulse=(1-cos(2 * pi * 3.0 * (f-o)/fps))/2`, and `talk=E * (0.35+0.65 * pulse)`. The final transform is the following.

```text
scaleX = 1
scaleY = 1 + I * (0.008 * breath + 0.028 * talk)
tx = 0
ty = -spriteHeight * I * (0.0015 * breath + 0.009 * talk)
```

The small tilt draws a sign and a magnitude from the input seed's PRNG at each onset from closed to speech, and the target is plus or minus `3.2 degrees * U(0.55,1.0)`. The current angle approaches the target by exponential smoothing with time constant `0.28 s`. When `--expression-track` is also set, if that frame's `drive.head` is non-null, do not use the procedural angle. Use `rotateDeg=I * head.roll`. Only a frame whose head is null returns to the procedural angle. The affine transform is applied around the center of the expanded canvas, in the order scale, then rotate, then translate. RGBA is bilinear-interpolated as premultiplied alpha, then returned to straight alpha.

Add the same integer margin `M` to all four sides of the canvas, on every frame. For each frame, `theta=abs(rotateDeg) * pi/180`, `hx=width * scaleX/2`, and `hy=height * scaleY/2`.

```text
ex = abs(cos theta) * hx + abs(sin theta) * hy + abs(tx)
ey = abs(sin theta) * hx + abs(cos theta) * hy + abs(ty)
M = ceil(max_all_frames(ex-width/2, ey-height/2) + 2px)
```

The trailing `2px` is the bilinear sampling support. The output size is `(width+2M)` by `(height+2M)`. Layer placement uses this real baked size, not the original size in sprite.json. An anchor for an explicit coordinate is also mapped to `(M + anchor * original size) / real baked size`.

The motion seed is derived from the SHA-256 of a stable stringify of the normalized edit.json, sprite.json, drive profile, and the fixed identifier `avatar-drive-motion-v1.1`. Phase, onset tilt, the frame transform, interpolation, and margin do not read the wall clock, the OS random source, or mtime. The same input, the same CLI values, and the same ffmpeg implementation make stdout and the MOV byte-deterministic.

Because the default became motion on (`0.5`), the v1.1 default output has a backward-incompatible point. The canvas is larger than before, and the pixels are the values after affine interpolation. When the old size, pixels, and ProRes call are required, specify `--no-motion` (or `--motion-intensity 0`).

## v2 append (2026-08-14). A multi-layer part tree and 2D physics

v2 does not replace `sprite.json`. If `sprite.json` exists directly under `--sprites <dir>`, read it as the old form on exactly the same path. Read `parts.json` v2 only when it is absent. If both exist, `sprite.json` wins. An existing set's manifest, state sequence, RGBA composite, ProRes call, and stdout therefore do not change.

### v2.1 parts.json

```jsonc
{
  "version": 2,
  "size": { "width": 160, "height": 160 },
  "anchor": { "x": 0.5, "y": 1 },
  "parts": [
    {
      "id": "body",
      "image": "body.png",
      "parent": null,
      "offset": { "x": 80, "y": 150 },
      "origin": { "x": 35, "y": 70 },
      "z": 0,
      "states": "always"
    },
    {
      "id": "hair-left",
      "image": "hair-left.png",
      "parent": "head",
      "offset": { "x": -31, "y": -29 },
      "origin": { "x": 9, "y": 5 },
      "z": 5,
      "states": "always",
      "physics": {
        "wobble": { "x": { "amplitude": 2, "frequency": 0.48, "phase": 1.1 } },
        "follow": { "drag": 6 },
        "rotationalDrag": { "strength": 1.35, "minDeg": -18, "maxDeg": 18, "lerp": 0.25 }
      }
    },
    {
      "id": "mouth-a",
      "image": "mouth-a.png",
      "parent": "head",
      "offset": { "x": 0, "y": 18 },
      "origin": { "x": 15, "y": 10 },
      "z": 4,
      "states": { "mouth": ["a", "mid", "open"] }
    }
  ]
}
```

| Field | Rule |
|---|---|
| `version` | The integer `2` |
| `size`, `anchor` | The same output-canvas px and normalized anchor as v0 |
| `parts[].id` | An ASCII identifier, unique inside the set |
| `image` | A relative path to a PNG inside the set. Each part may have a different real size. |
| `parent` | A parent id. A root is `null`. Multiple roots are allowed. A cycle or a missing parent is refused. |
| `offset` | px from the parent's `origin` to this part's `origin`. On a root, the origin is the canvas top left. |
| `origin` | The rotate and scale origin in px, relative to this PNG's top left. |
| `z` | Draw from the smaller value. Equal values follow `parts[]` declaration order. |
| `states` | `"always"`, or an array of allowed values per `mouth`, `eyes`, or `emotion` |
| `physics` | Optional. `wobble`, `follow`, `rotationalDrag`, and `talkBounce` from the next section |

If `states` has several drive sequences, they AND. Values inside the same array OR. Mouth is `closed/mid/open/a/i/u/e/o`. Eyes are `open/closed`. Emotion uses the v0.2 vocabulary as it is. For example `{mouth:["a","mid","open"],emotion:["happy"]}` shows only a frame that is happy and has one of those mouth shapes. In vowel mode, check before start that the whole set's `states.mouth` contains `closed/a/i/u/e/o`.

Evaluate parents first. When a matrix is applied to a column vector from the left, part `p`'s pivot matrix is `Pp = Pparent * T(offset + wobble) * R(rotationalDrag)`, and the image matrix is `Ip = Pp * T(-origin)`. A root's `Pparent` is the v1.1 motion matrix whose origin is the canvas center. Under `--no-motion` it is the identity. Breath, speech bounce, and the small tilt are therefore applied once to the root part, not as a separate full-frame post process. Drawing composites every part in `z` order with straight-alpha over. Sampling is premultiplied-alpha bilinear.

### v2.2 Physics vocabulary and determinism

Let frame be `f`, `t=f/fps`, and the fixed step `dt=1/fps`. Do not use the wall clock, a variable delta, or the OS random source. Only a wobble that omits phase puts the motion seed from the normalized input, the part id, and the axis name into SHA-256, and maps the first 32 bits onto `[0, 2*pi)`.

**wobble** is a closed-form sine per axis.

```text
wobbleAxis(t) = amplitude * sin(2 * pi * frequency * t + phase)
```

`amplitude` is px. `frequency` is Hz. `phase` is radians. x and y are independent. An unspecified axis is 0 px.

**follow** lerps the target pivot that the parent shows on the current frame into the world coordinate the part holds. `drag >= 1`. Frame 0 initializes to the target. After that the formula is the following. `drag=1` has no lag.

```text
followed[f] = followed[f-1] + (target[f] - followed[f-1]) / drag
```

**rotationalDrag** converts the world-x difference of target and followed into an angle, and lerps the angle itself.

```text
targetDeg[f] = clamp((targetX[f] - followedX[f]) * strength, minDeg, maxDeg)
angle[f] = angle[f-1] + (targetDeg[f] - angle[f-1]) * lerp
```

`strength` is degrees per px. The default of `minDeg/maxDeg` is `-180/180`. The default of `lerp` is `0.25`.

**talkBounce** is a parabola on a fixed dt that injects an upward initial velocity on the frame that changes from closed to speech.

```text
onset: velocityY = -velocity
velocityY[f] = velocityY[f-1] + gravity * dt
bounceY[f] = bounceY[f-1] + velocityY[f] * dt
```

If `bounceY` crosses 0, clamp it to 0 and stop. There is no bounce-back. The units are `velocity=px/s` and `gravity=px/s^2`. The v1.1 standard speech bounce already exists as root motion, so an ordinary v2 set does not stack `talkBounce` on the root. This vocabulary is the seat for when a Plus import has an explicit value, or when an individual part should bounce on a speech onset.

The same parts.json, PNGs, drive sequence, fps, profile, CLI values, and ffmpeg implementation make the physics sequence, RGBA frames, the MOV, and stdout match byte for byte. stdout `stats.follow_lag_frames` is, for each follow target, the non-negative lag of 0 to 2 seconds at which the cross-correlation is maximum, measured in frames, on the axis where target and followed vary the most.

### v2.3 PNGTuber Plus vocabulary map

The save and runtime code of PNGTuber Plus 1.4.5 (Unlicense) was read as the primary source of the spec. The code was not reused. The following vocabulary was implemented independently.

| PNGTuber Plus `.save` or behavior | parts.json v2 | Conversion |
|---|---|---|
| `identification` | `id` | Stringify it and make it unique inside the set |
| `parentId` | `parent` | Convert an identification reference to an id reference. null stays |
| `pos`, `offset` | `offset`, `origin` | Resolve the Plus pivot and normalize to px relative to the parent origin |
| `zindex` | `z` | Keep the number. Equal values follow import declaration order |
| `xAmp/xFrq`, `yAmp/yFrq` | `physics.wobble` | `amplitude=Amp`. Convert Plus rad/frame to `frequency=Frq * fps / (2*pi)` |
| `drag` | `physics.follow.drag` | The same coefficient as Plus `lerp(...,1/dragSpeed)`. 0 or disabled is `drag=1` |
| `rotDrag`, `rLimitMin/Max` | `physics.rotationalDrag` | Normalize the world follow difference to degrees per px and a clamp. The angle lerp is `0.25` |
| global `bounce`, `gravity` | `physics.talkBounce` | For an exact import reproduction, resample Plus's fixed `dt=0.0166` samples onto the output fps |
| `showTalk`, `showBlink` | `states.mouth/eyes` | Expand Plus's speaking and blink table into AKARI's explicit state set |
| `stretchAmount` | reserved | v2 does not accept it. Planned as a future part scale drag |
| `clipped`, costume, flipbook, toggle | reserved | Do not drop them silently on import. Report them as unsupported |

### v2.4 Import reserved

The `.save` importer itself is not in this version. A future importer extracts embedded `imageData` as a PNG when that is possible, and uses `path` only when it resolves inside the boundary relative to the input file. Integer dictionary order is the declaration order. It moves the parent tree and z, and converts the physics values and showTalk and showBlink in the table above. Unsupported fields are always listed in `unsupported[]`. A value the conversion approximated is always listed in `approximated[]`. The right to use a model image is limited to what the user brought in. Export, and collecting or bundling distributed models, are another contract.

### v2.5 Extra verification

1. Even when a parent is declared after its child, resolve parents first, and refuse a cycle or a missing parent.
2. Fix `z` ascending, and declaration order on equal values, and check the reference point after the parent-child transform numerically.
3. The visible parts switch uniquely per mouth, eyes, and emotion state.
4. The closed-form wobble value, and follow, rotational drag, and talk bounce on a fixed dt, match across two runs of the same input.
5. On a 12 second say fixture, measure `follow_lag_frames > 0` for all 3 hair tufts, and match the MOV SHA across two runs.
6. An existing sprite.json test fixture and the `--no-motion` path keep the old size, pixels, and stdout.

## v2.6 append (2026-08-14). Crossfade when the mouth state changes

`--mouth-transition <frames>` sets the frame count `N` of the crossfade from the boundary where the mouth state changes. The default is `2`. `0` is the old instant switch, and it does not go through the transition math or the blend at all.

| Value | Mouth-state change |
|---:|---|
| `0` | Draw the new state directly from the boundary frame |
| `N > 0` | From the boundary frame, `N` frames are a crossfade of the previous state and the new state |

Let the offset from the boundary frame be `p=0..N-1`. Do not generate a frame past the end of the array. The blend factor is fixed by the following. If the next mouth-state boundary appears during the transition, the later boundary wins.

```text
t = (p + 1) / (N + 1)
output = previous * (1 - t) + current * t
```

This is a plain composite of "previous state alpha `(1-t)` plus new state alpha `t`". Lerp each RGBA channel directly and round to the nearest integer. It is not an alpha-weighted over composite.

This transition applies to both the sprite.json v1 path and the parts.json v2 path. v1 blends the previous and next mouth variants that were composited with the same eye state, then applies the v1.1 affine transform. v2 keeps the current frame's physics, matrices, `z`, and declaration order, and draws and blends two frames that differ only in the mouth-dependent visibility, swapped to the previous state and the new state. Parts other than the mouth, physics, and motion are therefore unaffected by the transition.

The factor, the boundary scan, and the channel interpolation do not use a random source or the wall clock. The same input, the same CLI values, and the same ffmpeg implementation make stdout and the MOV match byte for byte, deterministically.

Because the default became non-zero (`2`), the v2.6 default output has a backward-incompatible point. Pixels at a mouth-state boundary differ from before. When the old instant switch, pixels, and MOV are required, specify `--mouth-transition 0`.
