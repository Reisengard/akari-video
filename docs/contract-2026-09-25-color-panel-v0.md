**English** | [Japanese](./contract-2026-09-25-color-panel-v0.ja.md)

# Color panel v0

The inspector color field, the color-making window, and the brand kit.

## Where it sits and how it opens

- The color field is **inside the inspector column**. Pressing a color-row swatch replaces that column with the color panel. Caption swatches are text, stroke, plate, and effect color. Overlay swatches are the color controls. The back button at the upper left returns to the previous column. A selection change closes the panel.
- The hex field stays on the row, so the value can be typed. Open field from Preview also focuses that input.
- Other parts, such as a color swatch on the top bar, open by command:

```
akari.inspector.openColorPanel({
  target: { kind: 'field', field: '<data-akari-field value>' }
        | { kind: 'item', itemId: '<item id>', path: '<dot path>' },
  allowGradient?: boolean,
  allowTransparent?: boolean,
  title?: string,
  toggle?: boolean
})
akari.inspector.closeColorPanel()
```

`field` is the color row in the inspector for the current selection. `item` is inside an edit.json item, for example `source.params.fill`. `allowGradient` defaults to false and is true only for a shape or line fill, stroke, or line. `allowTransparent` defaults to false and is true only for fill. `title` is the heading. When it is omitted, the row name is used. A row whose name is only Color becomes "<section> color". `toggle` closes the panel when it is already open on the same target, which is what a second press on the bar swatch does. The call returns boolean, true when the panel opened.

- An `item` write uses edit-store `updateItem`. The top key of `path` (for example `source`) is rebuilt and passed whole, because `updateItem` only shallow-merges inside `source`. **Before the write, `readEditV2` reads the item again and checks it. A value that item's contract does not accept is refused and not written.** Example: while the shape contract still accepts only a string, a gradient is refused with "This item cannot store a gradient yet." and edit.json does not change.

## Value shape

The shape matches the shape-item v1 fill and stroke contract.

| Value | Shape |
|---|---|
| Solid | `#RRGGBB` or `#RRGGBBAA`, normalized to uppercase. An AA of FF is dropped |
| Transparent, fill only | `'none'`, which means hollow |
| Gradient | `{ type: 'linear', angle, stops }` or `{ type: 'radial', stops }`. `stops` is `[{ color: '#RRGGBB(AA)', offset: 0..1 }]`, 2 to 5 colors. Per-color opacity is the AA on `color` |

- `angle` uses the same direction as the CSS `linear-gradient`. 0 is bottom to top, 90 is left to right, and 180 is top to bottom.
- The five styles in the color-making window use those two types. Horizontal is linear 90. Vertical is linear 180. Diagonal down-right is linear 135. Radial is radial. Diagonal up-right is linear 45.
- Adding or removing a color redistributes `offset` evenly, from 0 through `1/(n-1)` to 1.
- Pure functions and tests live in `apps/shell/extensions/akari-annotations/src/browser/inspector/color-model.ts`.

## Panel order, top to bottom

1. Search matches a default solid's name, or a hex color such as `#00c4cc` in 3, 6, or 8 digits. The Japanese sibling also matches a kana reading of that name.
2. A rainbow plus opens the color-making window. An eyedropper uses `EyeDropper`, or one line of copy when that API is missing. Transparent appears only when `allowTransparent` is set. **Recent colors** keep 8 entries, newest first. A gradient is one swatch. The current color is marked. If the current color is not in the history, it is placed first.
3. **Colors in this design.** From edit.json and the captions container file, values whose keys look like color (`color`, `fill`, `stroke`, or `background`) are listed by how often they are used, up to 14.
4. **Brand kit.** Add a brand color stores the current solid. Edit removes one.
5. **Photo colors.** Placed images on any track, and B-roll (video on any visual track except the top one), contribute at most 4 sources and 5 colors each. Pixels are scaled to 64 px and counted in 4-bit bins per channel. Colors are taken from the most common bins that stay far enough from colors already chosen. The choice is deterministic.
6. **Default solids.** 4 rows, 28 colors. Show all expands to 6 rows, 42 colors.
7. **Default gradients,** only when `allowGradient` is set. 3 rows, 21 gradients. Show all expands to 5 rows, 35 gradients.

A pressed color is written immediately, and the panel stays open. A drag on the color square, the hue band, or the opacity band updates the look first. **The write happens once, on release.** A failed write restores the previous value and shows the reason.

## Color-making window

- Tabs are Solid and Gradient. The Gradient tab appears only when `allowGradient` is set.
- Solid has a color square (saturation by brightness), a hue band, a hex field, and an eyedropper.
- Gradient has color stops (plus adds one, at most 5) and the five styles. Pressing a stop opens a **small window** that edits only that color. It has a color square, a hue band, an opacity band, a trash control (disabled at 2 colors), a hex field plus opacity percent, and an eyedropper. The small window closes on an outside press, on Esc, or on a second press of the same stop. It does not close during a drag inside it.

## Where values are saved

| Thing | Place | Scope |
|---|---|---|
| Brand kit | `AKARI_HOME/brand-kit.json` (`{ schema: 'akari-brand-kit/v0', colors: ['#RRGGBB(AA)'] }`, at most 60 colors) | Per user. One file for every project, the same place as starred favorites. Library, Mine, Brand kit reads that file |
| Recent colors | App local storage (`akari.colorPanel.history.v0`) | Per user |
| The color itself | The field's own store (Captions use the captions textStyle, an item uses edit.json) | Project |

akari-project exposes brand-kit reads and writes as these commands. Extensions call them by string id:

`akari.library.brandKit.get()` returns `string[]`. `akari.library.brandKit.addColor(color)` returns `string[]`. `akari.library.brandKit.removeColor(color)` returns `string[]`.

## Wired in this version, and not yet

- Wired: Caption color rows (text, stroke, plate, and effect color, with no gradient and no transparent) and Overlay color controls (solids only).
- Not yet: shape fill, stroke, and line (the top-bar color swatch and the inspector shape row). After the shape contract accepts a gradient and `'none'`, call it with `{ kind: 'item', itemId, path: 'source.params.fill' | 'source.params.stroke' }`, `allowGradient: true`, and `allowTransparent: true` for fill.
