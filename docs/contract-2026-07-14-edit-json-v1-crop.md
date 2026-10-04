**English** | [日本語](./contract-2026-07-14-edit-json-v1-crop.ja.md)

# edit.json v1 crop (reframing) contract

> Superseded on 2026-08-06. The `cuts[].crop` defined here (`keyframes[].box`, source seconds, relative to the source frame) was never implemented. It was replaced by `cuts[].framing.crop`, a single `{x,y,w,h}` object, relative to the output canvas, and static. Zoom is carried separately by `framing.keyframes`. The successor is section 6 of `contract-2026-07-22-render-basics.md`. The preview implementation is section 2.4.2 of `contract-2026-08-02-preview-parity.md` (Japanese). Sections 1 through 11 below stay as the design record from when the renderer did not implement this. Corrections are only this note. The body after it is not rewritten.

- Date: 2026-07-14
- Status: source of truth for the implementation round. Only the `cuts[].crop` field is fixed.
- Depends on: `contract-2026-07-13-m1-m4.md` (the fixed edit.json v0 contract), section 2 of `notes-2026-07-13-edit-json-v1.md` (Japanese), which this contract promotes, and `contract-2026-07-14-edit-json-v1-audio.md` (the precedent for version practice and degradation).
- Scope: only `cuts[].crop` in edit.json, the reframing rectangle for one cut. Layout in section 3 of the notes (placing several source rectangles) and multiple output profiles in section 1 of the notes are not covered here. They are the next stage.

## 0. How version is used

Backward compatible. **`version` stays `0`.** Do not bump it. Apply the same judgment as section 0 of `contract-2026-07-14-edit-json-v1-audio.md`.

- `cuts[].crop` is an optional field on a `Cut`. When it is absent, behavior matches v0 exactly. The whole cut is scaled, with letterbox or pillarbox, and there is no crop.
- The meaning and the coordinate system of the existing `cuts[].in` and `cuts[].out` do not change. `crop` only adds which rectangle of the footage frame to use during that cut.
- This is not the case the notes worried about, where an integer bump is reserved because crop would change the meaning of `cuts`. When `crop` is omitted, behavior is identical to the old scale plus letterbox. An existing edit.json runs with no edit.

## 1. Fixed schema

```jsonc
{
  "version": 0,
  "output": { "width": 1080, "height": 1920, "fps": 30 },
  "source": { "path": "sample.mp4", "proxy": null },
  "cuts": [
    { "in": 5.0, "out": 10.0 },                          // crop omitted = full frame, as before
    { "in": 30.0, "out": 35.0,
      "crop": { "keyframes": [
        { "t": 30.0, "box": [0.2, 0.0, 0.56, 1.0] }        // normalized [x, y, w, h]
      ] } }
  ]
}
```

### Fields

| Field | Type | Required | Default | Unit and coordinates |
|---|---|---|---|---|
| `cuts[].crop` | object, or omitted | No | Omitted means no crop. Full-frame scale plus letterbox or pillarbox, as before. | none |
| `cuts[].crop.keyframes` | array | Required when `crop` is present. At least one element. | none | Array. Element order matters (section 4). |
| `cuts[].crop.keyframes[].t` | number | Required inside an element | none | Source seconds. The same coordinate system as `cuts[].in` and `out`, and as `tracks.faces[].t` in `analysis.schema.json` (section 2). Not the timeline seconds of `audio.sfx[].t` (section 8). |
| `cuts[].crop.keyframes[].box` | `[number, number, number, number]` | Required inside an element | none | Normalized `[x, y, w, h]`. The same form as `faceBox` in `analysis.schema.json` (section 7). Each element is 0 to 1. The meaning constraints are `x + w <= 1` and `y + h <= 1`. |

## 2. Coordinates

Why `t` is source seconds.

`audio.sfx[].t` is timeline seconds, after cuts are joined, because it says where the sound plays in the final output (audio contract, section 1). Crop `t` is different on purpose.

- `crop.keyframes[].box` is information on the source side. It says which rectangle of the footage frame to cut out. That is the same subject as the `faceBox` definition, a normalized coordinate against the footage frame.
- The source of the data, `tracks.faces[].t`, is also source seconds. Analysis runs against the footage itself.
- Crop is a field inside a cut, and `in` and `out` are also source seconds. Keeping `t` in source seconds means generating from `tracks.faces` needs no time conversion (section 3). Converting to timeline seconds would force a recompute of crop `t` every time cut order changes or a later trim edit happens, and the source of truth would be stored twice.

`t` must fall inside that cut's `[in, out]`. A value outside the range is treated as a generation mistake and ignored (section 5).

## 3. Generation flow

From `tracks.faces` to `crop`.

The input is `tracks.faces` in `analysis.schema.json`, an array of `faceTrackPoint` with `speaker`, `t`, and `box`. After the cut list in the M5 editorial-judgment report (`contract-2026-07-13-m5-analysis-report.md`) fixes each cut (a keep-range), convert as follows.

1. Take the `tracks.faces` points that fall inside the cut's `[in, out]`. Whether to narrow them to the main speaker is a decision on the M5 side. This contract only receives the point list after that narrowing.
2. Copy the extracted `t` and `box` straight into `crop.keyframes[].t` and `.box`. Section 2 says the coordinate systems match, so no conversion is required.
3. If a cut that shows several speakers should be split into two vertical stacks, that is layout in section 3 of `notes-2026-07-13-edit-json-v1.md`, the next stage. It is out of scope here. It is not crop.

Smoothing and tracking are the analysis side's job. The original text in section 2 of the notes says the track is generated from face and person tracks (`tracks.faces`) and already holds a smoothed path. The analysis pipeline that generates `tracks.faces` is contracted to output `box` only after it has guaranteed a smooth path. The edit.json and crop side receive the raw coordinates as they are. They do not remove jitter and they do not worry about the tracking algorithm. That is the same split as the M5 rule that the product only composites. The v1 implementation in section 4, which uses only the first keyframe, is also evidence that the engine does not need to smooth a multi-point path.

## 4. v1 implementation scope

**v1 does not implement linear interpolation.** The notes proposal, a `keyframes` array as the crop rectangle changing over time, stays in the type as room for a later extension. The v1 export implementation is limited to the following.

- One keyframe. Apply that `box` as a fixed crop for the whole cut.
- More than one keyframe. Use only the first element, index 0, and warn. Do not sort by `t` and pick. Use index 0 in array order. The generation side follows the rule "put the one point you want first".
- Interpolation, linear or any other method, is the next stage. `keyframes[1]` and later are information v1 ignores. In the contract and in the implementation, treat them as reserved room for later.

This limit matches the round's choice not to chase the feature, and the section 3 decision that smoothing belongs to analysis. v1 first fixes the smallest unit, one cut and one static crop. Motion over time, a pan, is a later extension that interprets `keyframes` as several points for real.

## 5. Who does what

Preview is AVFoundation. Export is ffmpeg.

Follow the sandwich invariant in `design-2026-07-13-agent-native-architecture.md` (Japanese), and section 3 of the audio contract. Preview is the approximation. Export holds the exact result.

| Item | Preview (M1, `video_plane/macos.rs`) | Export (M4, `export/ffmpeg.rs`) |
|---|---|---|
| Apply crop | Out of scope for this contract. TODO. The v1 implementation ignores `crop` and shows the full frame, as before. | Cut the source frame with the ffmpeg `crop=w:h:x:y` filter, then connect it to the existing `scale` and `pad`. |
| Expected later implementation | Apply `setTransform` on `layerInstructions` of an `AVMutableVideoComposition`, and scale the crop rectangle up to fill the frame. That is an approximation. | No change. The implementation in this contract stays authoritative. |

Export is implemented alone because a preview transform means editing how M1 builds the composition in `macos.rs`, which is larger than this round (the back half of task 4, and do not chase it). Until then, judge a crop by the export, the same operational split as the ducking approximation in section 3 of the audio contract.

### Where the ffmpeg filter goes

Insert `cuts[].crop` in the per-cut filter chain (`cut_filter` in `export/ffmpeg.rs`), immediately after `trim` and immediately before `scale`.

```
[0:v]trim=start=..:end=..,setpts=PTS-STARTPTS,crop=w=..:h=..:x=..:y=..,scale=...,pad=...,setsar=1[v{index}]
```

Compute crop pixels from `box` (normalized) times the source's original resolution (`probe.width` and `probe.height` from ffprobe). That is not the output resolution `spec.width` and `spec.height`. Pass the cropped frame straight into the existing `scale=...force_original_aspect_ratio=decrease...,pad=...`. The crop rectangle is then scaled and letterboxed to fit the output canvas.

## 6. Degradation when a value is missing or invalid

Crop is a treatment. It must not decide whether that cut, or the whole picture, exports. This is the same idea as section 5 of the audio contract and the M5 rule "if it is no good, do not use it".

| Situation | Behavior |
|---|---|
| No `cuts[].crop` | As before. Full-frame scale plus letterbox or pillarbox. Not an error. |
| `crop.keyframes` is an empty array | Ignore the crop (full frame, as before) and warn. Other cuts and the rest of the export are unaffected. |
| `crop.keyframes` has more than one element | v1 uses only the first element and warns (section 4). |
| `keyframes[0].t` is not finite (NaN or Infinity) | Ignore the crop and warn. |
| `keyframes[0].t` is outside that cut's `[in, out]` | Ignore the crop and warn. Treat it as a generation mistake. |
| An element of `keyframes[0].box` is not finite | Ignore the crop and warn. |
| `box` has `w <= 0` or `h <= 0` | Ignore the crop and warn. |
| `box` has `x < 0`, `y < 0`, `x + w > 1`, or `y + h > 1` (it sticks out of the footage frame) | Ignore the crop and warn. |
| The source resolution cannot be read (0 by 0, and similar cases that should not be reached) | Ignore the crop and warn. |
| None of the above | Convert normalized coordinates to pixels and apply the `crop` filter. Clamp rounding error and a range outside the source inside the implementation. Do not error on a sub-pixel miss at the edge. |

Every degradation only removes the crop from that cut. Do not fail the other cuts, the overlays, the audio, or the export as a whole. Handle it the same way `audio::resolve` handles `warnings` (the result report and a stderr log).

## 7. Why the data is shaped this way

- Crop is a child of a cut, one entry of `cuts[]`, because `cuts` is what rebuilds the keep-range. Reframing is an attribute of that cut. It answers how to show that span. It is not like an overlay or like audio, which are independent elements tied to the whole timeline or to one time. A separate top-level array would need another id to keep the correspondence with the cut. A child field makes that bookkeeping unnecessary.
- `box` uses the same form as `faceBox`, normalized `[x, y, w, h]`, so generation from `tracks.faces` (section 3) needs no data conversion. Keeping the shape of "how a rectangle is written" the same across contracts makes the generation pipeline a copy of values. There is no place for a conversion mistake to enter. This follows the audio contract section 6 principle that the schema shape says the intent.

## 8. Check against analysis.schema.json

`faceBox` in `schemas/analysis.schema.json` (`prefixItems` of 4 elements, each 0 to 1, meaning constraints `x+w<=1` and `y+h<=1`) and `faceTrackPoint` (`speaker`, `t`, `box`) were checked. `cuts[].crop.keyframes[].box` in this contract keeps that `faceBox` range and those meaning constraints as they are. Do not let the array length or the range disagree with the analysis side. `crop.keyframes` does not carry `speaker`. By the generation flow (section 3) the target speaker is already fixed, and the executed form in edit.json does not need to carry it. That is the same judgment as section 7 of the audio contract. The executed form is where the approved result lands.

## 9. Common mistakes

- Passing timeline seconds in `keyframes[].t`, the coordinate system of `audio.sfx[].t` or `overlays[].start`. That is wrong. Crop `t` is source seconds, the same as `cuts[].in` and `out`. This is the reverse of the audio contract's habit. Section 2 states the reason.
- Expecting several `keyframes` to pan automatically, as a smooth move. v1 uses only the first element. Even linear interpolation is the next stage (section 4).
- Reading `box` as two diagonal points `[x1, y1, x2, y2]`. That is wrong. It is `[x, y, w, h]`, the same as `faceBox`. Width and height, not the end point.
- Skipping jitter removal where the crop rectangle is generated. That is the analysis side's job, when it generates `tracks.faces` (section 3). edit.json does not fall back to smoothing. Passing raw jumps through will not cause a large accident in v1, because v1 uses only the first point, but it will make the picture judder when the later interpolation is implemented.
- Writing pixel values into the crop coordinate conversion in the data. That is wrong. `box` is always a normalized coordinate from 0 to 1. Pixel conversion happens only inside the export implementation (`export/crop.rs`).
- Judging the final crop look in preview. The v1 preview ignores crop (section 5, TODO). Check the export.

## 10. Type sketch

Reference only. Not binding. The implementation round fixes the details.

The sketch assumes an addition to `src-tauri/src/video_plane/edit.rs`. As in section 9 of the audio contract, this contract binds the JSON schema in section 1 and the behavior in sections 4 through 6. It does not bind the Rust types.

```rust
/// Reframing inside a keep-range (cuts[]). See section 1.
/// When omitted, there is no crop (full-frame scale plus letterbox or pillarbox, as before).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Crop {
    pub keyframes: Vec<CropKeyframe>,
}

/// One crop point. `t` is source seconds, the same coordinate system as cuts[].in,
/// cuts[].out, and tracks.faces[].t (section 2).
/// `box` is a normalized [x, y, w, h] against the footage frame, the same form as
/// faceBox in analysis.schema.json (section 7).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CropKeyframe {
    pub t: f64,
    #[serde(rename = "box")]
    pub r#box: [f64; 4],
}

// Added on Cut. Existing fields do not change.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cut {
    #[serde(rename = "in")]
    pub r#in: f64,
    pub out: f64,
    #[serde(default)]
    pub crop: Option<Crop>,   // added in v1
}
```

`Cut` holds `crop: Option<Crop>`, which contains a `Vec`, so drop `Copy` and keep `Clone` only. v0 had `Copy`. The change is mechanical and comes with the new field. Behavior does not change.

## 11. Next stage

Out of scope here.

- Linear interpolation across several `keyframes` points. Section 4 left the type in place. The v1 implementation uses only the first point.
- Preview implementation, the transform on `AVMutableVideoComposition` (section 5 TODO).
- Layout in section 3 of `notes-2026-07-13-edit-json-v1.md`. Placing several source rectangles, for example two vertical stacks in a conversation.
- Several output profiles in section 1 of `notes-2026-07-13-edit-json-v1.md`. Short-form support.

The implementation order in the notes is audio, then crop, then the output profile, then layout. After this contract is fixed, the output profile is the next round.
