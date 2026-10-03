**English** | [Japanese](./contract-2026-09-02-shape-item-v0.ja.md)

# Shape item v0

edit.json v2 `shape` source, lowered to inline SVG. The extended stored form and the lowering rules are in [Shape item v1](./contract-2026-09-25-shape-item-v1.md). v0 data still draws.

- Status: implemented (data contract and edit-store lowering). Panel exposure and inspector UI come later.
- Decided: 2026-09-02
- Implementation: `packages/schemas/edit.schema.json` (`itemSourceShapeV2`, `itemV2Shape`) and `packages/edit-store` (`src/shape-markup.ts`, `internal-model.ts`)

## 1. Purpose

Rectangles, lines, arrows, and bubbles can be declared as first-class edit.json v2 items without a footage file. There is no new renderer. The edit-store internal model **lowers a shape to an HTML Overlay that carries deterministic inline SVG**. The existing HTML path draws it for both Preview and Export.

## 2. Vocabulary v0

```json
{ "id": "shape-1", "at": 0, "duration": 90,
  "source": { "kind": "shape", "shape": "rect",
              "params": { "width": 600, "height": 340, "fill": "#f97316" } } }
```

- `shape` is `rect`, `rounded-rect`, `ellipse`, `line`, `arrow`, or `speech-bubble`.
- Every `params` field is optional. The object starts with `additionalProperties: false`. Widening it stays compatible. `width` is greater than 0 and defaults to 600. `height` is greater than 0 and defaults to 340. `line` and `arrow` default `height` to 80. `fill` defaults to `#f97316`. `stroke` defaults to absent, which means do not draw it. `strokeWidth` is at least 0 and defaults to 0. `line` and `arrow` default it to 8. `cornerRadius` is at least 0, applies only to `rounded-rect`, and defaults to 24.
- A color string that does not match `^[#a-zA-Z0-9(),.%\s-]{1,64}$` falls back to the default color, so a value cannot be injected into the SVG. Only finite numbers are accepted. A number outside its range falls back to the default.
- Position, scale, opacity, and animation stay on the shared item fields `anchor`, `transform`, `opacity`, `keyframes`, `motion`, and `animator`. `params` does not grow a second set of those controls.

## 3. Lowering

- `shapeMarkup(source)` in `packages/edit-store/src/shape-markup.ts` returns a byte-identical `<svg …>` string for the same input. The string does not depend on time, randomness, or the environment.
- The internal model treats a shape item as a peer of an HTML item. The Overlay declaration's `html` carries the inline markup. Because the string starts with `<`, render-cut `expandedHtmlOverlays` does not read a file. It passes the string through.
- Known limit: the SVG xmlns URI is detected as an absolute external URL by the GPU exit eligibility check. Export of a cut that contains a shape **falls back to the OSR exit** today. The drawing is still correct. Allowing the namespace URI is a follow-up.

## 4. Out of scope

- A shapes category on the footage panel. It shows Soon today. Inspector controls for `params`.
- Stamps. A stamp is not a new kind. An image asset covers it.

Origin: the footage-panel redesign round on 2026-09-02. The category table said shapes start as a new kind.
