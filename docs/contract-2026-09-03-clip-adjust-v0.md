**English** | [Japanese](./contract-2026-09-03-clip-adjust-v0.ja.md)

> Extended by v1 (curves, wheels, and hue). The source of truth is [contract-2026-09-05-clip-adjust-v1.md](contract-2026-09-05-clip-adjust-v1.md).

# edit.json v2 clip adjust v0

- Date: 2026-09-03
- lifecycle: accepted
- Place: the shared per-clip color-correction vocabulary for a v2 visual item, and the contract for introducing it in stages

## 0. Place

`adjust` is an optional field that applies basic correction and a 3D LUT to one visual item. Save, validation, Preview, and GPU and OSR Export use the same vocabulary and the same operation order. v0 is limited to 10 basic corrections and one LUT. It does not mix in curves or wheels.

Introduction is staged. M1 adds the seat to the schema, edit-store, the validator, lint, and the capability ledger. Until an engine consumes the field, a value that can be saved correctly is still `ignored` on the GPU and OSR capability ledger, with `runtime_warning: true`, and edit-lint returns an `engine.unsupported-field` error. An unimplemented field is not treated as if it had been drawn.

## 1. Seat

The seat is `tracks[].items[].adjust` on a visual lane in `edit.json` version 2. It is shared by the visual items this contract covers in the current schema (media, html, telop, filter, group, captions, and caption). It is not placed on an audio-lane item.

```jsonc
{
  "version": 2,
  "tracks": [{
    "id": "visual",
    "lane": "visual",
    "items": [{
      "id": "clip-1",
      "at": 0,
      "duration": 90,
      "adjust": {
        "basic": { "exposure": 0.35, "temperature": -0.1, "saturation": 0.15 },
        "lut": { "lut": "cinematic-warm", "intensity": 0.8 },
        "sections": { "basic": true, "lut": true }
      },
      "source": { "kind": "media", "src": "main", "in": 0, "out": 3 }
    }]
  }]
}
```

version 0 and version 1 `cuts[]` and `layers[]` do not gain an `adjust` seat.

## 2. Vocabulary

`adjust` is an object that allows no extra keys. Every field is optional.

| field | Type | Range and default |
|---|---|---|
| `basic` | object | No extra keys. An omitted value is `0` (neutral) |
| `lut` | `null` or object | `null` or omitted means no LUT |
| `sections` | object | A sparse dictionary of only the booleans `basic?` and `lut?` |

The 10 `basic` fields:

| field | Range | Unit and neutral |
|---|---:|---|
| `exposure` | `-3..3` | EV, `0` |
| `contrast` | `-1..1` | `0` |
| `highlights` | `-1..1` | `0` |
| `shadows` | `-1..1` | `0` |
| `blacks` | `-1..1` | `0` |
| `whites` | `-1..1` | `0` |
| `temperature` | `-1..1` | `0` |
| `tint` | `-1..1` | `0` |
| `vibrance` | `-1..1` | `0` |
| `saturation` | `-1..1` | `0` |

A `lut` object allows no extra keys. It requires a non-empty string `lut`. Optional `intensity` is `0..1`, and the default is `1`.

## 3. Numeric contract for basic correction

The math stays in video space, the gamma-encoded sRGB values. It does not convert to scene-linear. Input channels are `c = (r, g, b)`. `clamp01(x) = min(1, max(0, x))`. Rec.709 luma is `Y(c) = 0.2126r + 0.7152g + 0.0722b`. `smoothstep(a,b,x)` is `t = clamp01((x-a)/(b-a))`, then `t²(3-2t)`.

The order is fixed.

1. exposure: `c *= 2^exposure`.
2. white balance: `r *= 1 + temperature*0.18`, `b *= 1 - temperature*0.18`, `g *= 1 - tint*0.12`, then `clamp01` each channel.
3. tone zones, in the order highlights, shadows, whites, blacks. Recompute luma from the current `c` just before each active step, and `clamp01` each channel after the step.
   - highlights: `c *= 1 + highlights*smoothstep(0.5,0.9,Y(c))`
   - shadows: `c *= 1 + shadows*(1-smoothstep(0.1,0.5,Y(c)))`
   - whites: `c += whites*smoothstep(0.7,1.0,Y(c))*0.3`
   - blacks: `c += blacks*(1-smoothstep(0.0,0.3,Y(c)))*0.3`
4. contrast: each channel becomes `(c-0.5)*(1+contrast)+0.5`, then `clamp01`. The pivot is `0.5`.
5. saturation: using the current Rec.709 luma, each channel becomes `Y(c) + (c-Y(c))*(1+saturation)`, then `clamp01`.
6. vibrance: from the current `max` and `min`, `S = max > 1e-6 ? (max-min)/max : 0` and `amount = vibrance*(1-S)`. Each channel becomes `Y(c) + (c-Y(c))*(1+amount)`, then `clamp01`.
7. External LUT: when `lut` is active, a trilinear sampler replaces `c`, and `intensity` linearly mixes the identity input with the LUT output.

The canonical constants are `REC709 = (0.2126, 0.7152, 0.0722)`, `TEMP_COEF = 0.18`, `TINT_COEF = 0.12`, and `CONTRAST_PIVOT = 0.5`. A consumer that bakes basic correction into a LUT uses `LUT_3D_SIZE 33`, R fastest, then G, then B, six decimal places per component, and trilinear interpolation at apply time.

## 4. Resolve order and bypass

The process order is fixed.

1. The item's `adjust.basic`
2. The same item's `adjust.lut`
3. Item composite on the timeline
4. `output.look` (the global LUT applied to the whole output)

Resolving `adjust.lut.lut` matches `output.look.lut`. A value with no slash resolves as `presets/luts/<id>/<id>.cube`. A value with a slash resolves as a path relative to the project root. Path separators cover both Windows and POSIX.

`sections` is a sparse dictionary. `sections.basic === false` bypasses the whole basic correction, and only that. `sections.lut === false` bypasses the item LUT, and only that. An omitted key means enabled. **OFF bypasses on both Preview and Export.** One side must not ignore OFF, and Preview and Export must not drift.

## 5. What consumers promise

The final consumers are the two exits, GPU Export and OSR Export. Both use the same `adjust` values, the 33³ bake, LUT reference resolution, apply order, and sections bypass, and they record whether item adjust was applied in the receipt.

Preview has a frame-engine WebGL2 rail and a DOM fallback rail. WebGL2 applies the LUT per item and per quad. The DOM fallback approximates the basic corrections CSS can express, and it does not call an inexpressible item or a LUT equivalent. Both rails evaluate `sections.* === false` first. When frame-engine is active, the DOM fallback is not applied a second time.

At M1, edit-store projects `adjust` onto the internal item declaration without loss, and that is as far as it goes. GPU, OSR, frame-engine, and DOM Preview do not consume it yet. The capability ledger says `gpu: ignored`, `osr: ignored`, and `runtime_warning: true` for every visual-item use, and the value reaches the frame-engine unknown-key warning. Only the change that introduces a consumer flips the ledger to `consumed`, and it does so together with a measurement.

## 6. How lint is split

- JSON Schema checks the closed object, types, numeric ranges, the required `lut` string, and the visual and audio seats.
- `validate-edit.mjs` adds no dependency and checks the same structural constraints by hand.
- The edit-store v2 reader rejects unknown keys, checks type and range, and projects onto the internal declaration.
- edit-lint deliberately duplicates the same structural check so it can stay dependency-free. Even when the structure is valid, M1's capability ledger makes `--engine gpu|osr|auto` emit an `engine.unsupported-field` error.

Do not confuse a structural error with an unconsumed error. A document with invalid structure does not proceed to the engine capability judgment.

## 7. What writers and the panel promise

A writer edits only a version 2 visual item. It does not rewrite version 0 or 1 into a flat approximate vocabulary. An identity state, where `basic` is all `0` or omitted, `lut` is `null` or omitted, and nothing but `sections` has an effect, deletes the `adjust` field itself. The schema still accepts an identity object so old reads stay compatible, but the canonical saved form omits the field.

Turning a section OFF in the panel may keep the values, so turning it ON again restores the same values. Consumers always ignore values while the section is OFF. A UI that can show and update a value is not the same as an engine that consumes it. While the field is unconsumed, the lint error and the runtime warning stay visible.

## 8. Out of scope

- Adding a seat on version 0 or 1 `cuts[]` or `layers[]`
- RGB curves, color wheels and CDL, hue curves, and effects (the M2 vocabulary)
- vignette (a spatial process, outside basic and LUT bake)
- Implementing the compositor, page-builder, Preview, inspector, or preset catalog in this change
- Structures past v0, such as `luts[]` for several LUTs or `layers[]` for an adjust layer
