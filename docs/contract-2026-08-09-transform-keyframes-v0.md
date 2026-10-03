**English** | [Japanese](./contract-2026-08-09-transform-keyframes-v0.ja.md)

---
lifecycle: implemented
created: 2026-08-09
updated: 2026-08-30
---

# Transform keyframes v0 (`layers[].keyframes` and v2 `items[].keyframes`), restored 2026-08-30

> **Restoration note (2026-08-30).** `packages/schemas/edit.schema.json` (the `$comment` on `layerKeyframe`, `layerItem`, and `keyframeV2`), `packages/schemas/bin/validate-edit.mjs`, `packages/render-cut/src/layer-keyframes.mjs`, and 10 other places referenced this contract, but the file was missing from every branch history. This text is rebuilt from the semantics that remained in those `$comment`s.
> **Successor.** [`contract-2026-08-30-motion-and-keyframes-v0.md`](./contract-2026-08-30-motion-and-keyframes-v0.md) §2 adds opacity, extends the easing vocabulary, and adds the `motion/` bag reference.
> This file records the v0 semantics. Do not append to it.

- Date: 2026-08-09. Implemented. `contract-2026-07-22-render-basics.md` §4-4 has a summary.
- Status: implemented. Active for both v1 `layers[].keyframes` and v2 `items[].keyframes`.

## 1. Semantics

> **2026-09-22, non-uniform scale v1.** `transform.scaleX` and `scaleY` are independent positive numbers.
> The effective value is `(scaleX ?? scale ?? 1, scaleY ?? scale ?? 1)`. Negative values and 0 are invalid.
> `source.kind === 'group'` cannot specify axes separately. The parent is always uniform.
> Composition with a uniform parent multiplies each child effective value by the parent's `scale`. The inverse divides by that same value.
> On write, if the two axes have equal effective values, fold them into `scale`. An existing `scale`-only declaration is left unchanged.
> Keyframes resolve each endpoint to that axis's effective value, then interpolate. Mixing `scale` and `scaleX` is allowed.
> Overlay CSS is `translate(...) rotate(...) scale(sx, sy)`. Overlay and footage both stretch on each axis and then rotate (R·S). Footage multiplies each axis into the crop width and height. A four-corner resize multiplies both axes by the same factor and keeps the aspect ratio.

- `keyframes[]` is the shared mechanism that moves a layer or item `transform`, `crop`, and `perspective` over time.
- `t` is **local time**. For v1, `layers[].keyframes[].t` is seconds inside the layer. `layerItem.t` is 0. This is the same rule as `cuts[].framing.keyframes[].t`. For v2, `items[].keyframes[].t` is an integer frame inside the item. `item.at` is 0.
- `transform`, `crop`, and `perspective` are separate optional properties. They are not one track per property. One point can move several properties at once.
- If both endpoints of a span declare the same property, that span uses **linear interpolation**. If only one endpoint declares the property, the span **holds** the nearest declared value.
- A property that no point ever declares holds the **static value** directly on the layer or item for the whole span. If that static value is omitted, the span holds the default of the matching `$def`.
- Each point sets `easing` for the **span that arrives at that point**, from the previous point to this point. The first point's `easing` is ignored. The default is `linear`. The vocabulary is `linear` and `ease-in-out`.
- A track needs two or more points, ascending `t`, and no duplicate `t`. `validate-edit.mjs` checks this. If `keyframes` is absent, or fewer than two points are usable, only the existing static values apply. There is no regression. The output stays byte-equivalent.
- render-cut composites keyframes onto the base picture after cut compositing, in `t` order. Preview reproduces the same interpolation with CSS or WebGL. See `contract-2026-08-02-preview-parity.md`.

## 2. Referenced from, at restoration

`packages/schemas/edit.schema.json`, `packages/schemas/bin/validate-edit.mjs`, `packages/render-cut/src/layer-keyframes.mjs`, `packages/render-cut/src/layers.mjs`, `packages/render-cut/test/layer-keyframes.test.mjs`, `packages/preview-server/test/layer-keyframes-visual.test.mjs`, `apps/shell/extensions/akari-preview/src/common/edit-summary-fields.ts`, `apps/shell/extensions/akari-preview/src/common/layer-keyframes-visual.ts`, `apps/shell/extensions/akari-preview/src/browser/akari-preview-open-handler.ts`, and that handler's test.
