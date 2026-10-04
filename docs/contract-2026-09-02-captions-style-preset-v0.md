**English** | [Japanese](./contract-2026-09-02-captions-style-preset-v0.ja.md)

# captions.json v0 caption style-preset reference

- Date: 2026-09-02
- lifecycle: accepted
- Place: a hybrid save contract for caption templates, keeping owner ruling 4, "a caption that is styled on its own moves toward on-screen Captions"
- Ruling 4 revision (2026-10-02): textstyle v1 widens the ruling 4 vocabulary. What still stays on an Overlay is [v1 contract section 9](./contract-2026-10-02-textstyle-v1-rich.md#9-what-stays-on-an-overlay-and-what-is-open). The older sentences below are the v0 decision, read as history.

## 0. Place

A caption template stores a small stable id, and that id resolves to values before draw. A shared catalog can update a preset's look, and each caption can still override only the fields it needs with the existing `text_style`. The per-caption override vocabulary does not grow. A more complex look is converted to on-screen Captions. That is ruling 4.

**Ruling 4 revision (2026-10-02).** The decision to close that vocabulary is revised. textstyle v1 adds layered strokes, gradient and pattern fills, and offset shadows to caption styles. What remains on an Overlay follows [v1 contract section 9](./contract-2026-10-02-textstyle-v1-rich.md#9-what-stays-on-an-overlay-and-what-is-open). The `style_preset` seat, the resolve order, and the stored form of an unknown id stay as this contract defines them.

## 1. Seat

The seat is the optional field `style_preset` on each `captions[]` record in `captions.json`. The seat inside a record is the same for an array root and for an object root.

```jsonc
{
  "captions": [
    {
      "id": "c-0001",
      "style_preset": "subtitle-standard",
      "text_style": { "color": "#ffe082" }
    }
  ]
}
```

An id matches `^[a-z0-9][a-z0-9-]*$`. A `style_preset` seat on the `captions.json` root is out of scope for this contract.

## 2. Resolve order and merge

Effective style precedence, from lowest to highest:

1. `default_text_style` on the object root
2. `style` of the preset that `style_preset` names
3. `text_style` on the same caption record

A preset and `text_style` merge field by field. `stroke`, `background`, `shadow`, `glow`, `position`, and `animation` merge one level down, by key. `in`, `loop`, and `out` inside `animation` overwrite per slot. An unknown id is ignored. The stored form does not change, and lint warns. The `style_preset` key itself remains on the record after resolve.

## 3. What consumers promise

A consumer that reads `captions.json` passes the root through `applyCaptionStylePresets(root, TEXTSTYLE_CATALOG)` before the existing draw and style merge. render-cut, GPU Export, OSR Export, shell Preview, the edit-store inspector, and preview-server each own that preprocess at their entry.

The existing six merge implementations do not change. Preprocess only copies resolved values onto `text_style`. It does not change `default_text_style`, the original `style_preset`, or the write-back form.

## 4. Catalog and generated output

The source of truth is `presets/textstyle/index.jsonl` and each `presets/textstyle/<id>.json`. `packages/edit-store/scripts/gen-textstyle-catalog.mjs` deterministically generates `TEXTSTYLE_CATALOG`, which the browser can use, at `packages/edit-store/src/generated/textstyle-catalog.ts`. Generation order is ascending id. A drift test detects a difference from the source of truth. Each index row's `style` matches that id's JSON `style`. Each JSON file has `format: "akari-textstyle"`.

## 5. Lint

The schema and the validator check the id's type and shape. They do not require the id to exist in the catalog. edit-lint checks existence only where it can read the catalog, and it reports an unknown id as a `captions.style-preset-unknown` warning. When a distribution has no catalog, that existence check is skipped.

## 6. Three free templates

| id | Display name | Role |
|---|---|---|
| `subtitle-standard` | Standard | White text, black stroke, no plate, no animation |
| `subtitle-variety` | Pop | Yellow text, a thick stroke, a shadow |
| `subtitle-news` | News bar | White text, a red plate |

## 7. Out of scope

- A root-level `style_preset`
- price, purchase state, a crown premiere mark, and a Lab connection
- Merging or rewriting the existing merge implementations
- Merging this contract with the on-screen Captions contract

## 8. Panel promise (T6b)

The caption-template picker on the script panel applies to the selected rows when a row is selected, and to every row when none is selected. Apply-all is confirmed with an explicit button after the card is selected.

Write-back updates the target rows in one `setCaptionStylePreset` RPC, one file write, and one git commit. `text_style` does not change. `presetId: null` is the clear operation. It deletes only the `style_preset` key. Applying the same value again does not write and does not commit.

Each row shows the referenced template as a `🎨 <template name>` badge. An id that is not in the catalog is shown as `🎨 <id>?`. Together with the edit-lint warning, that does not break load or Export.

The inspector shows values after preset resolve. Overriding one value there saves it on `text_style`, and that field no longer follows later template updates.

A crown mark, price, a Lab connection, in-panel history, and an inspector line "Template: xxx" belong to T6c and T9.
