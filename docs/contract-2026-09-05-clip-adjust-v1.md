**English** | [Japanese](./contract-2026-09-05-clip-adjust-v1.ja.md)

---
lifecycle: accepted
date: 2026-09-05
---

# edit.json v2 clip adjust v1

## 0. Place

v1 adds curves, wheels, hue, and per-pixel fx on top of v0's basic correction and LUT.

## 1. Seat

`tracks[].items[].adjust` on a version 2 visual item. Shared by the seven definitions media, html, telop, filter, group, captions, and caption. Not added to audio, shape, or version 0 and 1 `cuts[]` and `layers[]`.

## 2. Vocabulary v1

`$defs.adjustV1`. v0 `basic`, `lut`, and `sections` do not change. The fields below are added. All are optional, and `additionalProperties` is false.

- `curves` is an object `{ master?, r?, g?, b? }`. Each value is `[{ in: number 0..1, out: number 0..1 }]`, minItems 2, maxItems 16, `additionalProperties` false on each point, and both `in` and `out` required. **`in` is strictly increasing.** The schema cannot express that, so validate-edit, edit-store, and edit-lint check it. A channel identity is exactly two points `[{0,0},{1,1}]`, with a tolerance of 1e-5.
- `wheels` is an object `{ lift?, gamma?, gain?, offset? }`. Each value is an object `{ r?, g?, b? }` of numbers. Ranges are lift ±0.25, gamma ±0.5, gain ±0.5, and offset ±0.1. Omitted means 0 (neutral).
- `hue` is an object `{ hue?, sat?, luma? }`. Each value is `[{ hue: number 0..1, value: number 0..1 }]`, minItems 1, maxItems 16, `additionalProperties` false, and both fields required. **`hue` is strictly increasing.** The neutral value is 0.5. A channel identity is omitted, or every point has `|value-0.5| ≤ 1e-4`.
- `fx` is an array, maxItems 8. Each element requires `id` and has `additionalProperties` false. The same id appears at most once. Array order is apply order. A writer removes an empty array. A reader treats a missing array the same way.
- `sections` adds `curves`, `wheels`, `hue`, and `fx` beside `basic` and `lut`. Each is a boolean, and false is the only bypass.
- **Operation order is fixed.** (1) basic, v0 section 3 steps 1 through 6. (2) lut, trilinear, mixed by intensity. (3) wheels. (4) curves. (5) hue. (6) fx.
  - (3) wheels, per channel: `c = v*(1-lift)+lift`, then `c = pow(max(0,c), 1/(1+gamma))`, then `c *= 1+gain`, then `c = clamp01(c+offset)`. lift, gamma, gain, and offset are that channel's values. Omitted means 0.
  - (4) curves are piecewise linear. Evaluate the points in ascending `in`. `x` at or below the first `in` uses the first `out`. `x` at or above the last `in` uses the last `out`. Otherwise linearly interpolate the two surrounding points. `clamp01` each evaluation. **Apply master to all 3 channels, then apply r, g, and b to each channel.**
  - (5) hue. RGB to HSV: `d = max-min`. Compute h only when `d > 1e-4`. When `cmax===r`, `((g-b)/d+6)%6`. When `cmax===g`, `(b-r)/d+2`. Otherwise `(r-g)/d+4`. Divide by 6. `s = cmax > 1e-4 ? d/cmax : 0`. `v = cmax`. Then `shift = (sample(hue, h)-0.5)*2`, `h' = (h+shift+1) % 1`, `s' = clamp01(s * sample(sat, h)*2)`, `v' = clamp01(v * sample(luma, h)*2)`, then HSV to RGB. `sector = floor(h'*6)` splits into 6. `c = s'v'`. `x = c(1-|((h'*6) mod 2)-1|)`. `m = v'-c`. `clamp01` each channel. `sample(ch, h)` evaluates the points in ascending hue. Zero points returns 0.5. One point returns that value. Outside the range uses the endpoint. Between points is linear. **All 3 channels sample the h from before the conversion**, matching the old implementation.
- Identity, the writer's rule. When basic is all 0, there is no lut, wheels are all 0, every curves channel is identity, every hue channel is identity, and there is no fx, remove the `adjust` field itself. Same as v0 section 7.
- A v1 document of `cuts[]` or `layers[]` does not gain a seat. Same as v0.
- A look preset (D13) is not vocabulary. `presets/looks/index.jsonl` is `{id, kind:"look", name, description, when_to_use}` plus `presets/looks/<id>.json` = `{ "id": "<id>", "adjust": { "basic": {...}, "wheels": {...} } }`. The contents of `adjust` must fit `$defs.adjustV1`. A schema test enforces that.

Basic correction is exposure ±3 EV. contrast, highlights, shadows, blacks, whites, temperature, tint, vibrance, and saturation are ±1. All are optional. The default is 0. lut is null or `{lut: non-empty string, intensity?: 0..1}`, and intensity defaults to 1. No object allows extra keys.

Every `fx` parameter is optional. The default is in parentheses.

| id | Parameters and range (default) | Meaning |
|---|---|---|
| `vignette` | `amount` -1..1 (0.5), `midpoint` 0..1 (0.5), `roundness` -1..1 (0), `feather` 0..1 (0.5) | Edge darkening in the local 0..1 box after crop. A negative amount brightens. roundness interpolates from a rectangle (-1) toward a circle corrected for aspect (1). midpoint is the start. feather is the transition width. 0 is a step |
| `blur` | `px` 0..50 (8) | The radius is output px, converted to working texels as `px × outputSize.x / 1920`. A separable Gaussian, horizontal then vertical, two passes (σ = converted radius / 2, at most 33 taps per pass). A large radius scales the viewport down by 1/2^k and bilinear-scales up on the next pass. Samples clamp inside the crop |
| `grain` | `amount` 0..1 (0.3), `size` 0.5..4 (1) | Deterministic noise from the working-space pixel and the output frame number. `floor(workPixel / size)` and the frame number go into an integer hash. Add ±amount×0.15 to RGB together, which changes luminance. Do not hash with sin |
| `sharpen` | `amount` 0..1 (0.5) | Add `rgb + amount × (rgb − average)` against the 3×3 average of working texels, then clamp |
| `glow` | `intensity` 0..1 (0.5), `radius` 0..100 px (20), `threshold` 0..1 (0.7), `warmth` -1..1 (0) | Bloom on bright areas. Four passes: a bright-pass where Rec.709 luma is at or above threshold, Gaussian horizontal, Gaussian vertical, then additive composite. warmth shifts the added color warmer or cooler |
| `clarity` | `amount` -1..1 (0.3), `radius` 1..50 px (10) | Three passes: Gaussian horizontal, vertical, then composite. `rgb + amount × (rgb − gauss(rgb, radius))`. A negative amount softens |
| `dehaze` | `amount` -1..1 (0.3) | One pass. Estimate transmittance from the min of a 3×3 dark channel and restore. Air light is white. The transmittance floor is 0.1. A negative amount adds haze |
| `denoise` | `amount` 0..1 (0.3) | One 5×5 bilateral pass. Range σ is amount × 0.25. Spatial σ is 2 working texels |
| `motion_blur` | `px` 0..100 (10), `angle` -180..180 degrees (0) | 17 taps along the angle, a directional blur of length px, one pass. 0 degrees is horizontal. A positive angle rotates toward the bottom of the crop-local frame |

Group 2 radius and px convert with the same output-px rule as blur (`output.width / 1920`). Zero strength is identity (intensity for glow, px for motion_blur, amount for the others). radius and threshold are not part of the strength test.

The old `cuts[].fx` is a read-compatible vocabulary. It is unrelated to `adjust.fx`. Engines ignore it, as before.

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

basic, then lut, then wheels, then curves, then hue, then (6) fx (array order, before mask, opacity, and blend), then the item composite, then output.look. Each side of a cut A/B that has active fx, and a layer, runs `applyAdjust` for steps 1 through 5 in a prep pass that draws the crop window at working resolution, then runs the effect passes in array order on two shared ping-pong FBOs. The working size clamps the crop's texel size by the output size. The FBO is allocated at the maximum output size and reused.

Pass counts are 1 each for vignette, grain, and sharpen, 2 for blur, 4 for glow, 3 for clarity, and 1 each for dehaze, denoise, and motion_blur. For the glow and clarity composite source, copy the image from just before that effect into a reused texture. Do not add an FBO. A later effect samples the neighborhood of the earlier effect's result. The composite reads the final result instead of the original source, and does not apply adjust twice. mask, opacity, and blend apply after the pass list, as before.

Spatial processing is not baked into a LUT. No fx, an empty array, every effect at zero strength, or `sections.fx=false` skips prep and uses the old direct path. Output with no fx is byte-identical.

A LUT with no slash is `presets/luts/<id>/<id>.cube`. A LUT with a slash is project-relative, with Windows and POSIX separators. `sections` bypasses a stage only when that key is false. OFF bypasses on both Preview and Export. Saved values may be kept.

33³, R fastest then G then B, each component stored as Float32 after `toFixed(6)`, trilinear at apply time. Normalization clamps the range, sorts point lists ascending, and fills omitted defaults. A validator rejects a bad point list. It does not repair it. An interpolation span below 1e-9 uses the left point. curves identity is an absolute difference below 1e-5 on each delta, matching the old implementation. hue identity is at most 1e-4. The operational identity tolerance for basic is 1e-6.

Note. hue value 1.0 is +360 degrees (one full turn) by `(value-0.5)*2`. +180 degrees is value 0.75. The old implementation's formula wins.

## 5. What consumers promise

At M2-1 the three new sections are not consumed by an engine. The bake function exists and is not wired into the plan. Delivery 2 of 4 wires it. GPU, OSR, and frame-engine Preview use the same full-stage bake and bypass. The DOM fallback cannot approximate the three new sections in CSS, so it does not apply them. Color adjustment shows an approximate-display mark. Among fx, only blur is approximated with CSS `filter: blur()`. The other fx are not applied, and the approximate-display mark says so. When frame-engine is active, do not apply twice. The ledger is per adjust path, and this change does not add a row.

## 6. How lint is split

Schema checks the closed structure, types, ranges, point counts, and required keys. validate-edit, edit-store, and edit-lint also check that `in` and `hue` are strictly increasing. The dependency-free validators overlap on purpose. edit-lint returns the check id and the exact path for `adjust.curves.*`, `adjust.wheels.*`, and `adjust.hue.*`.

## 7. What writers and the panel promise

When every stage is identity, remove `adjust` itself. A reader allows an identity object. Turning a section OFF does not lose the saved value, so it can be restored. `isItemAdjustIdentity` is an effective judgment that accounts for OFF. It is not an instruction for the writer to delete values that are OFF. Applying a look replaces basic and wheels whole, and keeps lut, curves, and hue.

## 8. Out of scope

A split comparison, an effects UI, CSS approximation other than blur, render-cut (the ffmpeg path), implementing the old `cuts[].fx`, and a LUT library.
