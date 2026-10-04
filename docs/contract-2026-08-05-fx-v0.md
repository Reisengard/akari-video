**English** | [Japanese](./contract-2026-08-05-fx-v0.ja.md)

# Screen FX small vocabulary v0 (noise, particles, vignette, flare, color-overlay)

> **Retired (2026-08-11).** The owner removed all five ids defined here (`noise`, `particles`, `vignette`, `flare`, `color-overlay`) from the product because they looked bad. The removal log is a private internal record. `presets/fx/index.jsonl` went back to 0 entries. The five builders were deleted from `FX_BUILDERS` in `packages/render-cut/src/fx.mjs`. `$defs/cutFx.properties.id` in `packages/schemas/edit.schema.json` dropped its enum and relaxed to string. An unregistered id warns and no-ops on the render side. It does not hard-fail. The `presets/fx/` reference table and the dispatch container remain, as a place for future recipes that come from the vision-analysis path. This file stays. The text below is the historical technical spec.

- Date: 2026-08-05
- Status: **draft** (it becomes approved alongside the implementation). This document is the technical spec only.
- Depends on `contract-2026-07-22-render-basics.md` (the implementation contract and verification style for `output.look` LUT, `cuts[].transition_out`, and related fields) and `contract-2026-07-17-data-contract-versioning.md` (three principles).
- Rule: **done means it appears in the output file.** Every item takes machine verification of a real render as its acceptance condition. A spec that lands first, and a backend that silently drops the effect, do not count.

## 0. Scope statement

This contract covers **only the five screen FX that were newly implemented**. It does not port the 479 FX from the old reference-implementation repo. A separate ruling already stopped that port. This contract does not reopen that ruling. It writes down the smallest vocabulary the recipes need in order to stand alone: noise, particles, vignette, and flare.

## 1. Scope (`presets/fx/` reference table plus 5 ids)

`presets/fx/` holds the 5 ids in the same reference-table style as `presets/luts/`, using `index.jsonl`. Unlike a LUT, there is no asset file (nothing like `.cube`). Each `id` maps 1:1 to the `FX_BUILDERS` dispatch table in `packages/render-cut/src/fx.mjs`. The implementation is the code itself.

| id | Behavior | Implementation path | Controls |
|---|---|---|---|
| `noise` | Picture noise and a worn look | ffmpeg `noise` filter directly (`all_flags=u+t` makes the noise change over time) | `intensity` |
| `particles` | Drifting particles and dust | Procedural. `geq` draws several bright points on a black canvas, then `screen` composites them | `intensity` |
| `vignette` | Edge darkening | ffmpeg `vignette` filter. When `white` is set, the invert trick is `negate,vignette,negate` | `intensity` and `params.color` (`black` or `white`, default `black`) |
| `flare` | Light flare and emphasis | Procedural, the same path as `particles`. One bright point, large radius, slow orbit | `intensity` |
| `color-overlay` | A color laid over the whole frame (one id covers a red fade and a black color matte) | ffmpeg `color=` source plus `blend` | `intensity` and `params.color` (required) |

Preview drawing, the intensity control, and the approximation gap are in [`contract-2026-08-02-preview-parity.md` §2.4.5](./contract-2026-08-02-preview-parity.md).

## 2. edit.json extension (append only)

```
cuts[].fx: [{ id, intensity?, params? }]
```

- `id` is an enum of the five values in the table (`packages/schemas/edit.schema.json` `$defs/cutFx`).
- `intensity` is a `number` in `[0, 1]`. The default is 1, full effect. **0 is identity for every id.** The pixels match an output with no FX. The render side no-ops uniformly, whatever the builder does.
- `params.color` for `vignette` is `"black"` or `"white"` (default `black`). For `color-overlay` it is an ffmpeg color (`"red"`, `"#ff0000"`, `"0xff0000"`, and the same family) and it is **required**, because the effect has no meaning without a color. `noise`, `particles`, and `flare` do not use `params`.
- The array **may stack**. Array order is application order. The vocabulary is the same "extra declaration on the cut" used by `cuts[].transform` and similar fields.
- No existing field changes meaning. Omitting `cuts[].fx` produces the same output as before. Non-regression: if no cut has `fx`, the filter-graph string matches the previous string byte for byte.

## 3. Implementation

- `packages/render-cut/src/fx.mjs` holds the filter-graph builders for the 5 ids and `appendCutFxChain`. The shared step chains stacked fx in array order and turns `intensity<=0` into `null` (identity) for every id.
- `packages/render-cut/src/plan.mjs` wires fx as extra per-cut processing, the same class as `cuts[].transform`, on all three cut-join paths: `buildCutCommand`, `buildMultiSourceCutCommand`, and `buildGapAwareCutCommand`. If any cut has `fx`, that whole array rides the per-cut full W×H frame path, the same treatment as `transform`.
- Determinism: `all_seed` for `noise`, and the motion of bright points for `particles` and `flare`, come only from a fixed hash or expression derived from the cut position, the fx stack index, and the fx id. The render path does not use `Math.random` or `Date.now`.

## 4. Verification (acceptance)

- L0. Existing and new tests are green (`node --test packages/render-cut/test/*.test.mjs`). `presets/fx/index.jsonl` is self-describing: every entry has id, kind, name, description, when_to_use, tags, params, ai_usage, and source. The id set matches `FX_IDS` in `fx.mjs` and `$defs/cutFx.properties.id.enum` in `edit.schema.json`. `node --check` is green for every target file.
- L1. A real render of the fixture video measures each FX signature (`packages/render-cut/test/cut-fx.test.mjs`).
  - Every id: `intensity=0` is pixel-equivalent to output with no FX. Two renders of the same `edit.json` are pixel-equivalent (determinism).
  - `noise`: the pixel difference of the same frame with and without FX is greater than 0, and the variance between frames increases.
  - `vignette`: the corner luminance relative to the center falls for black (the default) and rises for white.
  - `color-overlay`: the distance from the frame's average color to the requested color decreases monotonically with intensity.
  - `particles` and `flare`: the pixel difference with and without FX is greater than 0, and the picture changes over time. It is not a still.
  - One combined case, a black-and-white LUT plus noise, goes through the real render-cut CLI pipeline without breaking.

## 5. Excluded and known leftovers

- `packages/edit-lint` (the other static `edit.json` checker in the public repo, distinct from `packages/schemas/bin/validate-edit.mjs`) did not gain semantic checks specific to `cuts[].fx` in this contract. The existing looseness that does not reject `additionalProperties` keeps the file non-destructive, but checks at the level of `transform` and `transition_out` (unknown-key rejection, id enum checks, and the rest) are not in place.
- `presets/INDEX.md` (the inventory index in the parent repo) does not link to `presets/fx/`.
- Porting the 479 FX stays out of scope. See §0.
