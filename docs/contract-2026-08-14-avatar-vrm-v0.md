**English** | [Japanese](./contract-2026-08-14-avatar-vrm-v0.ja.md)

---
lifecycle: stable
created: 2026-08-14
updated: 2026-08-14
---

# VRM avatar drive backend contract v0 (avatar-vrm)

- Date: 2026-08-14
- Status: **v0 implemented**
- Depends on: `contract-2026-07-13-m1-m4.md` (`layers[]` and the output coordinate system), `contract-2026-07-22-prerender-rail-and-assets.md` (`kind: "baked"`)
- Scope: an independent CLI that applies mouth shape and blink to a VRM 0.x or 1.0 model per frame and bakes a transparent ProRes 4444 clip headlessly. Audio analysis, bone pose, and registry resolution are out of scope.

## 1. Input, output, and duties

```sh
node packages/akari-tools/bin/avatar-vrm.mjs \
  --model avatar.vrm --drive drive.json --out avatar.mov
```

Required inputs are `--model <path.vrm>`, `--drive <path.json>`, and `--out <path.mov>`. Knobs are `--framing bust|full` (default `bust`), `--scale` (default `1`), `--position` (default `right-bottom`), and `--layer-id` (default `avatar-vrm-0`). `--position` accepts `right-bottom`, `left-bottom`, `right-top`, `left-top`, `center`, or a center coordinate `x,y` whose origin is the top left of the output frame.

Only when `--project <dir>` is set does placement use `output.width` and `output.height` from `<dir>/edit.json`. When omitted, use `--output-width` and `--output-height` (default `1920x1080`). `--apply` requires `--project`. It appends the generated layer to the end of the existing `layers[]`. The same id is not overwritten. It fails.

stdout is always one JSON line. Success is `{ "ok":true, "layers":[...], "stats":{...} }`. A run failure is `{ "ok":false, "reason":"..." }` plus exit 1. A bad argument is the same shape plus exit 2. A layer has the shape `{ id, t:0, duration, kind:"baked", src, transform:{x,y,scale,rotate}, preset:"avatar-vrm-v0", params }`. `src` is project-relative when it is inside the project, and an absolute path otherwise. Do not attach `chroma_key`. The output is a 720 by 720 transparent clip, fixed to `prores_ks -profile:v 4 -pix_fmt yuva444p10le -alpha_bits 16 -vendor apl0 -an`.

## 2. Drive state sequence v0

```json
{ "drive": { "fps": 30, "mouth": ["closed", "a"], "eyes": ["open", "closed"] } }
```

One element of `mouth[]` and of `eyes[]` is one output frame. The two arrays must have the same non-zero length. `fps` is a positive number. An unknown state, a length mismatch, or an empty array is refused before the bake. The state sequence is the frame-grain source of truth, so v0 adds no interpolation and no tween.

| `mouth` | VRM expression | Value every frame |
|---|---|---|
| `closed` | none | `aa/ih/ou/ee/oh = 0` |
| `a` | `aa` | `aa = 1`, other mouth shapes = 0 |
| `i` | `ih` | `ih = 1`, other mouth shapes = 0 |
| `u` | `ou` | `ou = 1`, other mouth shapes = 0 |
| `e` | `ee` | `ee = 1`, other mouth shapes = 0 |
| `o` | `oh` | `oh = 1`, other mouth shapes = 0 |

| `eyes` | Value every frame |
|---|---|
| `open` | `blink = 0` |
| `closed` | `blink = 1` |

So that a previous frame's value does not remain, every frame writes all 6 of `aa`, `ih`, `ou`, `ee`, `oh`, and `blink` with `expressionManager.setValue(name, value)`, then `vrm.update(0)`, then `renderer.render(scene, camera)`. This call order was checked against the distributed source. three-vrm 3.5 `VRM.update(delta)` includes `expressionManager.update()`.

## 3. Headless draw and camera

Load `three-bundle.js`, then `avatar-vrm-bundle.js`, then the renderer. The renderer uses `alpha: true`, `preserveDrawingBuffer: true`, and `setClearColor(0, 0)`, and places a HemisphereLight and a DirectionalLight. Each state is saved as a PNG sequence with `page.screenshot({ omitBackground:true })`, and every frame becomes a MOV in one ffmpeg call. So that success does not depend on whether a local-file origin can fetch, VRM bytes read on the Node side are passed to GLTFLoader as `data:model/gltf-binary;base64,...`. There is no network fetch.

`bust` uses the world position of `vrm.humanoid.getRawBoneNode("head")` and the scene AABB, and frames from the head to the chest. `full` frames the whole world AABB of `vrm.scene`. A custom glTF with no bones is not accepted silently.

## 4. Compatibility and reserved sections

### 4.1 Measured Three.js and three-vrm vendor

The following was run against the existing bundle.

```text
$ rg -n 'REVISION:\(\)=>Ho|Ho="185"' packages/overlay-runtime/src/vendor/three-bundle.js
1: ... REVISION:()=>Ho ...
5: */var Ho="185",...
```

The existing Three.js is therefore not r163. It is **r185 (npm `three@0.185.1`)**. That matches the pinned value in the same README. The adopted `@pixiv/three-vrm` is `3.5.5` (MIT). The real `peerDependencies.three` in the npm `package.json` is `">=0.137"`. r185 is inside that range.

three-vrm is an extra IIFE that does not embed Three.js again. The entry `import ... from "three"` resolves through esbuild `--alias:three=./three-shim.js` to `module.exports = window.AkariThree.THREE`. The existing `three-bundle.js` is not changed.

How it was obtained. A wrapper process with outbound network fetched the tarball from the real npm registry with `npm pack`, and it passed the npm and pacote integrity check. This session received that artifact and **recomputed SHA-256 and SHA-512 itself before expanding it**, and confirmed they match the handed-over values and npm `dist.integrity`. The fetcher and the verifier are not recorded as the same actor.

Pinned values.

- `@pixiv/three-vrm@3.5.5` tarball: `576823` bytes / SHA-256 `6f0102f987bc8abc9b9e78ef5b3259ea9f0dc51e30bf51d32aea6218394ea755` / npm integrity `sha512-RPXy7jYAXs704NIpZlosB0U2ENu21G9DrqGWdQgRe8dShaCo1ugpj+6BVPRCy91nt+MPMA96j5rbsSzEl0HlQA==`
- `esbuild@0.24.2` tarball: SHA-256 `873e6170dc7f8bdd0e7a84daf2dfcec4744831271929bca044d6b7216ff86b47` / npm integrity `sha512-+9egpBW8I3CD5XPe0n6BfT5fxLzxrlDzqydF3aviG+9ni1lDC/OvMHcxqEFV0+LANZG5R1bFMWfUrjVsdwxJvA==`
- `@esbuild/darwin-arm64@0.24.2` tarball: SHA-256 `18a08e87d49f369e456a795b1d233267fb35455e7b1eda9eda1ade4bd8e8133b` / npm integrity `sha512-kj3AnYWc+CekmZnS5IPu9D+HWtUI49hbnyqk0FLEJDbzCIQt7hg7ucF1SQAilhtYpIujfaHr6O0UHlzzSPdOeA==`
- `avatar-vrm-bundle.js`: `150039` bytes / SHA-256 `88a5e5fd0c344f60b00cc6ad3d4f88fae2672322824b1acb57cb111219625eb5`
- Full license text, byte-identical to `LICENSE` inside the tarball: `packages/overlay-runtime/src/vendor/three-vrm-LICENSE.txt` (SHA-256 `279ec82987aec7e72ecb9850bb704a87e352d577bc7581454c30f3551a88ea92`)

Regeneration checks the npm tarball integrity in an empty temporary directory, expands it, then runs the following.

```sh
node node_modules/esbuild/bin/esbuild avatar-vrm-entry.js \
  --bundle --format=iife --platform=browser --target=es2020 --minify \
  --legal-comments=inline --alias:three=./three-shim.js \
  --outfile=avatar-vrm-bundle.js
```

The entry imports `VRMLoaderPlugin` and `VRMUtils`, and, keeping the existing global, sets `window.AkariThree = Object.freeze({ ...window.AkariThree, VRMLoaderPlugin, VRMUtils })`. The input used the tarball's built combined ESM `lib/three-vrm.module.js`. That file already inlines core, MToon, springbone, node-constraint, and the rest. The only remaining bare import is `three`.

### 4.2 VRM 0.x and 1.0 expressions

VRM 1.0 was loaded with GLTFLoader plus VRMLoaderPlugin on a real headless page, using a fixture made in this repo. `gltf.userData.vrm`, `aa/ih/ou/ee/oh/blink`, `humanoid.getRawBoneNode("head")`, and 3 MToon materials were confirmed. `types/VRM.d.ts` publishes `VRM.update(delta)`. `types/VRMLoaderPlugin.d.ts` publishes `VRMLoaderPlugin(parser, options?)` and the MToon plugin. That matches the renderer's call shape.

In the distributed `lib/three-vrm.module.js`, `VRM.update(delta)` calls core `humanoid.update()`, `lookAt.update(delta)`, and `expressionManager.update()`, then node constraint, spring bone, and `update(delta)` on each MToon material. MToon's UV offset update is `offset += delta * speed`, so `delta=0` does not accumulate. A repeat test with the real bundle confirmed the same value. `helperRoot` in `types/VRMLoaderPluginOptions.d.ts` is optional, and the distributed implementation does not create or add a helper when it is omitted. The default constructor's scene is not polluted by a debug helper.

VRM 0.x was not confirmed on a machine with a redistributed model. It was confirmed by reading `VRMExpressionLoaderPlugin._v0Import()` and `v0v1PresetNameMap` in the same real tarball's `lib/three-vrm.module.js`. The implementation normalizes the legacy `extensions.VRM.blendShapeMaster.blendShapeGroups[].presetName` as `a` to `aa`, `i` to `ih`, `u` to `ou`, `e` to `ee`, `o` to `oh`, and `blink` to `blink`. A `.ts` original that is not in the npm distribution is not a source. The CLI does not branch on VRM0. Both versions use the same common API.

### 4.3 Determinism

Wall clock, random numbers, and the network are not inputs. The same VRM, state sequence, Chrome, SwiftShader, Three.js, three-vrm, and ffmpeg make the layer JSON byte-identical. For the picture, two bakes in the same environment compare MOV SHA-256 and extracted RGBA frame SHA-256. Codec byte identity across different Chrome, SwiftShader, or ffmpeg versions is not guaranteed. The acceptance boundary is RGBA SHA-256 agreement on every representative frame.

The 2026-08-14 measurement environment was `HeadlessChrome/149.0.7827.22` (SwiftShader) and the bundled ffmpeg. 30 fps. `a`, then `i`, then `u`, then `e`, then `o`, then `closed`, 60 frames each, with a blink of 4 frames in each span (360 frames, 12 seconds). Two stdout layer JSON runs that named the same `--out` were byte-identical, and both MOVs matched `800e1ba42f9bd69e1dd5b946ad779cf3d08337deb9dd862c70a59c907c213402`. The ffprobe values were ProRes, 720 by 720, `yuva444p12le`, 360 frames, 12.000000 seconds, 32499737 bytes.

Decoded RGBA SHA-256 of the representative frames also matched on both runs, for every frame.

| frame | state | RGBA SHA-256 |
|---:|---|---|
| 30 | `a` | `c4aeef06c169a815b8941112e52c51c20c7c6fee3ec29be864a44e5254f185c8` |
| 45 | `a + blink` | `13dbbc1b4340728cf6547f169acebd6f1bcc8d074b3ace170b01b9221e75a7a6` |
| 90 | `i` | `39a4259a88e2016fc17730b84f3a8c6dffe2dbfb564dcf3896eeb0a81ac2b462` |
| 150 | `u` | `c45e3c038d4ef40638a36a6863253a951bf1ed32984a8f02cb2e8d8d7d161409` |
| 210 | `e` | `6522abe793bd0453e8e3a1ec3eafe79ac5776d136c266ee2fc61b7c9d4acb98d` |
| 270 | `o` | `7747cacdf53d9b363d24f1ef3d7a875ac06a3502ab7590b11dd010c08c1c80bf` |
| 330 | `closed` | `3b1dbcb2afbca3c61bd987dff87cc524827256fb2fd0bc8ce98685814c8bc9f7` |

### 4.4 Reserved, outside v0 scope

Bone pose, body-pose track drive, idle motion, and the avatar registry connection (avatar.json / rendition.json) are reserved. v0 leaves the bind pose unmoved. Wiring `avatar-drive --backend vrm` is the next task. This contract specifies only the independent `avatar-vrm` CLI.

## 5. Fixture and verification rules

`packages/akari-tools/test/fixtures/avatar-vrm/generate.mjs` deterministically generates an original fixture with zero external fetch. The product is CC0-1.0, VRM 1.0, the required humanoid bones, independent morphs for 6 expressions, a head node, and a translucent `alphaMode: "BLEND"` region of `VRMC_materials_mtoon`. The required bones match the 15 real values of `VRMRequiredHumanBoneName` in the combined distribution `lib/three-vrm.module.js` of the real tarball (`hips`, `spine`, `head`, and left and right `upperLeg`, `lowerLeg`, `foot`, `upperArm`, `lowerArm`, `hand`). The fixture also adds `chest` and `neck` for the framing. `types/` of the `@pixiv/three-vrm@3.5.5` tarball alone bare-imports subpackage types, and `types/humanoid/VRMRequiredHumanBoneName.d.ts` itself is not in this tarball, so a distribution path that does not exist is not a source. The generated fixture SHA-256 is `2a9fbc77cfece4eef781c051c8390206a83547fb58e59d1bdebf67a3217dda3c`.

1. Run the generator twice and the `.vrm` SHA-256 matches.
2. Load with GLTFLoader plus VRMLoaderPlugin, and confirm there is no page error and that the 6 expressions exist.
3. Bake a 12 second drive that includes `a`, then `i`, then `u`, then `e`, then `o`, then `closed`, and a blink, twice.
4. For the 5 mouth shapes and the blink, confirm the RGBA difference of the target region on the representative frames is non-zero.
5. Confirm the four corners have alpha 0, and that the MToon translucent region has an edge pixel with `0 < alpha < 255`.
6. Compare the two runs' layer JSON, MOV SHA-256, and representative RGBA SHA-256.
7. Confirm that existing fields and existing layers are unchanged across `--apply`, and that only one item is appended at the end.

On frame 30 of the 12 second measurement above, every corner alpha was 0, the visible bbox was `x=35..684, y=80..719`, and `0 < alpha < 255` was 34991 pixels. The MToon translucent region at the top edge had `(224,80) = RGBA(117,244,255,70)`. That is not the result of ignoring `VRMC_materials_mtoon`. It is a draw converted onto 3 real `MToonMaterial`s. The hashes of frames 30, 45, 90, 150, 210, 270, and 330 differ from each other by state, and they all matched between the two bakes. Frame 30 and blink frame 45 were looked at. Translucent cyan composites correctly onto skin and the transparent background, the boundary has no opaque black or white fringe, and the blink closes the left and right eyes.

## v0.1. Procedural idle motion and SpringBone

v0.1 does not change v0's expression, camera, transparent ProRes, or layer contract. It is an additive extension that adds a procedural rotation to the humanoid's normalized bones and advances the VRM-standard SpringBone on a fixed step.

### v0.1.1 CLI, time, and seed

- `--idle-intensity <0..1>`. Default `0.35`. A value outside the range, or a non-finite value, is refused before the bake.
- `--idle-seed <text>`. The seed for phase. When omitted, it is the lowercase SHA-256 hex of the model VRM's real bytes.
- `--no-idle`. Disables the procedural rotation. When `head[]` is absent, do not pass a pose to the browser at all.
- `--springbone on|off`. Default `on`. `on` calls `VRM.update(1 / drive.fps)` every frame. `off` calls `VRM.update(0)` every frame, the same as v0.

The only clock is `t = frame / fps`, built from the frame number `frame` and the drive `fps`. Do not read the wall clock, the OS random source, or the browser clock. Phase is fixed by the following.

```text
D = SHA256(UTF8("avatar-vrm-idle-v0.1\0" + String(seed)))
phase[k] = 2 * pi * uint32be(D[4k : 4k+4]) / 2^32   (k = 0..7)
W(t, f1, p1, f2, p2, a) =
  (sin(2 * pi * f1 * t + p1) + a * sin(2 * pi * f2 * t + p2)) / (1 + a)

breath = W(t, 0.25, phase[0], 0.50, phase[1], 0.20)
sway   = W(t, 0.08, phase[2], 0.13, phase[3], 0.35)
nod    = W(t, 0.47, phase[4], 0.63, phase[5], 0.30)
tilt   = W(t, 0.41, phase[6], 0.57, phase[7], 0.25)
```

The table below is the Euler rotation at intensity 1, in degrees. The actual value multiplies each component by `idle-intensity * pi / 180` to make radians, and sets `humanoid.getNormalizedBoneNode(name).rotation` in `XYZ` order.

| bone | x | y | z |
|---|---:|---:|---:|
| `chest` | `1.10 * breath` | `0.25 * sway` | `0.45 * sway` |
| `spine` | `0.55 * breath` | `0.70 * sway` | `0.95 * sway` |
| `head` | `1.50 * nod` | `1.20 * tilt` | `1.35 * (0.65 * tilt + 0.35 * nod)` |
| `hips` | `0.35 * sway` | `0.80 * sway` | `1.40 * sway` |

When intensity is exactly `0`, return all 12 components as the positive number `0`, regardless of the phase result. Therefore `--no-idle --springbone off` with no `head[]` does not touch bones, and delta is `0`, the same as v0. The measured maximum over 360 frames at the default intensity is head.x `0.5246752323` degrees (frame 132), well under the cap of a few degrees.

### v0.1.2 `drive.head[]`

`drive.head` is optional. When set, it must have the same length as `mouth[]` and `eyes[]`. Each element is `null` or an object with any of the finite-number keys `yaw`, `pitch`, and `roll`, in degrees. An omitted key is `0`. Add them onto the procedural head rotation as `pitch` to `head.x`, `yaw` to `head.y`, and `roll` to `head.z`. If the array itself is absent, interpret the input as v0. This is the seat for a Stage 2 pose track. v0.1 does not interpolate. It applies only each frame's value.

### v0.1.3 SpringBone fixture and fixed update

The fixture keeps v0 nodes `0..19`, meshes `0..2`, materials `0..2`, and accessor and bufferView `0..14`, and only appends at the end. Three chains (nodes `20..31`, 4 nodes each) are children of head node `4`, and adjacent pairs make 9 joints in total. Each root and intermediate node gets a small blue tuft of extra mesh `3`, using extra MToon material `3`. `VRMC_springBone` is added to both `extensionsUsed` and `extensionsRequired`. collider and colliderGroup are empty. stiffness is `0.75..0.90`, gravityPower is `0.02`, and dragForce is `0.24..0.32`.

The fixture SHA-256 `2a9f...dda3c` in §5 is the value before this addition. The v0.1 fixture is `12964` bytes, SHA-256 `ea60ddda918916d4fa409f6b0ba43964bf694613793b1ff94cdea1ea2c247b5c`.

### v0.1.4 Measured determinism, continuity, and backward compatibility

Measured on 2026-08-14 with `HeadlessChrome/149.0.7827.22` (`chrome-headless-shell` / SwiftShader), FFmpeg `8.1.1`, 30 fps, 360 frames, 12 seconds. The first 120 frames are mouth `closed`, eyes `open`, head `null`. The later 240 frames are a continuous sine head drive. Two runs of the same input with default idle and SpringBone on were both `47884529` bytes, and the MOV SHA-256 `62d3e6ceb206469cf694bb7808e4be3e0e56c985485c61b05846bafe28716d01` matched byte for byte. The ffprobe values were ProRes, 720 by 720, `yuva444p12le`, 360 frames, 12.000000 seconds. This result keeps the default at `springbone=on`.

`tblend=difference` plus `signalstats` on the 119 adjacent pairs of the first 120 still-input frames had a non-zero YAVG on every pair (min `0.213156`, max `2.03741`, mean `0.7463108739`). The same 12 seconds baked with `--no-idle --springbone off` and no `head[]` was `0` on all 119 pairs.

Hair physics was compared with idle off and the same head drive, SpringBone on versus off. The centroid of the RGBA blue-hair-tip mask (alpha greater than 200, blue greater than 170, blue greater than green plus 35, green greater than red, y=330..539) exceeded an on/off difference of `0.01 px` on 239 of 240 frames, with a maximum of `3.37956 px` and a mean of `0.48250 px`. Shifting the on centroid against the off rigid follow by 0 to 15 frames and comparing RMSE, the minimum is a **6 frame lag** (`0.30215 px`). It follows the head motion and has a phase lag.

Backward compatibility rebaked the historical v0 fixture (SHA-256 `2a9f...dda3c`) with the current code, `--no-idle --springbone off`, and no `head[]`. Decoded RGBA SHA-256 of frames 30, 45, 90, 150, 210, 270, and 330 all matched the 7 values in §4.3. Also, the new fixture with every flag off and no head has the same decoded frame hash on all 360 frames, so it introduces no change over time.

## v0.2 append (2026-08-14). Head source and emotion

v0 and v0.1 drives are still accepted. Optional `drive.emotion[]` and `--head-source` are added.

### v0.2.1 `drive.emotion[]`

When `drive.emotion` is set, it has the same length as `mouth[]`, and each element is one of `happy`, `sad`, `angry`, `surprised`, or `neutral`. Every frame, in addition to the existing `aa/ih/ou/ee/oh/blink`, pass all 4 of `happy`, `sad`, `angry`, and `surprised` to `expressionManager.setValue()`. The selected emotion is `1` and the others are `0`. `neutral` is `0` on all 4. There is no CLI-specific mutual exclusion between mouth shape, blink, and emotion. Composition is left to three-vrm expressions, including `overrideMouth` and `overrideBlink`. On a model that lacks the preset, three-vrm `setValue` is a no-op, so this is not an error.

The fixture VRM adds independent targets `happy`, `sad`, `angry`, and `surprised` after the existing 6 morph targets. The headless draw test confirms that each representative frame's RGBA difference against neutral is non-zero.

### v0.2.2 `--head-source track|idle|both`

The default is `both`. The unit and axes of `drive.head[]` stay as v0.1 (degrees, pitch to x, yaw to y, roll to z).

| Value | Procedural idle | `drive.head[]` | Composition |
|---|---|---|---|
| `track` | off | used | track value only |
| `idle` | used | ignored | the existing procedural value only |
| `both` | used | used | add the track value onto the procedural value |

`--no-idle` is the existing knob that finally disables "procedural idle" in this table. Therefore `--head-source idle --no-idle` passes no pose, and `both --no-idle` is track only. The head-source choice, the idle wave, and the track add are decided only by frame, fps, seed, and drive, and determinism holds.
