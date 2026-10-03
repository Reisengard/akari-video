**English** | [Japanese](./contract-2026-08-30-motion-and-keyframes-v0.ja.md)

---
lifecycle: accepted
created: 2026-08-30
updated: 2026-09-06
---

# Motion and keyframes contract v0. Four levels (preset, keyframe, animator, code) and the `motion/` bag

- Date: 2026-08-30
- Status: **v0 (owner ruling 2026-08-29 to 2026-08-30, not implemented yet).** A mismatch found in the implementation task is resolved by appending.
- Depends on:
  - `contract-2026-08-30-edit-json-v2-object-tree-v0.md` (tree, bag, and part. This contract adds "motion" to those items).
  - `contract-2026-07-22-render-basics.md` §4-4, and `layerKeyframe` and `keyframeV2` in `packages/schemas/edit.schema.json` (the existing keyframe semantics).
  - `contract-2026-08-09-transform-keyframes-v0.md` (the v0 semantics. **Restored** today. §2 of this contract is the successor).
  - `contract-2026-07-25-project-structure-v0.md` (`motion/` was appended today).
- Scope: where and in what form motion lives on an edit.json v2 item (L0 through L3), the `motion/<group-id>.json` bag, the L2 animator data model, "expand to keyframes", and the **rules** for timeline and inspector display (the UI implementation is a separate contract).
- Design source (private): the decision note in the internal repo `akari-video-internal`, "object tree, timeline, and inspector design round (2026-08-29)", §6.9 through §6.15. Theatre.js, Lottie, Diffusion Studio, and HyperFrames Studio are **design references only. No code is ported** (Theatre.js studio is AGPL-3.0).

## 0. Place in the system. Motion has four levels, and the grain is the name tag's grain

| Level | What it is | Where it is written | Timeline display | Who uses it |
|---|---|---|---|---|
| **L0 preset** | In, out, and loop, plus controls | The item's `motion` (native). An HTML part uses `vars` (knobs, existing) | A small in mark and out mark at the two ends of the bar. No diamonds | Nine out of ten jobs, and the AI default |
| **L1 keyframe** | A property changing over time (position, scale, rotation, opacity, crop, perspective) | The item's `keyframes` (inline, at most 8 points) or the `motion/<group-id>.json` bag | Diamonds on the bottom edge of the collapsed bar. Expand to property rows | Someone building it the way After Effects does (focus mode) |
| **L2 animator** | A stagger per character, word, line, or phrase segment (a range selector plus an amount) | The item's `animator[]` (a few parameters). Offset keyframes go in the bag | Only the offset diamonds (a few). No per-character rows | Telop and caption performance |
| **L3 code** | CSS or GSAP animation inside a fragment | Inside the HTML (the escape hatch) | The bar only (the inside is opaque) | An AI, or an advanced user |

- **Grain equals the name tag's grain.** To move only part of a component on its own, attach a finer name tag (make the phrase segment a component) and emit it. Then L1 applies. Do not invent a third grain on the editor side.
- **Do not store per-character keyframes as data** (100 characters times 5 properties times 3 points is 1,500 points. Editing one character shifts all of them. An AI cannot handle it). Per-character motion is expressed at L2.

## 1. L0 preset `motion`

```jsonc
{ "id": "h-title", "at": 0, "duration": 90, "source": { "kind": "telop", "preset": "ref3_title", "params": { "text": "…" } },
  "motion": { "in": { "preset": "slide-up", "duration": 12, "ease": "out-cubic", "amount": 40 },
              "out": { "preset": "fade", "duration": 8 },
              "loop": { "preset": "float", "period": 90, "amount": 6 } } }
```

- Three seats: `in`, `out`, and `loop`. Each has `preset` (a string id), `duration` (integer frames. `loop` uses `period`), an optional `ease` (the §2.2 vocabulary), and an optional `amount` (the unit depends on the preset: px, percent, or deg).
- Initial vocabulary for `in` and `out`: `fade`, `slide-up`, `slide-down`, `slide-left`, `slide-right`, `scale`, `wipe`. For `loop`: `pulse`, `float`, `spin`. An unknown id is a lint warning (drawing ignores it). Adding vocabulary is an append to this contract.
- If `in` plus `out` exceeds `duration`, that is a lint error.
- L0 for an HTML part stays `vars`, as before (CSS variables `--anim-duration`, `stagger`, `distance`, `easing`, `delay`). `motion` is for a native item (telop, media, caption, or group).
- A group's `motion` applies to the whole set of children (a group is a small composition).

- **Implementation state (2026-09-06).** frame-engine draws `motion` in layer and cut evaluation. The shell preview, gpu, and osr exits use the same evaluation.
- Default `amount` values are in the next table. `scale` and `pulse` are a delta against a factor (0.2 means 20 percent). `spin` is the rotation direction (±1).

| Preset | Default `amount` |
|---|---|
| `slide-up`, `slide-down`, `slide-left`, `slide-right` | 40 px |
| `scale` | 0.2 |
| `pulse` | 0.05 |
| `float` | 6 px |
| `spin` | 1 (rotation direction) |

- Composition is **one stage that composites motion onto the keyframe result** (or onto the static value, if keyframes are absent). `dx`, `dy`, and `rotate` from `in`, `out`, and `loop` add. `scale` and `opacity` multiply. `reveal` (wipe) intersects.
- `wipe` is the visible ratio `reveal` inside the crop window. The hidden part is fully transparent. Even at a closed endpoint, the crop width and height stay at least `Number.EPSILON`, and opacity 0 makes it fully transparent.
- A seat whose `duration` or `period` is 0 or less, non-finite, or an unknown preset is ignored at draw time. An unknown preset is a per-seat lint warning `motion.unknown-preset` (the path is `.motion.in`, `.motion.out`, or `.motion.loop`).

## 2. L1 keyframes. Generalizing `keyframes`

### 2.1 Shape (only one: the point shape)

> **2026-09-22, non-uniform scale v1.** `transform.scaleX` and `scaleY` are independent positive numbers.
> The effective value is `(scaleX ?? scale ?? 1, scaleY ?? scale ?? 1)`. Negative values and 0 are invalid.
> `source.kind === 'group'` cannot specify axes separately. The parent is always uniform.
> Composition with a uniform parent multiplies each child effective value by the parent's `scale`. The inverse divides by that same value.
> On write, if the two axes have equal effective values, fold them into `scale`. An existing `scale`-only declaration is left unchanged.
> Keyframes resolve each endpoint to that axis's effective value, then interpolate. Mixing `scale` and `scaleX` is allowed.
> Overlay CSS is `translate(...) rotate(...) scale(sx, sy)`. Overlay and footage both stretch on each axis and then rotate (R·S). Footage multiplies each axis into the crop width and height. A four-corner resize multiplies both axes by the same factor and keeps the aspect ratio.

Keep the existing `keyframeV2` (optional properties per point, `t` an integer frame relative to the item) as the **only shape**, and add the following.

```jsonc
"keyframes": [
  { "t": 0,  "transform": { "x": -200 }, "opacity": 0 },
  { "t": 12, "transform": { "x": 0 },    "opacity": 1, "easing": "out-cubic" },
  { "t": 78, "transform": { "x": 0 } },
  { "t": 90, "transform": { "x": 200 },  "opacity": 0, "easing": { "transform": "in-cubic", "opacity": "linear" } }
]
```

- (a) Add **`opacity`** to the keyframable properties (existing: `transform`, `crop`, `perspective`).
- (b) **Extend the `easing` vocabulary.** Besides `linear` and `ease-in-out` (existing), add preset names (`in-quad`, `out-quad`, `in-out-quad`, `in-cubic`, `out-cubic`, `in-out-cubic`, `in-quart`, `out-quart`, `in-out-quart`, `in-expo`, `out-expo`, `in-out-expo`, `in-back`, `out-back`, `in-out-back`, `out-bounce`, `out-elastic`), `cubic-bezier(x1,y1,x2,y2)`, and `hold` (hold the previous value until that point, then switch instantly). Easing is **per span** (the span that arrives at that point). The first point's easing is ignored.
- (c) `easing` is a string (every property at that point) **or** `{ "<prop>": "<easing>" }` (per property). The per-row span easing in §7 is expressed this way.
- Interpolation, hold, and fallback to the static value stay the v0 semantics (restored contract §1). `minItems: 2`, ascending `t`, and no duplicates stay as they are.
- A point that moves an animator's selector may hold `"animator": { "<animator-id>": { "offset": 0.4 } }` (§4.3).

### 2.2 Inline or bag

```jsonc
"keyframes": { "path": "motion/g-hook.json", "count": 14 }
```

- **8 points or fewer may be inline. 9 or more go in the bag** (`motion/<group-id>.json`, §3). edit-store does the split at save time (the writer may pass an array). The threshold is part of the canonical serialization rule, so that one record stays one line.
- The reference shape is `path` (project-relative) plus `count` (that item's point count inside the bag. lint checks it). The load layer resolves the reference and hands the consumer the same array as inline. The consumer does not distinguish the shapes.
- `<group-id>` is the id of the **nearest group** the item belongs to (an item directly under a track uses its own id). The focus-mode unit equals the bag unit.

Where this applies on a media item (cuts) is the frame-engine base path (2026-09-01, issue #39). edit-store projects `crop` and `keyframes[]` (`transform`, `crop`, `opacity`) onto the cut, and GPU and OSR export evaluate them with layer-style geometry. `perspective` is not applied, and that is a warning.

## 3. The `motion/<group-id>.json` bag

```jsonc
{
  "version": 0,
  "group": "g-hook",
  "items": {
    "h-title": [
      { "t": 0, "transform": { "x": -200 }, "opacity": 0 },
      { "t": 12, "transform": { "x": 0 }, "opacity": 1, "easing": "out-cubic" }
    ],
    "h-logo": [
      { "t": 0, "transform": { "scale": 0.8 } },
      { "t": 18, "transform": { "scale": 1 }, "easing": "out-back" }
    ]
  }
}
```

- One file is one group (it holds the child items together). A key of `items` is an item id. The value is the point-shape array from §2.1 (**the same shape as inline in edit.json**).
- Serialization: one keyframe per line (sister contract §5.1). Ascending `t`.
- `motion/` is a **canonical directory directly under the project** (not regenerable. It is not `.akari/cache/`). `contract-2026-07-25-project-structure-v0.md` §8 (appended today).
- Save and undo are handled by edit-store in the same transaction as edit.json (the same method as captions.json). edit-store updates `count` on the edit.json side at save time.
- If a group is ungrouped or deleted, the bag becomes an orphan. That is a lint warning `motion.orphan` (do not delete it automatically).

## 4. L2 animator `animator[]`

### 4.1 Data model (range selector plus amount)

```jsonc
"animator": [
  { "id": "a1", "basis": "chars", "shape": "ramp", "start": 0, "end": 0.25, "offset": -0.25,
    "amount": { "y": 24, "opacity": -1, "blur": 4 }, "ease": "out-cubic" }
]
```

| Key | Type | Meaning |
|---|---|---|
| `id` | string | The animator's id (referenced from keyframes) |
| `basis` | `chars`, `words`, `lines`, or `segments` | The unit of the range (`segments` is a phrase segment. The v1 words fallback is §4.4) |
| `shape` | `ramp`, `triangle`, `round`, `smooth`, `square`, or `ramp-down` | The influence curve inside the range (0 to 1) |
| `start` and `end` | number, 0 to 1 | The range, as a ratio of the unit count |
| `offset` | number | A parallel shift of the range (-1 to 1). **This is what gets animated** (§4.3) |
| `randomize` | `{ "seed": integer }` | Shuffle the unit order. **Store a fixed seed** (the same input makes the same picture) |
| `amount` | object | The amount when influence is 1: `x`, `y`, `scale`, `rotate`, `opacity` (additive, -1 to 1), `letterSpacing` (px), `blur` (px) |
| `ease` | easing | Interpolation of influence from 0 to 1 (the vocabulary in §2.1 (b)) |

- For each unit u, influence is `w(u) = shape(pos(u), start + offset, end + offset)`, and the applied amount is `amount` times `ease(w)`. Several animators **add** (`scale` multiplies, and `opacity` is clamped to 0 to 1 after the add).
- The target is a text-family item inside `telop`, `caption` (a separated line), or `group`. An HTML part is L3 or `vars`.
- Correspondence with the existing motion grammar: `--anim-stagger` is about moving `offset` with keyframes, `--anim-distance` is about `amount.y`, and `--anim-easing` is about `ease`. The existing CSS variables stay alive (L0). The animator is L2 for a native item.

**Control-tower ruling (2026-09-06). Fix the unit position, the influence, and the amount.**

- Let `count` be the unit count and `u` the zero-based unit order. Assign **`pos(u) = (u + 0.5) / count`** (the center of each unit). When `randomize.seed` is present, shuffle the unit order with a **deterministic shuffle from an integer hash**, then assign pos. Do not use `Math.random` or `fract(sin())`.
- Let `s = start + offset` and `e = end + offset`. Influence is **`w = shape(pos, s, e)`**. If `s` is greater than or equal to `e`, `w = 0` for every shape. Otherwise use the next table (`clamp01(v) = max(0, min(1, v))`).

| `shape` | Formula for influence `w` |
|---|---|
| `ramp` | `ramp = clamp01((pos-s)/(e-s))` |
| `ramp-down` | `1 - ramp` |
| `triangle` | `1 - abs(2*ramp - 1)` (a triangle that is 1 at the center) |
| `round` | `sin(pi*ramp)` |
| `smooth` | `ramp^2 * (3 - 2*ramp)` |
| `square` | 1 when `s <= pos < e`, otherwise 0 |

- Multiply influence by `ease` to get **`k = ease(w)`**. `ease` is the vocabulary in §2.1 (b). The default is `linear`. The contribution to each amount is `amount` times `k` (the applied scale factor is in the next table).

| `amount` key | Unit and applied amount |
|---|---|
| `x`, `y`, `letterSpacing`, `blur` | Output px. The reference width is 1920. Scale by ratio as `amount * k * output.width / 1920` (the same rule as `adjust.fx`) |
| `rotate` | Degrees. `amount.rotate * k`. On gpu, rotate around the tile center |
| `scale` | An **increment** of the factor. Applied factor = `1 + amount.scale * k` |
| `opacity` | An additive amount (declared value -1 to 1). Contribution = `amount.opacity * k` |

### 4.2 Composition

- When several animators hit the same property, use the add rule in §4.1. An animator and an L1 keyframe **composite independently** (L1 is the whole item, L2 is the per-unit offset).
- **Control-tower ruling (2026-09-06).** `x`, `y`, `rotate`, `letterSpacing`, and `blur` add each contribution. `scale` multiplies each applied factor. `opacity` is `clamp01(1 + the sum of (amount.opacity * k))` **after the sum**. Do not clamp per animator. Composite the per-unit state independently of the whole-item keyframes and motion state (opacity and factor multiply).

### 4.3 Keyframes on offset

- "In which order" is expressed by moving `offset` over time. Points sit in the same array as L1 (inline or bag), as `"animator": { "a1": { "offset": -0.25 } }` through `{ "offset": 1 }` (typically 2 points). **There is no per-character point.**
- **Control-tower ruling (2026-09-06).** Besides `offset`, `start` and `end` can move on the same keyframe point. If there is no point, the declared value is static. `t` is an integer frame relative to the item. Interpolation follows §2.1 (linear, easing, or hold).

### 4.4 v1 implementation state and limits (2026-09-06)

- **Implemented on gpu, and also on the DOM captions of the OSR whole-page exit and on the shell output preview (`#caption-plate` in the webview).** All of them use the same frame-engine evaluator, `captionAnimatorStateAt`. The Web UI (the old preview-server path) and the inspector UI are out of scope for this delivery.
- The target is **captions that come from captions.json**. A declaration on a bag item (`source.kind: "captions"`) applies to every cue. A declaration on a cue item (`source.kind: "caption"`) applies to that cue. Telop, and text inside a group, from §4.1 that does not go through the same path as a caption unit is out of scope for this delivery.
- `basis` implements `chars` (grapheme), `words`, and `lines`. **`segments` is treated the same as words in v1**, and edit-lint emits an `animator.segments-fallback` warning. Phrase-segment units are a separate delivery.
- **The DOM-exit applier** is `applyCaptionAnimatorDom(root, declaration)` in `packages/frame-engine/src/timeline/caption-animator-dom.ts`. `declaration` takes `animators`, `keyframes`, `cueLocalSeconds`, `cueDurationSec`, `fps`, and `outputWidth`. An optional `keyframeOffsetSeconds` keeps keyframe times relative to the bag item's start.
- The applier lists the unit elements inside root (the cue's element). `chars` is `.akari-caption__char`. `words` is `.akari-caption__tok` (or a word span if that is absent). `lines` is `.akari-caption__line` (a `.akari-caption__reveal-group` with no line element is also treated as a line). `segments` falls back to words, emits a runtime warning once, and if the target unit element is absent it emits a warning and ignores that basis.
- Write the `captionAnimatorStateAt` result onto the unit element's **inline style**. `transform` is `translate(x px, y px) scale(s) rotate(r deg)`. `opacity` multiplies the clamped value from §4.2 into the existing opacity. `letterSpacing` and `blur` land on `letter-spacing` and `filter: blur()`. A span enables transform with inline `display: inline-block`. Side effects are limited to inline style. Do not change class or DOM structure. **If there is no animator, do not change the DOM at all (byte-identical).**
- OSR has the page builder embed the per-cue animator and keyframes, and the page runtime applies them before each frame's capture. The shell supplies the declaration on the summary, generates grapheme spans only when `chars` is declared, and calls the same applier on a master-clock tick or seek (shared by the frame-engine path and the DOM `<video>` path).
- `letterSpacing` changes tile geometry, so **the gpu exit ignores it**. A non-zero declaration emits runtime warning `animator.letterSpacing-ignored`.
- `blur` is also **ignored on the gpu exit**. The current GPU sprite tile draw does not support `filter: blur()`, so a non-zero declaration emits runtime warning `animator.blur-ignored`. The evaluator still computes the amount by the rules in §4.1 and §4.2.
- **On the DOM exit (OSR whole-page and the shell preview), both `letterSpacing` and `blur` take effect as inline style.** The look can differ from gpu, which ignores those two amounts. Agreement with gpu is "the order the characters appear, and roughly where". Do not require agreement down to the drawing detail of tile versus DOM (antialiasing and the rest).
- Determinism: **the same exit and the same input make the same pixels** (fixed seed, integer arithmetic). A DOM apply of the same frame makes the same DOM. Output with no animator stays **byte-identical**.

edit-lint rules (separate from the gpu runtime warning that an amount is ignored):

| Rule | severity | Judgment |
|---|---|---|
| `animator.non-text-target` | warning | An animator was declared on a media or filter item (drawing ignores it) |
| `animator.unknown-ref` | error | A keyframe point's `animator[id]` is not in that item's declaration |
| `animator.duplicate-id` | error | An animator id is duplicated on the same item |
| `animator.segments-fallback` | warning | `basis: "segments"` is treated as words |

## 5. "Expand to keyframes" (L0 or L2 to L1, one way)

- An operation that **bakes** an L0 preset or an L2 animator into the matching L1 point list. Finish nine tenths with a preset, expand only the last tenth, and fix it by hand.
- After expansion, delete the original `motion` or `animator` (do not manage it twice). There is no inverse. Undo only.
- Expanding L2 **also splits into per-unit parts** (grow part items whose name tags are the character or the phrase segment, and give each part a point list). The count explodes, so the UI asks for confirmation (rule: when the generated point count exceeds 200).

## 6. Restoration of `contract-2026-08-09-transform-keyframes-v0.md`

- A contract of that name is referenced from 10 places (`$comment` in `edit.schema.json` twice, `validate-edit.mjs`, render-cut three times, preview-server, and akari-preview three times), but **the file did not exist** (no history on any branch).
- Today the file was **restored** from the semantics that remained in the `$comment` of `edit.schema.json` (`layerKeyframe` and `layerItem`). The contents are the v0 semantics only. **§2 of this contract is the successor.** The restored file exists to close the hole in the references.

## 7. Timeline and inspector display rules (the UI implementation is a separate contract)

- L0. A small in mark and out mark at the two ends of the bar (in the style of a transition). No diamonds. A loop is a mark at the center of the bar.
- L1. **Diamonds on the bottom edge** of the collapsed bar (properties mixed). Expanding the item splits into **property rows** (transform.x, y, scale, rotate, opacity, crop, perspective), with diamonds per row. The two ends are hollow. The ones between are filled.
- An aggregate diamond (the parent row) is **filled** when every child has a point at the same t, and **hollow** when only some do. A drag moves the points underneath together.
- Next to each inspector property, a diamond (set, clear, or step to the previous or next) plus the span easing (a preset and a bezier curve, with an immediate preview on hover).
- **Focus mode** is a **scope switch of the same timeline region** (not a popup and not another window). Double-click is unified as "go inside". A group or a part goes to focus (the subtree plus property rows, the time axis auto-zooms to that span, and the preview loops that range). A video clip goes to the source view (the current source trimmer). Breadcrumbs plus Esc go back one level. The footage panel on the left does not change.
- L2. The timeline shows only the offset diamonds. The inspector has an "animator" section (basis, shape, start, end, offset, randomize, amount).

## 8. Out of scope

- Per-character keyframes (§0).
- A form that stores handles separately on each keyframe (here, easing is per span).
- A non-deterministic Randomize (a fixed seed is required).
- Dual management of the end value (the end value is only the next point's value).
- A motion path, 3D rotation, and volume keyframes (a separate contract).
