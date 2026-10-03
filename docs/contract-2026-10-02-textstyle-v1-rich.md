**English** | [Japanese](./contract-2026-10-02-textstyle-v1-rich.ja.md)

# Text style v1, rich caption style vocabulary

- Date: 2026-10-02
- Status: B-1 draft, review before implementation
- Applies to: `default_text_style` and `captions[].text_style` in `captions.json`, and `style` in `akari-textstyle`
- Related: [Caption style preset v0](./contract-2026-09-02-captions-style-preset-v0.md), [runs v0](./contract-2026-09-24-caption-runs-v0.md), [My Style v0](./contract-2026-09-24-style-v0.md)

## 0. Ruling 4 revision and boundary

Revise ruling 4 of 2026-09-02 on 2026-10-02. The look of the letters in on-screen Captions is one kind of caption style. Widen the caption-style vocabulary to layered strokes, gradient and pattern fills, and offset shadows. Text content, glyph shape, and anything tied to timing stay in this contract's `text_style`. What stays on an Overlay is section 9.

Do not add CSS mask, textures that use `feTurbulence`, fragment-local `@keyframes`, decorations that are not letters, or a custom DOM layout to the vocabulary. Footage whose look needs those stays on the Overlay. Do not ship a quiet approximation as the same style. Do not change references to old Overlays or where paid Footage is placed.

## 1. Stored form and units

The new optional fields are `strokes` and `fill`. JSON holds expanded colors and numbers. It does not hold CSS strings or SVG.

```json
{
  "format": "akari-textstyle",
  "style": {
    "size_px": 72,
    "reference_height_px": 1080,
    "strokes": [
      { "color": "#382400", "width_px": 9, "offset_x": 2, "offset_y": 3 },
      { "color": "#f3d36d", "width_px": 4 }
    ],
    "fill": {
      "type": "gradient", "angle_deg": 180,
      "stops": [
        { "at": 0, "color": "#8e681d" },
        { "at": 50, "color": "#fff3c4" },
        { "at": 100, "color": "#9c7020" }
      ]
    }
  }
}
```

| Field | Rule |
|---|---|
| `strokes[]` | Outer to inner, back to front. Each element requires `color` and `width_px`, and may set `offset_x` and `offset_y`. Width is the visible radius outside the glyph outline, and is at least 0. Offset is output px. Positive x is right. Positive y is down. Omitted offset is 0. Color is the existing `hexColor` (`#RGB`, `#RRGGBB`, or `#RRGGBBAA`). An empty array means no stroke. Do not merge the array partially. |
| `fill.type: "solid"` | `color` is required. When only the existing `color` is present, draw a single color as before. |
| `fill.type: "gradient"` | `stops` has at least 2 points. Each `at` is a percent from 0 to 100, ascending, with the first at 0 and the last at 100. `angle_deg` is required and uses the same angle as CSS `linear-gradient()`. 90 is left to right. 180 is top to bottom. Duplicate positions are rejected. |
| `fill.type: "pattern"` | `pattern` with `id`, `scale`, `fg`, and `bg` is required. `id` is `diamond`, `dot`, `stripe`, `gingham`, `skull`, `hazard`, or `night`. `scale` is a positive number. 1 is the Footage tile size. `fg` and `bg` are `hexColor`. The renderer bakes the SVG data URI and the pattern definition. External URLs and arbitrary SVG are rejected. |

v1.1 (2026-10-02) adds `heart` and `thunder` to pattern `id` only, and allows `bg` to be `hexColor` or a gradient `{stops, angle_deg}`. `#RRGGBBAA` on `fg` is the shape alpha. Details are in section 11.

A type rejects the `color`, `stops`, `angle_deg`, or `pattern` fields it does not use. Omitting `fill` keeps the existing `color` and `fill_gradient` behavior. When `fill` and the old `fill_gradient` are both present, `fill` wins. When `strokes` and the old `stroke` or `stroke_inner` are both present, `strokes` wins for the whole stroke. A save that has only the old `stroke` normalizes to the same picture as a one-element `strokes` array, and does not rewrite the old value. Apply the current resolve rules to an omitted old `stroke` and to `method` first. The old `extrude`, `shadow`, and `glow` stay valid, and sit behind the rich fill and strokes.

The priority `default_text_style`, then `style_preset.style`, then the cue `text_style` stays as in v0. `fill` overwrites the whole object. `strokes` overwrites the whole array as one field. Do not mix one side's `fill.stops` or only `strokes[1]`. Switching a preset to another palette therefore drops the old stops and outlines. An existing `color`-only override does not overwrite a preset that has an explicit `fill`. A UI that changes the fill color regenerates the whole `fill`.

## 2. Draw order, scale, and color

1. Draw the plate. Then draw the existing `extrude`, `shadow`, and `glow` shadows.
2. Stack the same letters from `strokes[0]` forward, back to front. Each layer uses a transparent fill and `paint-order: stroke fill`, and sets the CSS width of `-webkit-text-stroke` to the equivalent of `2 × width_px` so the outer radius matches. Apply offset only to that layer. Do not add the previous layer's width.
3. Draw `fill` once in front. The fill layer has no stroke and no shadow. Close a gradient or pattern onto the glyph with `background-clip: text` and a transparent text fill. Solid uses the normal text color. `paint-order` is `stroke fill` on every path.

The reference resolution follows the existing exclusive rule for `reference_height_px` and `layout`. Convert declared px values (stroke width, offset, pattern tile) to output px at the same ratio as `resolveCaptionReferenceScale`, then divide by the effective font size at draw time to get `em`. `text_style.scale` applies only to the existing uniform transform of the whole plate. Do not multiply it into width or offset again before DOM layout. Letters and decoration therefore scale by the same rate. A run's letter scale changes the effective em inside the run, and the strokes and pattern in that same range follow. Do not add a non-uniform transform.

Shadows keep the current angle, distance, and opacity resolve in `captionTextShadowValue`. An offset outline is `strokes[].offset_x` and `offset_y`. Compositing CSS `text-shadow` and outline layers on the same node changes the overlap order, so put the shadow on its own back-most layer.

## 3. Pattern definitions and the conversion source

Lock the shapes, tile phase, base size, and stack order of the first 7 ids to `--i-fill` and the SVG data URI in the Footage fragments `assets/overlay/telop-pattern-*/fragment.html`. `diamond` stacks 45deg and -45deg stripes (each a 2px / 13px period, `fg` 32%) on a diamond SVG (width 26px, shape opacity .5). `dot` is two radial layers on a 16px tile. The center (8,8) fades from 2px to 3px at `fg` 50%. The center (0,0) fades from 1.6px to 2.6px at `fg` 35%. `gingham` is two lattice layers at 90deg and 0deg (each a 9px / 22px period, `fg` 55%). The 0deg layer starts at the bottom edge. The composite opacity at the crossing is .7975. `stripe` is bands. `skull` is a skull. `hazard` is a warning triangle. `night` is star dots and a star shape. The renderer picks a fixed template from the id and fills in the checked `fg`, `bg`, and `scale` to make a self-contained CSS image. The stripes, dots, and lattice of these three patterns use the same CSS gradient layers as the fragment. Only the diamond uses an SVG data URI. The same id and the same three values are the same pixel input on all 4 paths. When a Footage item's multi-color gradient or several independent colors cannot be reduced to one `fg` and one `bg`, either open a revised contract that adds another expanded color to the conversion preset, or leave it on the Overlay under section 9. A cutout that uses CSS `mask` is not part of this v1 pattern.

v1.1 adds separate source URIs for `heart` and `thunder` in section 11. Those two ids use a two-layer composite that lays a `bg` gradient under a transparent pattern, so the two-color reduction above does not apply to them.

### Conversion from an Overlay fragment to v1

Read the Footage letter layers in ascending `z-index`, and place the stroke layers into `strokes[]` from outer to inner in that same order. Convert a Footage `-webkit-text-stroke: Xem …` against the Footage base letter size `size_px` with `width_px = X × size_px / 2`. CSS stroke width falls half inside and half outside the glyph, and this contract's `width_px` is the visible outer radius. Convert a `transform: translate(...)` offset to output px by multiplying that layer's `offset_x` and `offset_y` by the base letter size.

A gold or navy fill layer's `linear-gradient(180deg, …)` becomes `fill` with `type: "gradient"`, `angle_deg: 180`, and `stops`. The `at` values of a 7-stop gradient use the percents written on the Footage, and each `color` is the hexColor expanded by the ratios in section 4. Move the fill layer's own `.012em` inner edge to the innermost `strokes[]` element, and do not leave a stroke on the fill. When several `text-shadow`s in Footage such as `telop-gold-3d` build an extrude, convert only the range that maps to the same picture in the existing `extrude` and `shadow` vocabulary. If a shadow count, placement, or texture that cannot be mapped is required for the look, send it to the Overlay stay rule in section 9. Do not quietly reduce it to one shadow.

Example. `telop-broadcast-gold` uses `size_px: 72` and `reference_height_px: 1080`. In `z-index` order, r0 `.185em`, r1 `.155em`, r2 `.095em`, r3 `.042em`, and the fill inner edge `.012em` become `width_px` 6.66, 5.58, 3.42, 1.51, and 0.43, at two decimal places. r0 is a transparent hairline. r1 is `#050505`. r2 is theme 32% plus black 68%. r3 is accent. The inner edge is theme 25% plus black 75%. Fill stop positions are 0, 26, 44, 50, 58, 78, and 100%, with `angle_deg: 180`.

## 4. Deriving colors from one hue

`deriveMetallicStops(hue, variant)` is a pure function in edit-store. It computes colors from the input `hue` (`hexColor`) with a linear `color-mix(in srgb, …)` of sRGB channels, and returns `stops` as hexColor. Preview, Export, and OSR do not call this function. They read only the stored expanded values. `variant` is an identifier that picks the stop positions of `gold` or `navy`. It is not an extra color control.

| Use | Mix ratio or stop position |
|---|---|
| Shadow | hue 52% plus black 48% |
| Middle | hue 100% |
| Highlight | hue 45% plus white 55% |
| Peak | hue 18% plus white 82% |
| Color ring | hue 32% plus black 68% |
| gold stop positions | 0, 26, 44, 50, 58, 78, 100% |
| navy stop positions | 0, 34, 47, 51, 62, 82, 100% |

The source of these ratios and positions is the Footage files `telop-broadcast-gold/conversion-notes.md` and `telop-broadcast-navy/conversion-notes.md`. Both variants assign shadow, middle, highlight, peak, highlight, middle, shadow across the 7 positions. Derive the ring from the same hue. Keep a fixed black ring `#050505` and any other rim color in each preset's expanded `strokes`. Changing the rim `accent` is a separate explicit operation that derives again. The gold outermost hairline is transparent. Navy is accent 65% plus transparent 35%. Derive the thin inner edge on both Footage fill layers as hue 25% plus black 75%, the Footage CSS `.012em`. A hue operation writes back the stops, the color ring, and the inner edge. It does not store only the original `hue` and derive on the renderer. Round each 8-bit sRGB channel to the nearest integer.

## 5. Living with `words[]`, `runs[]`, and karaoke

`words[]` decides only time and token boundaries. Apply the same resolved rich look to each `.akari-caption__tok`. Leave per-token CSS animation, delay, and `data-*` on the outer tok. Take background coordinates from the line's shared origin so splitting letters does not shift the phase of a gradient or pattern. Do not restart the gradient at 0% on each word.

`runs[]` keeps the grapheme range and last-wins rule from [runs v0](./contract-2026-09-24-caption-runs-v0.md). Do not add to the 9 fields a run may hold. Map a run's `color` and `stroke` to a solid fill and a single-layer stroke override for those letters, and let them beat the base `fill` and `strokes`. Letters that specify only a run color stop the base gradient or pattern on those letters. A run's `scale`, baseline, and rotate transform the letters and every decoration layer together. Finish the grapheme projection in `applyCaptionRunsToHtml` before copying layers. Build the copies from the projected drawing text, one grapheme at a time. Do not feed `aria-hidden` copy text back into the run's letter count.

Hang karaoke `char`, `word`, and `smooth` progress on the existing tok. Apply the difference between the unfired color and the done color only to the front fill layer. Keep outline and shadow colors fixed. Where `done_color` is required, treat it as that frame's solid fill. A smooth wipe clips the glyph inside the fill layer. Do not place an independent full-text layer on top of the copies. Resolve `emphasis_words` presets as before. If the same letters also have a run, the run wins.

B-2 tests added 2026-10-02. Stack karaoke, run, and emphasis on the same cue. `captions-textstyle-v1.test.mjs` checks that after run projection the DOM builds `__rich-shadow`, then `__rich-stroke`, then `__rich-fill`, and that copied letters are not fed back into the run grapheme count. The same test compares five 1080 by 1920 images from render-cut, shell Preview, preview-server, OSR, and the HTML before GPU raster. `caption-words.test.mjs` and `caption-display-policy.test.mjs` check the full-text frame rectangle, and that tiles are not used, when the ink extent exceeds 0.35em. Pixel comparison of the GPU composite frame itself, and the run result, wait for the commissioning side to run them. Child-process launch in this sandbox returns EPERM.

## 6. DOM contract for four paths plus GPU

render-cut's `renderStyledCaptionFragment` and its single-line fragment, the shell webview copy, preview-server, and OSR use the same resolved values and CSS. A single-line caption that has v1 fields still builds one `.akari-caption__tok` per word, and stacks only the inside. A caption without v1 fields keeps the existing HTML.

| Path | What B-2 keeps in sync |
|---|---|
| render-cut | `renderStyledCaptionFragment`, the single-line fragment, and `renderCaptionToken` in `packages/render-cut/src/captions.mjs`. Emit the same layer template from the resolved fill and strokes. |
| shell Preview | The webview copy in `apps/shell/extensions/akari-preview/src/browser/akari-preview-open-handler.ts`. Match run projection, tok time, CSS, and the layer template to render-cut. |
| preview-server | `MANAGED_CAPTION_STYLE_VARIABLES` in `packages/preview-server/public/caption-style.js`. Clear rich variables when the cue updates so the previous pattern does not leak. The draw fragment matches the template above. |
| OSR | `scopeCaptionStylesInSheet` in `packages/osr-export/src/caption-style-scope.mjs`. Scope new `.akari-caption__*` CSS per caption so it does not apply to another cue's layers. |
| GPU | Keep the token, line, and plate rectangles that `buildCaptionWordTiles` receives in `packages/frame-engine/src/timeline/caption-words.ts` as they are today. Tile decisions from ink extent are the paragraph below this table. |

Update `caption-visual-contract.json` as the shared variable list and the source of the single-line CSS. Shared CSS generation uses edit-store's resolved values. Paths do not derive colors again.

```html
<p class="akari-caption__line">
  <span class="akari-caption__tok ..." data-existing-timing="...">
    <span class="akari-caption__rich-shadow" aria-hidden="true">Text</span>
    <span class="akari-caption__rich-stroke" aria-hidden="true" style="--caption-rich-stroke-width:...;--caption-rich-stroke-offset-x:...em;--caption-rich-stroke-offset-y:...em">Text</span>
    <!-- repeat in strokes order -->
    <span class="akari-caption__rich-fill">Text</span>
  </span>
</p>
```

This structure is a proposal. The boundaries to keep are these. `.akari-caption__tok` stays one element per word. Do not change its outer box, class, time, or animation, and give it `position: relative`. Inner shadow and stroke layers are `position: absolute; inset: 0; white-space: pre; pointer-events: none`. Only the front fill is in normal flow and creates width and height. The shadow layer's text color is transparent so only the shadow draws. Copy layers are `aria-hidden="true"` and are not edited, copied, or measured. Every layer shares the ancestor's `font`, letter spacing, line height, and `text-transform`, and the drawn string is the same. When `.akari-caption__char` already exists, keep its outer measurement box and put the same stack inside it.

Put `--caption-rich-stroke-offset-x` and `--caption-rich-stroke-offset-y` on each stroke layer's inline style as `em` converted from the output px in section 2. Shared CSS applies `transform: translate(var(--caption-rich-stroke-offset-x, 0em), var(--caption-rich-stroke-offset-y, 0em))`. `-webkit-text-stroke` on that same layer uses `--caption-rich-stroke-width` (`em` equivalent to `2 × width_px`) and `--caption-rich-stroke-color`. Only the `inset: 0` absolute layer moves by transform, so the outer box of `.akari-caption__tok` does not change. The back-most `.akari-caption__rich-shadow` takes the `--caption-text-shadow` that edit-store resolved from the existing `extrude`, `shadow`, and `glow`, and draws it as `text-shadow` with `color: transparent` and no stroke. All 4 paths use this same CSS declaration and the same resolved values. A path does not rebuild the shadow on its own.

GPU measurement uses the existing rectangles of `.akari-caption__tok`, `.akari-caption__line`, and the plate, and does not list inner layers as tokens. `buildCaptionWordTiles` cuts tiles with `0.35 × emPx` of padding above and below, so a cue whose real ink extent from outline, shadow, or pattern exceeds that padding does not use tile splits. It uses a full-text frame caption texture. B-2 shows no clipping with that decision and a 1080 by 1920 pixel compare. Do not grow the letter's outer box to make room for decoration.

## 7. Proposed CSS variables

Add the following to `resolved_caption_style_variable_names` in `packages/edit-store/src/caption-visual-contract.json`. They are resolved values for the whole cue, and they also go on preview-server's managed list.

```json
["--caption-rich-fill-color", "--caption-rich-fill-image", "--caption-rich-fill-size", "--caption-rich-fill-position"]
```

Add the same names with a tok prefix, `--caption-tok-rich-fill-color`, `--caption-tok-rich-fill-image`, `--caption-tok-rich-fill-size`, and `--caption-tok-rich-fill-position`, to `resolved_caption_word_style_variable_names`. A word preset changes only the tok and does not leak the line's value. The new `resolved_caption_rich_layer_variable_names` is these 4 names, placed only on each stroke layer's inline style.

```json
["--caption-rich-stroke-color", "--caption-rich-stroke-width", "--caption-rich-stroke-offset-x", "--caption-rich-stroke-offset-y"]
```

The fill image is a `linear-gradient(...)` built from checked stops, or a self-contained pattern CSS chosen by id. A gradient's fill size is the line's drawn width and height. A pattern's fill size is the fixed tile size times `pattern.scale`. Each tok's fill position is the negative of the tok's distance from the line's top left, so the pattern and gradient phase stay aligned when letters are split. Keep using old variables such as `--caption-fill-gradient` for the old stored form. v1 prefers the new variables. Do not copy arbitrary CSS from the input JSON into a variable.

## 8. Proposed `captions.schema.json` diff

`$defs.textStyle` keeps `additionalProperties: false` and adds only `strokes` and `fill`. `$defs.textStrokeStyle` stays unchanged for the old `stroke`. Define a new `$defs.richTextStrokeStyle` as `{color, width_px, offset_x?, offset_y?}` with `required: ["color", "width_px"]` and `additionalProperties: false`. `strokes` is `type: array`, `items` is that `$ref`, and an empty array is allowed. `$defs.textFillStop` requires `{at, color}`, and `at` is 0 to 100. `$defs.textFillStyle` splits solid, gradient, and pattern with `oneOf`. Each branch is `additionalProperties: false` and accepts only the required fields in section 1. `pattern.id` is an enum of 7 values. `scale` is `exclusiveMinimum: 0`. `fg` and `bg` are `hexColor`.

Add these 2 properties to `$defs.textStyle.properties`.

```json
{
  "strokes": { "type": "array", "items": { "$ref": "#/$defs/richTextStrokeStyle" } },
  "fill": { "$ref": "#/$defs/textFillStyle" }
}
```

Add these 3 definitions to `$defs`.

```json
{
  "richTextStrokeStyle": {
    "type": "object",
    "additionalProperties": false,
    "required": ["color", "width_px"],
    "properties": {
      "color": { "$ref": "#/$defs/hexColor" },
      "width_px": { "type": "number", "minimum": 0 },
      "offset_x": { "type": "number" },
      "offset_y": { "type": "number" }
    }
  },
  "textFillStop": {
    "type": "object",
    "additionalProperties": false,
    "required": ["at", "color"],
    "properties": {
      "at": { "type": "number", "minimum": 0, "maximum": 100 },
      "color": { "$ref": "#/$defs/hexColor" }
    }
  },
  "textFillStyle": {
    "oneOf": [
      {
        "type": "object",
        "additionalProperties": false,
        "required": ["type", "color"],
        "properties": {
          "type": { "const": "solid" },
          "color": { "$ref": "#/$defs/hexColor" }
        }
      },
      {
        "type": "object",
        "additionalProperties": false,
        "required": ["type", "stops", "angle_deg"],
        "properties": {
          "type": { "const": "gradient" },
          "stops": { "type": "array", "minItems": 2, "items": { "$ref": "#/$defs/textFillStop" } },
          "angle_deg": { "type": "number" }
        }
      },
      {
        "type": "object",
        "additionalProperties": false,
        "required": ["type", "pattern"],
        "properties": {
          "type": { "const": "pattern" },
          "pattern": {
            "type": "object",
            "additionalProperties": false,
            "required": ["id", "scale", "fg", "bg"],
            "properties": {
              "id": { "enum": ["diamond", "dot", "stripe", "gingham", "skull", "hazard", "night"] },
              "scale": { "type": "number", "exclusiveMinimum": 0 },
              "fg": { "$ref": "#/$defs/hexColor" },
              "bg": { "$ref": "#/$defs/hexColor" }
            }
          }
        }
      }
    ]
  }
}
```

JSON Schema alone cannot express first stop 0, last stop 100, ascending order, no duplicates, or the priority when `strokes` and the old `stroke` coexist. Check those when the validator and edit-store resolve. Do not delete the backward-compatible `stroke`, `stroke_inner`, `fill_gradient`, `extrude`, or `color`. `default_text_style` and cue `text_style` both use the same `$defs.textStyle`. The schema of `runs[].style` stays at v0.

### v1.1 schema diff (2026-10-02)

Extend only the pattern branch of `textFillStyle`. Add `heart` and `thunder` to the `pattern.id` enum. `pattern.bg` is either the existing `hexColor` or `{ "stops": textFillStop[], "angle_deg": number }`. The object form uses the same rules as a gradient fill. At least 2 stops, first 0, last 100, ascending, no duplicates. Keep the old `bg` string, the other fill branches, and `additionalProperties: false`. `fg` accepts `#RRGGBBAA` from the existing `hexColor`, and keeps alpha when it is embedded in SVG.

## 9. What stays on an Overlay and what is open

v1 does not add these looks to the vocabulary. An arbitrary cutout through CSS mask. Noise texture from SVG `feTurbulence` or a filter. Fragment-specific `@keyframes` and independent motion of several elements. An independent layout of images, shapes, or other text. A multi-color pattern that cannot be reduced to v1 `fg` and `bg`. Footage that needs those stays on the Overlay. A look that holds with simple layered strokes, offset shadows, a gradient, and the 7 patterns converts to text style. Record the stay decision per Footage item during conversion.

Open items to decide before B-2 starts.

1. The range of the 7 patterns where reducing to `fg` and `bg` still matches the original art. If more colors are required, revise the vocabulary or leave the item on the Overlay.
2. How much of the rim accent the edit UI exposes. The gold and navy hue operation updates only the stops above and the ring derived from hue.
3. Compatibility that normalizes the old `stroke` CSS width difference across renderers (double on a line, equal on a word preset). Prefer pixel regression of old presets.
4. DOM replacement order, and where the GPU decides a tile is outside its extent, when karaoke smooth, run, and emphasis land on the same grapheme. Close it with tests that meet the look and rectangles in sections 5 and 6.
5. Adding `fill` and `strokes` to the look allow-list in [My Style v0](./contract-2026-09-24-style-v0.md) is a separate ticket. Do not confuse it with loading a v1 preset.

After review, B-2 and B-3 take old `captions-textstyle-v0` regression, rich samples, and pixel comparison of the 4 paths plus GPU as acceptance. This document alone does not turn drawing on.

## 10. Review rulings (2026-10-02)

- Clarification 1, hue round trip. The design stores only expanded values, so fix the rule the UI uses to restore the current hue. `hue` is the middle stop of `fill.stops`, the color at hue 100%. For gold that is not the midpoint between `at: 44` and `at: 58`. It is the middle in the sequence shadow, middle, highlight, peak, highlight, middle, shadow, meaning the color of the 2nd and 6th stops. `variant` is whichever of gold or navy the existing `stops[].at` sequence matches. A preset that matches neither does not show the hue control. The operator edits the expanded values directly.
- Clarification 2, text-color UI. A UI that changes text color on a preset that has `fill` writes `fill: {type: "solid", color}`, not `color`, so the control does not look dead. If the inspector implementation is outside B-2 ownership, record it as a TODO in this contract.
- Open 1. Which patterns still match the original art after a two-color reduction is decided per Footage item by the Footage-side sort B-1. A pattern that cannot be reduced stays on the Overlay.
- Open 2. The rim `accent` is not shown in the v1 UI. The owner asked for one hue control. Keep it only in the preset's expanded `strokes`.
- Open 3. v1 does not normalize the per-path width difference of the old `stroke`. Prefer pixel regression of old presets (`captions-textstyle-v0`). Normalization is a separate ticket.
- Open 4. B-2 closes the question with tests that meet the look and rectangles in sections 5 and 6, and appends the result to section 5.
- Open 5. Adding `fill` and `strokes` to My Style looks is a separate ticket. Agreed.

TODO, outside B-2 ownership. The inspector's text-color control, for a preset that has `fill`, saves `fill: {type: "solid", color}` rather than `color`.

## 11. v1.1 (2026-10-02)

Footage-side sorting established that `telop-pop-heart` has a gradient ground and `telop-pop-thunder` has a repeating stripe ground (`repeating-linear-gradient`). A single-color `pattern.bg` cannot represent the original art. v1.1 approximates the `thunder` stripes with a two-color gradient. A gradient `pattern.bg` expands stops and angle at save time. At draw time, composite in this order: `background-image` is the transparent pattern SVG, then `linear-gradient(...)`. For ids other than `diamond`, `dot`, and `gingham`, a `bg` string keeps the v1 single layer (the `<rect>` inside the SVG) byte for byte. Use two layers only when `bg` is a gradient object. Those three patterns keep the CSS gradient layers in section 3, so even a string `bg` lays a single-color CSS gradient at the back. The first layer's size is the base tile times `scale`. The ground gradient is the line's whole drawn rectangle. Align each layer to the line's shared origin, and do not reset the phase after a `words[]` split. Do not bake the ground color into the transparent SVG.

| Item | v1 | v1.1 |
|---|---|---|
| `pattern.id` enum | `diamond`, `dot`, `stripe`, `gingham`, `skull`, `hazard`, `night` | Add `heart` and `thunder` |
| `pattern.bg` type | `hexColor` string | `hexColor` string or `{stops, angle_deg}` |
| `fg` alpha | Accept `#RRGGBBAA` from `hexColor` | All 9 ids keep alpha on the SVG `fill` and composite it with the shape's own opacity |
| CSS composite `background-image` | One layer, `url("<pattern SVG that has a rect>")` | `diamond`, `dot`, and `gingham` use the section 3 CSS gradient layers plus a ground CSS gradient. Other ids match v1 bytes when `bg` is a string. Only a gradient `bg` uses two layers, transparent pattern then `linear-gradient(...)` |
| Phase and tile size | Default tile and phase of the first 7 ids | `heart` is 14px. `thunder` is 30px. `thunder` phase is 4px and 2px. One layer has one position pair and one size pair. Two layers have two position pairs, and sizes are the tile and the whole line |
| `night`, `skull`, `stripe` out of scope | The ids are accepted | Footage text-style conversion does not cover them. `night` has star dots in another color. `skull` is a two-color SVG. `stripe` needs an independent diagonal gradient |

The shapes, base tile size, phase, and opacity of `heart` and `thunder` take the SVG data URI in `telop-pop-heart/fragment.html` and `telop-pop-thunder/fragment.html` as the source. `fg` is `hexColor`, including `#RRGGBBAA`, and the 8-bit alpha multiplies the SVG shape opacity. `#RRGGBB` and `#RGB` are opaque. Letter strokes and shadows use the existing v1 layer rules.

This revision does not add `night` (star dots in another color), `skull` (two-color SVG), or `stripe` (an independent diagonal gradient) to the vocabulary. That Footage stays on the Overlay. Draw paths and GPU Export use the same edit-store expanded values and CSS, and do not rewrite v0 or v1 stored values.
