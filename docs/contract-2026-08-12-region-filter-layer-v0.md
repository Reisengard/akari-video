**English** | [Japanese](./contract-2026-08-12-region-filter-layer-v0.ja.md)

# Region filter layer v0

## 1. Background

Extend the central move of finger-frame. Besides corner-pin compositing of another picture, switch the look of the base picture itself, and only inside a frame made with the fingers. This use does not take a pasted footage input. It builds a filtered picture from the base picture and puts that picture back inside the given region only.

This document is the v0 contract for the additive `edit.json` extension `layers[].kind: "filter"`.

## 2. Semantics

- A layer with `kind: "filter"` has no `src`. It does not add a paste input other than the base picture.
- `filter` applies only inside the region. Outside the region, the base picture stays as it is.
- The layer's active time window is still `t` and `duration`.
- `opacity`, `track`, and `keyframes[].perspective` reuse the shared fields of an existing layer.
- `src`, `chroma_key`, `blend`, `crop`, and `transform` cannot be used when `kind` is `"filter"`.

## 3. Region source v0

The v0 region source is the quad in `perspective.corners`. Representation, the order of the four corners, the value range, and the degenerate-quad constraint reuse the existing `layerPerspective` as they are. When `keyframes[].perspective` is present, follow the existing perspective keyframe expansion rule and composite each time span as a static quad.

## 4. Frozen interface

```jsonc
{
  "id": "finger-frame-1",
  "kind": "filter",
  "t": 12.0,
  "duration": 2.4,
  "filter": { "type": "invert" },
  // or { "type": "lut", "id": "<id from presets/luts>", "intensity": 1.0 }
  // or { "type": "saturation", "value": 1.6 }
  "perspective": { "corners": [[0, 0], [1, 0], [0, 1], [1, 1]] },
  "keyframes": [
    {
      "t": 0.1,
      "perspective": { "corners": [[0, 0], [1, 0], [0, 1], [1, 1]] }
    }
  ],
  "opacity": 1.0
}
```

`filter` is the following closed union.

```jsonc
{
  "type": "object",
  "required": ["type"],
  "oneOf": [
    {
      "properties": { "type": { "const": "invert" } },
      "required": ["type"],
      "additionalProperties": false
    },
    {
      "properties": {
        "type": { "const": "lut" },
        "id": { "type": "string", "minLength": 1, "pattern": "\\S" },
        "intensity": { "type": "number", "minimum": 0, "maximum": 1 }
      },
      "required": ["type", "id"],
      "additionalProperties": false
    },
    {
      "properties": {
        "type": { "const": "saturation" },
        "value": { "type": "number", "minimum": 0, "maximum": 3 }
      },
      "required": ["type", "value"],
      "additionalProperties": false
    }
  ]
}
```

When LUT `intensity` is omitted, draw it as `1`.

## 5. Reserved, out of scope this time

- Region source `mask`. Reserved for using a per-pixel matte as the region. v0 implements it in none of the schema, the CLI, or the renderer.
- Filter type `"pixelate"`. Reserved as a future home for face-mosaic. It is not in the v0 closed union. Reject it if it is specified.

A reserved name does not mean the feature is available now.

## 6. Additive principle

This contract is an additive extension of the existing `kind: "baked"` and `kind: "video"`. It does not change required fields, composite order, or filter chains of existing kinds, and it does not change the validity or output of examples and fixtures. An existing input that contains no filter layer stays byte-equivalent to the previous output.

## 7. Implementation map

- `packages/render-cut/src/filter-mask.mjs` and `layers.mjs` build a per-frame scaled-down gray8 quad mask from the corner keyframes. They split the base picture, apply the look, and composite inside the region with `maskedmerge` against the enlarged mask. Each filter layer adds one `-i` for the mask video.
- `packages/akari-tools/bin/finger-frame.mjs` generates a layer from `--kind filter --filter invert|lut:<id>|saturation:<value>`. The layer has the same gesture window and corner keyframes as before.

## 8. Verification

L0 checks `node --test` for schemas, akari-tools, and render-cut, plus docs-sync, plus non-regression of existing baked and video. The ffmpeg command-generation test checks that a filter layer does not create an extra `-i`, and that the three filters and the perspective keyframe expansion produce a deterministic graph.

Measure the look, the elapsed time, and the input count of invert and LUT on 12 seconds of real footage separately, and record that in the verification report.
