**English** | [日本語](./contract-2026-07-14-3d-bake-recipe.ja.md)

# 3D bake recipe contract v0 (Blender path)

- Date: 2026-07-14
- Status: implemented. The same day's proof round passed every gate. See "Implementation status".
- Related: `contract-2026-07-13-asset-library.md` (`meta.json` v0, intake rules, and the copy-to-use rule) and `.claude/skills/overlay-authoring/3d.md` (the authoring rules for path A).

## Which path this contract is

3D has two paths. This contract is path B, the bake.

| Path | Use | Runtime | Contract |
|---|---|---|---|
| A. Three.js overlay | Live 3D stacked on top of the picture (a spinning logo, a VideoTexture screen, and similar) | A transparent WebView. Some gates, such as the seek hook, are not implemented | `overlay-authoring/3d.md` |
| B. Blender bake | Move a 3D scene and produce the picture footage itself, a clip | None. The baked mp4 is ordinary footage | This contract |

- Test. If it sits on the timeline as a clip, the picture itself, use B. If it is an overlay expression on top of the picture, use A.
- B does not change the engine. The baked mp4 passes through the existing preview and export as an ordinary edit.json clip. The picture itself is the truth, so what you see is what you get, by structure.
- Do not build a 3D scene authoring feature inside the editor. That is out of scope. A small homemade DCC becomes a permanent development cost. Authoring stays in Blender. The agent writes the bpy script.

## Recipe is the source of truth. The bake is a cache

- The recipe (`scene.py`, plus params, plus asset references) is canonical. The baked picture is a derivative.
- Treat bake output as a cache that can be generated again. If the recipe, the params, and the Blender version are in provenance, you can delete the bake at any time and generate it again.
- The agent edits the script directly. It does not stack tool calls. The same rule as edit.json and overlay HTML applies to the scene description.

## Recipe layout

This follows asset library contract v0.

```
assets/scene3d/<id>/
  meta.json          # knobs are declared with param, instead of cssVar
  scene.py           # the body. A bpy script that builds the scene, or loads a .blend, applies params, and sets the render
  *.glb / *.hdr      # referenced assets. Copy them after a license check. Follow the catalog's reference-distribution rule
  preview.png        # a still preview of a low-resolution bake. One of the minimum three files
  preview.mp4        # optional. A recipe whose point is motion should ship a short video preview
```

- Which file is the body. A footage item in the `3d` category has either `fragment.html` (path A) or `scene.py` (path B) as its body. It does not have both.
- Declare `"blender"` in `requires`. That matches `"three.js"` on path A.
- Intake matches the asset library contract. Admit only what is expensive to generate, or impossible to generate. Admit a recipe only when the scene, the lighting, or the camera design is expensive.

## Knobs

Use the `meta.json` v0 knob types as they are (`text`, `color`, `slider`, `dropdown`, `checkbox`, `media`). Bind a knob to a script argument with `param` (snake_case) instead of `cssVar`.

```jsonc
{
  "knobs": [
    { "param": "camera_orbit_deg", "type": "slider", "min": -180, "max": 180, "unit": "deg", "group": "pose", "label": "Camera orbit" },
    { "param": "hdri_rotation_deg", "type": "slider", "min": 0, "max": 360, "unit": "deg", "group": "light", "label": "Environment light direction" },
    { "param": "body_color", "type": "color", "group": "style", "label": "Body color" },
    { "param": "screen_src", "type": "media", "group": "content", "label": "Video on the screen" }
  ]
}
```

- `scene.py` has no external input other than the declared params. Environment variables, wall-clock time, an implicit random seed, and network fetches are forbidden. This is the same idea as the overlay ban on wall-clock time.
- The schema adds this to `schemas/asset-meta.schema.json` in a backward-compatible way. A knob requires exactly one of `cssVar` or `param`.

## Run contract

Headless bake.

```
blender -b -P scene.py -- \
  --out <path>.mp4 --profile draft|final \
  --fps <fps> --frame-start 1 --frame-end <N> \
  --set camera_orbit_deg=30 --set body_color=#1a1a2e ...
```

- Determinism. The same recipe, the same params, and the same Blender version produce the same picture. Random numbers use a fixed seed. Physics and particles use a fixed seed or a baked cache.
- Two quality steps.
  - `draft` is EEVEE at low resolution. Use it to iterate on knobs. A pass takes seconds to tens of seconds.
  - `final` is output resolution, and Cycles when you need it. Run it only just before export.
  - The profile is a run flag, not a param. The same `scene.py` passes through both. Preview is the approximation. Export is exact. That is the same mental model.
- Match fps to the project fps. Compute time as a function of the frame number.

## Disk discipline

Do not fill the disk.

The thing that eats space is not the Blender application itself (about 0.5 GB, once). It is image sequences and packed `.blend` files. The rules:

1. Do not keep an image sequence by default. Write an mp4 directly from Blender's video output, or straight into ffmpeg. When an intermediate sequence is required, such as an EXR composite, delete it after the composite.
2. Do not pack assets into the `.blend`. Link them. Keep one copy of each asset body in the footage directory.
3. Run `draft` at low resolution and short duration. A full-resolution bake is one run, just before export.
4. Bake output is a cache that can be generated again, as above. If disk is tight, delete files under `bakes/`.

## How a project adopts a recipe

Apply the asset library rule. Copy it. Do not link it.

```
<project>/assets/scene3d/<id>/     # a copy of the recipe set (scene.py, referenced assets, meta.json)
  bakes/                      # bake output. Can be generated again. Safe to delete
    <id>-draft.mp4
    <id>-final.mp4
```

- Adopting a recipe means copying the recipe set into the project, overriding params, baking, and placing the mp4 as a clip in edit.json. A past project can still be reproduced after the library is gone. The project is self-contained.
- Record provenance on the project side: recipe id, where it was taken from and which version, the params applied, the Blender version, and the output profile. When that set is complete, `bakes/` may be deleted.
- Edit preview follows the existing rule that a 720p proxy comes first. If the draft bake itself is 720p or below, you do not need to generate a proxy.

## Blender as a tool

- Blender is a hand, an external CLI, at the same rank as ffmpeg and HyperFrames. Do not build it into the engine. Do not bundle it.
- Add it to the tool check in the setup skill. If it is missing, guide the install. Treat it the way ffmpeg is treated.
- A bpy script is text, so an agent can write it directly, git can diff it, and it can be distributed as a recipe. That matches the catalog's reference distribution. `scene.py` is text, so it can ship with the catalog. A heavy `.glb` or `.hdr` is fetched by each person through the catalog `source`.

## Implementation status

Every gate passed in the proof round on 2026-07-14.

- [x] `schemas/asset-meta.schema.json` and `scripts/validate-asset.mjs` gained knob `param`, backward compatible. The existing 12 `meta.json` files still validate.
- [x] Bake skill: `.claude/skills/bake-3d/SKILL.md`. The steps cover the `scene.py` authoring contract, the run, verification, and intake.
- [x] The setup skill's tool check now includes Blender. It is a conditional tool. The three always-on tools are unchanged.
- [x] First recipe: `assets/scene3d/vintage-camera-turntable/`. It fetches the catalog's vintage-camera and studio-hdri and packs the glTF 2k into one `.glb`. `validate-asset.mjs` passes.
- [x] Headless EEVEE measurement (Blender 5.1.2, macOS, Apple Silicon). About 0.55 seconds per frame at 720p and 16 samples. A draft of 4 seconds of footage (120 frames) is about 66 seconds.
- 5.x API notes, fixed by measurement. The engine id is `BLENDER_EEVEE` (`_NEXT` is gone). For video output, set `image_settings.media_type = "VIDEO"` first, then `file_format = "FFMPEG"`. 4.x has no `media_type`, so branch with `hasattr`.

### Remaining tasks, finished in round 2 the same day

- [x] `final` profile measurement (1080p, 64 samples). About 3.83 seconds per frame. 4 seconds of footage is about 7.7 minutes, about 7 times the draft. Operation is fixed. Iterate knobs on draft. Run final once, just before export.
- [x] The project adoption flow was run for real. Copy the recipe, override params, bake, place it in edit.json, and pass structural verification. A live check of the mp4 export was not done, because it needs the GUI app to start. That gap is known.
- [x] Second recipe, `assets/scene3d/smartphone-mockup/`. It proves a `media` knob (`screen_src`). Only the screen surface swaps its Emission. When a video is inserted, frame sync goes through ImageUser and is a pure function of the frame. It does not use wall-clock time. The source is CC0 (OpenGameArt). The catalog also gained a fetch index entry named `modern-smartphone`.
