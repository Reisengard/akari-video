**English** | [Japanese](./contract-2026-09-25-shape-item-v1.ja.md)

# Shape item v1

- Decided: 2026-09-25
- Stored on: `source.kind: "shape"` in edit.json v2
- Lowered to: a deterministic inline SVG HTML Overlay from edit-store

## 1. Stored form

Shape geometry is stored in `source.shape` and `source.params`. Position, scale, rotation, and time use the fields shared by every item. A placement from the shelf **copies the values**. `params.preset` records the source id. Draw time does not look that id up.

| Kind | Stored values |
| --- | --- |
| `path` | `params.path: {d, vb:[width,height], rule?}`. `d` uses only absolute `M/L/C/Z`. `rule` is `nonzero` or `evenodd` |
| Original shape, plus rounding | For `shape: "path"`, only `params.cornerRadius` is a percent from 0 to 100. 100 means half of the short side. Corners between straight segments are rounded in the placed pixel size. Among v0 shape names, only `rounded-rect` still rounds in px. The same field on the other v0 names does not affect drawing |
| `line` | `dash` is `solid`, `dash`, or `dot`. `startCap` and `endCap` are `none`, `triangle`, `chevron`, `bar`, `square`, `circle`, or `diamond`. Each has a matching `*CapFilled`. `lineCap` is `butt` or `round`. `arrow` is another name for an end triangle |
| `bubble` | `style` is `ellipse`, `rounded`, `rect`, `jagged`, `burst`, `cloud`, or `wobble`. `count` is 4 to 48. The other fields are `depth`, `jitter`, `seed`, `tail` (`point`, `dots`, or `none`), `tailAngle` (0 to 360), `tailLength`, `tailWidth`, `tailCurve`, and `dash` |

`fill` and `stroke` are `#RRGGBB`, `#RRGGBBAA`, `none`, `{type:"linear",angle,stops:[{color,offset}]}`, or `{type:"radial",stops:[{color,offset}]}`. A gradient has 2 to 5 colors. Offsets run from 0 to 1 and increase. Opacity is the AA on each color. `strokeWidth` is 0 to 100 and scales with output width, using 1920 px as the reference. A closed shape draws the stroke only inside the outline. An open line keeps the stroke on the centerline.

To round a rectangle, copy the shelf rectangle as a `path` and set `params.cornerRadius`.

Shelf defaults are a `#a6a6a6` fill with no stroke for a shape, `#000000` at 4 px for a line, and a white fill with a 5 px black stroke for a bubble. Old data keeps the v0 defaults and the SVG string. v1 values apply on items that carry the new kinds or fields.

## 2. Lowering and the outer edge

A path is copied into the draw area after the shelf viewBox padding is removed. Rounded corners and bubbles are rebuilt in placed coordinates. The SVG viewBox adds no extra padding. The visible edge is the basis for the selection frame and for snapping. Open lines, closed shapes, and bubbles share one dash pattern. A dot is a square whose length equals the visible thickness. A dash length is three times the visible thickness. The gap for both is `max(visible thickness × 2, 3px)`. An end part points inward from the endpoint and does not move the visible end.

Non-uniform item scale corrects stroke width, dash, and end size by `sqrt(scaleX×scaleY)`. Width still differs by axis. Preview and Export draw the same scaled SVG.

Gradient and inside-stroke SVG ids are separated per item, and the separation is deterministic. The same declaration produces byte-identical SVG. Preview lowers the shape into an HTML Overlay. This contract does not change SVG eligibility on the GPU exit. Export uses the existing OSR fallback.

## 3. Shelf

`presets/shapes/index.jsonl` is one preset per line. Each line has `id`, `category`, `name`, `vb`, `d`, `kind`, optional `rule`, optional `rounded_from`, and `defaults`. A bubble has `kind: "bubble"` plus params. A line has `kind: "line"` plus params. A rounded preset has `rounded_from: {base,radius}` and copies the source shape and the radius at placement. A generator script can write the same bytes again.

## 4. Follow-ups

Shelf UI, placement, point editing, animating a shape over time, and GPU eligibility are other contracts.
