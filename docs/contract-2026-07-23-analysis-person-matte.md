**English** | [日本語](./contract-2026-07-23-analysis-person-matte.ja.md)

# analysis.json v0 person matte (tracks.person_matte) contract

- Date: 2026-07-23
- Revised: 2026-08-27. Section 8 opens the `format` seat and adds `mask_path` and `mask_format`.
- Status: source of truth for the implementation round. Only the value of `tracks.person_matte` is fixed.
- Depends on: `contract-2026-07-17-data-contract-versioning.md` (version required, additive evolution, and an explicit migration), `contract-2026-07-13-m5-analysis-report.md` (the container of `analysis.json` v0 and the `tracks` frame. The original text that places `tracks.faces` and `person_matte` as the shared base for reframing and text-behind-person), and `contract-2026-07-22-edit-json-v1-beats.md` (the precedent for form, degradation, and who checks what).
- Basis: a feasibility spike on 2026-07-23, kept in a private internal record. The method, the default quality, and the storage format were fixed by measurement there. This contract writes those fixed points down as a data contract.
- Scope: only the shape of the value of `tracks.person_matte` in `analysis.json`. Consuming the matte is a separate task. That includes the real wiring of text-behind-person, person treatments such as a frame or glitter, supplying `src` to an overlay fragment, and time sync of `<video>`. This document writes down the data container and the validation duties.

## 0. How version is used

Backward compatible. Follow section 0 of `contract-2026-07-22-edit-json-v1-beats.md`. **Do not bump `version`.**

`analysis.json` v0 already has a frame named `tracks.person_matte` (`{"type": ["string", "null"], "minLength": 1}`, a single path to a generated matte, or `null` when none has been generated). This contract does not discard that frame. It adds an object shape to the values the same key may take.

- The key `tracks.person_matte` itself stays required, as before. Do not change `required` on `tracks`. Generating a person matte is optional. Writing the key is not. When none has been generated, write `null`.
- An existing `analysis.json` whose `person_matte` is `null` or a string is unaffected. This only adds a new value shape. Under principle 1 of `contract-2026-07-17-data-contract-versioning.md` (version required, additive evolution), no `version` bump is required.
- The string shape is deprecated and stays valid. A reader treats a string as sugar for `{ "path": <string> }` (section 4). Do not migrate existing files by rewriting them.
- The key was not removed from `required` because `packages/analysis-report` checks `hasOwn(analysis.tracks, "person_matte")`. Making the key optional is a deletion. It would break an existing reader, which violates additive evolution.

## 1. Names

| Context | Name |
|---|---|
| The data model (the analysis.json field name, the schema, code, and error messages) | `tracks.person_matte` |
| For a person (a report, the UI, the body of a document, a conversation with the owner) | person matte |

Those two names are the text. Do not add another name, such as cutout, alpha video, or segmentation result. This matches the existing analysis-report label, which says in Japanese whether a person matte is present or absent.

## 2. Fixed schema

```jsonc
{
  "version": 0,
  "source": "../../clip.mp4",
  "transcript": [],
  "keyframes": [],
  "events": [],
  "tracks": {
    "speakers": [],
    "faces": [],

    "person_matte": {                        // null (not generated) and string (the old shape) are also valid
      "path": "matte/person-matte.webm",     // required. A relative or absolute path to a VP9 alpha WebM.
      "mask_path": "matte/person-matte.mask.mp4", // optional. An extra grayscale H.264 mask.
      "mask_format": "gray-h264-fullrange", // optional. The format of mask_path.
      "fps": 24,                             // required. The fps of the matte video. It may differ from the original footage.
      "quality": "balanced",                 // optional. Examples: fast, balanced, accurate, best. Not a forced enum.
      "generated_at": "2026-07-23T01:33:30.069Z",  // optional. ISO 8601.
      "tool": "vision-person-segmentation"   // optional. A record of how it was generated.
    }
  }
}
```

### Fields

| Field | Type | Required | Default | Unit and coordinates |
|---|---|---|---|---|
| `tracks.person_matte` | object, string, or null | Required as a key | none | `null` means not generated. A string is the old shape, sugar for `{path}`, and is deprecated. |
| `person_matte.path` | string | Required | none | A path to the matte video. A relative path is relative to the directory that contains analysis.json. The separator is `/`. The file is a VP9 alpha WebM (section 3). |
| `person_matte.fps` | number | Required | none | The fps of the matte video. Greater than 0. It does not have to match the fps of the original footage. The time mapping in section 4 does not depend on fps. |
| `person_matte.quality` | string | No | none | Generation quality. Examples: `fast`, `balanced`, `accurate`, `best`. Not a forced enum. |
| `person_matte.generated_at` | string | No | none | The generation time (ISO 8601). |
| `person_matte.tool` | string | No | none | A record of how it was generated. `vision-person-segmentation` is an example. |

`quality` is not fixed as an enum for the same reason as `beats[].kind` (section 2 of `contract-2026-07-22-edit-json-v1-beats.md`) and `audio.narration[].provenance.provider`. As generation methods grow, the quality vocabulary grows. Fixing the list in the contract would require a schema revision every time a word is added. A writer may use a new `quality` and validation still passes. A consumer ignores an unknown value and falls back to the default handling. `tool` is a free string in the same way.

`fps` is required so a consumer can compute the duration and the time mapping itself. The matte does not have to use the same fps as the original footage. Slow person motion can be enough at 12 fps. `frame number / fps = source seconds` has to hold without reading container metadata, and that requires this value.

This contract does not define `width`, `height`, `spans`, or `provenance` (section 8).

## 3. Storage format

VP9 alpha WebM.

**The file `path` points at is a VP9 alpha WebM (`.webm`, with `alpha_mode=1` on the container).**

This was fixed by measurement in the spike. This contract does not overturn it. The basis:

- The size is 1/4.8 of an HEVC alpha MOV. On an 8 second clip, 1.5 MB against 7.2 MB.
- It does not depend on GPU decode. HEVC alpha can play with transparency on Chromium-family browsers, but a headless renderer started with `--disable-gpu` cannot play even plain HEVC. Do not make the default a format that fails entirely depending on the export path's launch options.
- It is the same format as the existing bake-preview path, so the player set does not grow.

**Write alpha as straight (not premultiplied).** RGB keeps the original frame values. Alpha holds the matte value. Semi-transparent edge pixels, measured at 2.7 to 3.7 percent of all pixels, go dark twice if premultiplied values are read as straight, and the edge shows a black rim.

**Do not pass an alpha video through an ffmpeg decoder.** ffmpeg cannot read the HEVC alpha layer (it reports `pix_fmt` as `yuv420p`), and its own re-decode of VP9 alpha cannot produce alpha either. A relay drops the alpha in silence. Do not re-encode a matte video that is already finished.

An HEVC alpha MOV is a second format, for when the file has to be handed to an Apple-family tool. It is not the default stored in `analysis.json`. When a second format has to be stored on `person_matte`, treat that as adding a `format` field, in a separate contract (section 8).

## 4. Coordinates

A source-second anchor.

**Time 0 of the matte video matches time 0 of the footage (`analysis.source`). The two correspond 1:1 in source seconds.**

- A matte is an analysis result, a fact about this footage, where a person is. It is not a result of the edit, where someone placed it. The rule in section 3 of `contract-2026-07-18-edit-json-v1-sources.md` therefore applies as written. Persist an analysis result as `(src, source seconds)`. Do not persist the timeline seconds you got by converting them. The same treatment as `beats` and `emphasis_words`.
- Do not give the matte an offset equivalent to `--ss`. Do not store, on `person_matte`, a matte cut from only a middle span of the footage. Doing that breaks the match at time 0.
  - A different operation is outside this contract. That operation places a matte cut per cut directly onto `layers[].src`, without going through `analysis.json`, for example a project-specific `assets/matte/*.mov`. In that case the "time 0 matches" rule of this section does not hold, so the cut's origin must be kept next to the footage. The origin is the original footage, `in`, `out`, `speed`, and `fps`. Without an origin, a consumer can only guess which time the head of the footage is, and a drift of a dozen frames can go unnoticed. That caused real damage on 2026-08-14. The operational note is section 2.4 of `docs/contract-2026-08-02-preview-parity.md` (Japanese) and "Time basis of layer footage" in `skills/edit-plan/execution.md` (Japanese).
- A consumer projects onto timeline seconds from `cuts[]` on every display and every export. It does not persist the projected result. If the same source range appears more than once, one matte projects to several timeline positions.
- If the matte is shorter than the footage, treat the range past the matte as no matte. That is not an error. The correspondence is decided in seconds even when the fps values differ, so this rule does not depend on fps.
- Read a string (the old shape) as sugar for `{ "path": <string> }`. It has no `fps`, so the reader either takes fps from container metadata or limits itself to a use that does not need fps.

## 5. Degradation

Apply the same design as section 5 of `contract-2026-07-14-edit-json-v1-audio.md`, which says audio is decoration and must not decide whether the picture itself exports. **A person matte is an input to treatment. It must not decide whether the picture itself exports.**

| Situation | Behavior |
|---|---|
| `person_matte` is `null` | Previous behavior. No person matte. Not an error. |
| `person_matte` is not an object, not a string, and not `null` | Treat the matte as absent and warn. Export continues. |
| `path` does not resolve, or the file is missing | Continue with no person treatment, and warn. |
| The matte video is broken, or it has no alpha | Give up the person treatment. Do not stop the picture itself. Warn. |
| `fps` is invalid (missing, 0 or below, or not a number) | Continue with no person treatment, and warn. |
| Unknown `quality` or `tool` | Not an error. The consumer falls back to the default handling. |
| The matte is shorter than the footage | Neither an error nor a warning. Treat the range past the matte as no matte (section 4). |

**The writer is strict. The reader is tolerant.** Static validation (section 7) rejects a bad shape as an error. A consumer ignores a broken matte at runtime and continues. Those two behaviors do not conflict. The first is the gate that refuses to write a broken file. The second is the insurance that still produces a picture when a broken file is handed over. This two-step pattern is already set by `beats` (section 4 of `contract-2026-07-22-edit-json-v1-beats.md`).

## 6. Generation is an optional stage

**Do not generate a person matte for every footage item.** Generate one only for footage that will use a person treatment, such as text-behind-person. The default flow of `analyze-footage` does not make a person matte. It writes `null`.

The reason is cost. Measured on a loaded machine, 8 seconds, 1280x720, 24 fps, balanced:

| Stage | Real-time ratio | Notes |
|---|---|---|
| Vision segmentation | About 1.7 times (58 ms/frame) | quality = balanced. The matte is fixed at 512x384. |
| VP9 alpha encode | All of the rest | The term that dominates wall-clock time. 7.7 times overall (8 seconds becomes 62 seconds). |

Raising quality stretches the Vision side (`accurate` is 135 ms/frame, peak 638 MB). `fast` makes a stair-step edge and does not reach delivery quality, so it is for a rough pass only.

| quality | engine | Use and measurement |
|---|---|---|
| `fast` | Vision | Rough pass only. A 256x192 matte. |
| `balanced` (the default) | Vision | Ordinary delivery use. A 512x384 matte. |
| `accurate` | Vision | Finish for a close shot. A 2016x1512 matte. |
| `best` | RVM mobilenetv3 | Specify explicitly only when hair-level detail is required. CPU measurement is about 178 to 289 ms/frame. |
| `best --model resnet50` | RVM resnet50 | A pickier setting, when still more processing time is acceptable. |

On Mac, `fast`, `balanced`, and `accurate` use Vision. `best` uses RVM. Windows is set in section 6.2.

### 6.1 ExecutionProvider rule for RVM

Run RVM on CPU only. In calibration, an acceleration execution provider produced a different matte from CPU, and the binary-mask IoU fell to 0.8057. If another execution provider is added later, the acceptance condition is to measure output agreement between the candidate and CPU on the same raw BGRA input, and to enable it only after measuring IoU approximately 1.0.

### 6.2 Windows

On Windows (`win32`), Vision is not available, so every quality step connects to RVM. `quality` keeps the value the user specified, both in the result and in `tracks.person_matte.quality`. The execution engine and the default model are fixed by the next table.

| quality | engine | Default model |
|---|---|---|
| `fast` | RVM | mobilenetv3 |
| `balanced` (the default) | RVM | mobilenetv3 |
| `accurate` | RVM | mobilenetv3 |
| `best` | RVM | mobilenetv3 |
| `best --model resnet50` | RVM | resnet50 |

On Windows, RVM is the only engine, so deploying the mobilenetv3 model is required. `--check` returns `available:false` and a `fetchHint` for how to obtain the model when the model is missing. On Mac, the Vision quality steps remain usable when the RVM model is missing, so the result stays `available:true`.

Do not launch ffmpeg and ffprobe by the OS PATH name. Resolve them with `resolveFfmpeg()` and `resolveFfprobe()` in `packages/media-bin`. On Windows that also searches the bundled per-platform binaries, and decode, VP9 alpha encode, and output validation all use the same resolution rule.

The procedure lives in `skills/analyze-footage/person-matte.md` (Japanese), the helpers under `bin/person-matte/`.

## 7. Validation

| Layer | What it checks |
|---|---|
| `packages/schemas/analysis.schema.json` | Defines the object shape as `$defs/personMatteTrack`. `path` and `fps` are required, with type and range, and `additionalProperties: false`. `tracks.person_matte` references it as a `oneOf` of null, string, or object. |
| The generation helper (`bin/person-matte/person-matte.mjs`) | Returns success only after ffprobe confirms that the written WebM has `codec_name = vp9` and the container tag `alpha_mode = 1`. An output that dropped alpha is not treated as success. The tag key's letter case can vary by the write path, so the comparison is case-insensitive. |
| The extra mask (`mask_path`) | ffprobe confirms `codec_name = h264`, `color_range = pc`, and that width, height, `r_frame_rate`, and `nb_frames` match the VP9 alpha WebM, and that `start_pts = 0`. |
| Meaning constraints in `skills/analyze-footage/analysis-json.md` (Japanese) | A person checks, before the file is fixed, the conditions JSON Schema cannot say. `path` resolves and the file exists. Time 0 of the matte video matches time 0 of the footage. `fps` matches the real fps of the matte video. |

This contract does not add a validation CLI dedicated to `analysis.json`. `packages/schemas/bin/` has `validate-edit` and others, and it does not have `validate-analysis`. `packages/edit-lint` only checks that it can read `analysis.json` as JSON. An `analysis.schema` check there is a syntax error only. Structural validation of `analysis.json` is designed to be the `analyze-footage` procedure, validation with a Draft 2020-12 validator. This contract does not change that split. Adding a container is not bundled with adding a validation mechanism.

edit-lint does not decode the matte video. It keeps the rule that it does not decode media without `--media`. The same reason and the same split as `beats` (section 7 of that contract).

## 8. Seats for later extensions

Outside this contract.

- `format` (`vp9_alpha_webm` or `hevc_alpha_mov`). The seat to open when a second format has to be stored. Today the file is fixed as VP9 alpha WebM (section 3), so there is no field that chooses a format.
- `spans` (the source-time spans where a matte exists). The seat to open when a matte needs to cover only part of the footage. Today the file is fixed as one video that starts at time 0 (section 4).
- `width` and `height`. The dimensions of the matte video. They can be read from the container, so they are redundant and are not stored.
- `provenance` (engine, OS, model version). The seat to open when reproducibility beyond `quality` and `tool` is required.

Each of those is a separate contract. This contract fixes only the container `tracks.person_matte`, and records that these seats may open later.

### 8.1 `mask_path` and `mask_format` (added 2026-08-27)

Open the `format` seat of section 8 as an extra output that does not replace the VP9 alpha WebM. Generating the VP9 alpha WebM that `path` points at, and the existing consumers, stay unchanged. `mask_path` is an extra file so the v2 frame-engine can use a grayscale mask that hardware can decode.

| Item | Spec |
|---|---|
| Container, codec, and profile | mp4, H.264 (`libx264`), High |
| Pixels | `yuv420p`. Y is alpha (0 is transparent, 255 is opaque). U and V are 128. |
| Range and color tags | Full range (`color_range=pc`). BT.709 primaries, transfer, and colorspace. |
| GOP and quality | GOP of 1 second or less, `crf 6`, `preset medium`, no B frames. |
| Time | Resolution, fps, duration, and frame count match the color source. The first PTS is 0. |
| Name | `<basename of the VP9 alpha WebM>.mask.mp4` |

The current value of `mask_format` is `"gray-h264-fullrange"`. A relative `mask_path` resolves the same way as `path`, against the directory that contains analysis.json, and the separator is `/`.

If `mask_path` is absent, or it cannot be resolved or validated, the consumer imports and converts once from the VP9 alpha WebM at `path` into a mask of this spec. If that also fails, give up the person treatment. Do not stop processing of the picture itself.

### 8.1 Mask reference on edit.json v2, and importing alpha footage

A v2 visual media item may hold an optional `mask`. The value is a reference to `sources[].id`, and the target is a `gray-h264-fullrange` video. An item that omits `mask` keeps the previous meaning.

When a VP9 alpha WebM, or a MOV with an alpha pixel format, is projected onto a layer `src`, a consumer that uses frame-engine generates `<basename>.color.mp4` and `<basename>.mask.mp4` once, in the same directory as the original footage. Color is straight-color H.264 in yuv420p. The mask is `gray-h264-fullrange` as specified in this section. Resolution, fps, duration, frame count, and the first PTS match. When an explicit `mask` is present, the color and mask import still runs, and the frame-engine mask input prefers the explicit reference.

A conversion failure is a non-fatal warning, and that layer alone is removed from frame-engine. The old `<video>` preview keeps the original footage `src`. The alpha filtergraph of the old legacy export did not use this import conversion. That export is now retired.

## 9. Known follow-ups

Homework this contract creates.

- The lightweight check in `packages/analysis-report` limits `tracks.person_matte` to "string or null" (`render-analysis-report.mjs`), and it rejects an object-shaped `analysis.json` as an error. That reader is outside this task's file boundary, so it was not fixed here. Before an object shape goes into real use, that reader has to follow the `oneOf`. The display's present-or-absent decision also runs on the truthiness of `tracks.person_matte`, so an object still reads as present.
  - `packages/analysis-report` has since followed the object shape and the display of `quality` and of the mask produced alongside (2026-08-28).
- Time sync of `<video>` is not implemented (`packages/overlay-runtime`). So "text-behind-person of a moving person" is not yet delivery quality even after this contract is in place. Being able to obtain a matte, and being able to ship that matte as a delivery composite, are different. The same judgment as "judge the current constraint first" in `skills/overlay-authoring/text-behind-person.md` (Japanese).
- Resolving a relative video URL from an overlay fragment is not in place, for both preview and export.

## 10. The wiring command person-cutout

`skills/analyze-footage/bin/person-matte/person-cutout.mjs` is a deterministic CLI that, in one run, generates a person matte for an edited cut and wires it into a v2 `edit.json`. Unlike the whole-footage matte of section 4, this places a project-specific cut-span matte directly on the edit track, without going through `analysis.json`.

### 10.1 Arguments and output rules

```text
--project <dir>                         Required. A project that has edit.json.
--cut <index[,index...]>                Required. Zero-based.
--quality fast|balanced|accurate|best   balanced when omitted.
--model mobilenetv3|resnet50            Allowed only with best.
--dry-run                               Return the plan only. Do not generate or rewrite.
```

Only v2 is accepted. v0 and v1 fail with a recovery note that says to migrate to v2 first. stdout is one JSON line on both success and failure. On success it includes `ok`, the matte paths and measured values, the layers added or updated, whether a track changed, and the validation result. On failure it returns `ok:false` and `reason`, and a non-zero exit code.

`--dry-run` does not change edit.json or the file system. The selection walks v2 `tracks[]` from bottom to top, and each `items[]` in declaration order, and takes a visual item with `source.kind:"media"`. An auto-generated `person-N` item and an `assets/matte/person-N.webm` source are excluded from the index population, so the same index still points at the same original cut after a rerun.

### 10.2 Place, time, and speed

The matte is fixed at `<project>/assets/matte/person-<cut index>.webm`. Resolve the original cut's source path, `source.in` and `source.out`, and the output `at` and `duration`. Use the project's integer fps.

When `source.speed` is present, apply the equivalent of ffmpeg `setpts=(PTS-STARTPTS)/speed` before generating the matte. When it is omitted, the speed is 1 if the source span and the output duration are within one frame. If they differ by more than that, the effective speed is `(out-in) / (duration/fps)`. The temporary video after the speed is applied is placed under `os.tmpdir()`, and it is deleted whether the run succeeds or fails. Pass the output fps to `person-matte.mjs`. The generated item's `at` and `duration` use the same integer frame values as the original cut.

### 10.3 The v2 track and z order

Current v2 has no top-level `layers[]` and no `timeline.tracks` from the old shape. The array order of `tracks[]` is itself the z order from the bottom of the picture to the top, and `items[]` of each visual track plays the role of the old layer item. The command therefore writes the following as native v2.

- `sources[]`: `{id:"person-cutout-N", path:"assets/matte/person-N.webm"}`
- The front-most visual track: `{id:"person-cutout", lane:"visual", items:[...]}`
- The item: the same `at` and `duration` as the original cut, `source.kind:"media"`, `in:0`, and `out:duration/fps`

Keep the mutual order of existing tracks. Insert or move only the person track to the end, the front. The person then sits above the HTML overlay and above telop. Do not change the default order that `deriveTracks` would produce.

### 10.4 Idempotence and the write gate

A rerun of the same cut updates the `person-cutout-N` source, the `person-N` item, and the existing matte. It does not add a duplicate. The person track is always one track. When several cuts are specified, items gather on the same track and are ordered deterministically by `at`, then by id.

A patch candidate is first checked by the v2 reader for a closed vocabulary, references, uniqueness, and integer frames. It is also written to a temporary edit.json in the same directory and passed through `packages/schemas/bin/validate-edit.mjs`. Only when both succeed does an atomic rename replace the original `edit.json`. If either fails, delete the temporary file and do not change the original edit.json at all. Do not make a backup. Git is the recovery path.
