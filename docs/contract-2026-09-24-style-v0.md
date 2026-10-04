**English** | [Japanese](./contract-2026-09-24-style-v0.ja.md)

# My Styles v0

Stored form and apply contract.

- Date: 2026-09-24
- Status: v0

## 1. Role and place

A style is a bundle of a use and parts. It is not a per-video template. Bundled `presets/textstyle` is the table code looks up by `style_preset`. My Styles are values the user saved. The text-style shelf shows both.

Footage `{category,id}` and `.akari/asset-references.json` follow `contract-2026-09-02-asset-reference-model.md`. My Styles `styles/` are outside the high-cost intake bar in `contract-2026-07-13-asset-library.md`.

The shared user store is `styles/<id>/style.json` under `resolveAssetLibraryRoots().write`. The root resolves in this order: `AKARI_LIBRARY_ROOT`, then `$AKARI_HOME/library-location.json`, then `$AKARI_HOME/assets`. The reserved per-project path is `<project>/.akari/styles/<id>/style.json`. The v0 UI handles only the shared user store.

A save writes a temp file and renames it inside the same directory. An existing `id` with a different `uid` refuses the overwrite. A different `id` with the same `uid` is also refused. An update whose `id` and `uid` both match is allowed only when `revision` does not go backward. A rename updates `name` and `revision` and keeps `uid` and `id`. A later UI that renames to another slug still keeps `uid`. An unreadable stored form is left out of the list. The other cards still show.

## 2. Stored form

```json
{
  "schema": "akari-style",
  "version": 1,
  "revision": 1,
  "uid": "01K5ZXY123ABCDEFGHJKMNPQRS",
  "id": "my-variety-emphasis",
  "name": "Variety emphasis",
  "when_to_use": "When a short emphasis should mark a surprise",
  "tags": [],
  "parts": [
    { "kind": "look", "scope": "caption", "mode": "modify",
      "text_style": { "color": "#ff1744", "size_px": 80, "reference_height_px": 1920,
        "stroke": { "width_px": 0 }, "background": { "opacity": 0 },
        "shadow": { "color": "#000000", "opacity": 0 },
        "glow": { "color": "#000000", "density": 0 } } },
    { "kind": "motion", "scope": "caption", "mode": "modify",
      "animation": { "in": { "id": "fade-up", "duration_sec": 0.4 },
        "loop": { "id": "float", "amp": 8 } } }
  ],
  "sample_text": "This is the best idea",
  "created_at": "2026-09-24T00:00:00.000Z",
  "updated_at": "2026-09-24T00:00:00.000Z",
  "license": { "spdx": "LicenseRef-user-owned", "scope": "private-owned",
    "attribution_required": false, "ai_training_allowed": false },
  "visibility": "private",
  "price": null,
  "requires": [],
  "provenance": {}
}
```

`schema` is an identifier with no version in it. The stored-form version is only the integer `version`. v0 uses `1`. `revision` is that style's revision number and starts at `1`. `uid` is a ULID assigned at create time and does not change. `id` is a human-readable slug. `author` is optional. `parts` is an open array that round-trips an unknown `kind`. Reserved words are `look`, `motion` (`animation` with `in`, `loop`, and `out`), `sfx`, `fx`, `decor`, and `camera`. v0 saves and applies `look`, `motion`, `sfx`, `fx`, and `decor`. An unknown or unsupported part is not applied, and one notice line is shown.

An `sfx`, `fx`, or `decor` part that does not match the v0 attach shape does not reject the whole style. The value round-trips and is treated as unsupported.

Shared part fields are `scope` (`caption`, `run`, `clip`, or `scene`), `mode` (`attach` or `modify`), and optional `attach: { at: "in" | "out" | "whole", offset_frames: number }`. `attach` is a relative time for sfx, fx, and decor that can be copied onto an edit.json v2 anchor. `mode: "attach"` ties on another element. `modify` changes an existing element. A camera `modify` targets the clip under the caption. v0 look and motion use `scope: "caption"` and `mode: "modify"`. Motion `animation` is any of the slots `in`, `loop`, and `out`. Each slot round-trips the same `id`, `duration_sec`, `ease`, `amp`, and related fields as an existing caption. An unknown slot name and an absolute path are rejected. `applies_to` is not stored. It is derived from the deduplicated set of `parts[].scope`.

A footage reference is `{ "category": "...", "id": "..." }`. `requires[]` is a reserved field that can record font and footage ids and versions. The style as a whole does not contain a local absolute path. `provenance` does not contain a path either. `tags[]` are for situation search. `license` is the same SPDX-style object as footage `meta.json`, and the default is private. Sharing is a separate field, `visibility` of `private` or `shared`, default `private`. `price: null` is reserved. v0 does not require a signature.

An optional `thumbnail.png` is generated deterministically from the same draw conditions as the fixed `sample_text`. When it is absent, the shelf falls back to showing `sample_text`. Before a style is shared, check that it is self-contained, check the license, and check the use terms of footage it depends on.

## 3. Saving a look, and resolution

Save the effective value resolved by the existing rule `default_text_style`, then `style_preset`, then the cue `text_style`, for a caption or for placed text. The allowed fields of `look.text_style` are only `color`, `size_px`, `reference_height_px`, `font_family`, `font_weight`, `weight`, `line_height`, `letter_spacing_em`, `stroke` (`color`, `width_px`), `background` (`color`, `opacity`, `radius_px`, `padding_px`, `mode`), `shadow` (`color`, `opacity`, `blur_px`, `distance_px`, `angle_deg`), and `glow` (`color`, `density`, `spread`, `offset_x`, `offset_y`). Save and load both filter through this allow list. `animation`, `layout`, `position`, `text_anchor`, and `zone` are not part of a look.

When the effective value has no stroke, background, shadow, or glow, or the value is invalid, store the disabled value instead of omitting the field. Targets that have a default still need an explicit "off" so the look can reproduce "none". Use `{width_px:0}`, then `{opacity:0}`, then `{color:"#000000",opacity:0}`, then `{color:"#000000",density:0}`, in that order.

On save, `reference_height_px` is always filled from the source edit.json `output.height`. Apply copies the value as stored. At draw time, `resolveCaptionReferenceScale` in `packages/edit-store/src/caption-display.ts` multiplies px-like values by `output.height / reference_height_px`. An 80 px glyph made in a 1920 px-tall project becomes 45 px at 1080 px tall. `layout` and `reference_height_px` are exclusive under the existing draw contract, so the effective value after replacement is checked first (`default_text_style` plus the cue, with `style_preset` already removed). If even one target collides, nothing is written, and the reason is reported. The same check runs for text placed with plus or with a drag.

## 4. Apply, undo, and use history

Applying a look replaces fields part by part. For the allow-list set, the target value is replaced by the look value. A field the look does not have is deleted from the target. A nested object such as `stroke` is replaced as a whole part. Position, animation, layout, and any other value outside the allow list are kept. The same write to the caption file removes `style_preset`. Apply, undo, and redo go through the `captionsSource` path of `writeEditSnapshot`, including the guarded check and the write notice. For a multi-selection as well, the look and `style_preset` both return in one undo. Text placed by drag or plus uses the same replace rule.

Motion can be saved only when the source has an effective motion (`default_text_style`, then `style_preset`, then the cue `text_style`). The save dialog checks that case by default, and shows it disabled when there is no motion. Look and motion can each be saved alone. Animation is not mixed into look. Applying motion replaces the caption's whole `text_style.animation` with the saved value. A slot the motion does not have is removed. Applying motion alone does not change the look, the position, or `style_preset`. `style_preset` is removed only when a look is applied.

## 4.1 Parts tied to a caption

"Attach to caption..." on a timeline sfx, html, or filter item picks a caption at the same output time and copies entrance, exit, or whole onto `anchor.edge` and `anchor.duration`. The source item does not get `anchor.attached_by`. The save dialog reads items anchored to the source caption and checks the kinds that exist, by default. An item with no footage reference cannot be saved as a matching part.

- `sfx` is `{kind:"sfx",scope:"caption",mode:"attach",attach:{at,offset_frames},asset:{category:"audio",id},file,duration_sec,gain_db?,in?,out?}`. `file` is a relative file name inside the footage. The item is a media item on an audio track and uses `anchor.duration:"own"`.
- `decor` is `{kind:"decor",scope:"caption",mode:"attach",attach:{at,offset_frames},asset:{category:"overlay",id},file,vars?,duration_sec?}`. The item is an html item on a visual track. `whole` uses `anchor.duration:"caption"`. Anything else uses `own`.
- `fx` is `{kind:"fx",scope:"caption",mode:"attach",attach:{at,offset_frames},effect,duration_sec?}`. v0 saves and applies only the existing `filter` item vocabulary (`invert`, `lut`, `saturation`). It does not use `adjust.fx[]`.

Footage is entered in `.akari/asset-references.json` before the declaration path `assets/<category>/<id>/<file>` is used. sfx is also added to `sources[]`. Applying the same style to the same caption again removes old items that have the same `style_uid` and caption id on `anchor.attached_by`, then places the new items. Look, motion, and parts share one write across captions.json and edit.json and one undo entry. The use ledger records the parts that were actually applied. Deleting the caption also deletes marked items. Moving a marked item by hand removes the whole `anchor`.

Apply on a card shows a per-part check when there are two or more matching parts. An unsupported part is shown disabled as "Do not apply". A matching part the user turned off is not given a notice. Parts turned off last time are remembered in per-`uid` user settings and become the next default. When there is at most one matching part, apply runs immediately. Plus and drag apply every matching part. Every selected part is applied in one write of captions.json and, when tied parts are included, edit.json, as one history entry. One undo restores the previous bytes.

Each apply appends `{caption_ids: string[], style_uid, revision, parts: string[], applied_at}` to `entries[]` in `<project>/.akari/style-usage.json`. `parts` lists the kinds that were actually applied. Placed text is appended too. This ledger is append-only. Undo does not roll it back. captions.json does not keep a style reference. Values are copied, so Export on another machine does not depend on the library. A later "reflect the source when it changes" is an explicit re-apply that uses the ledger. It does not overwrite on its own.

A shelf chip labels motion as "Motion". Card text plays the motion once, only while the pointer is over it, and stops after that one play even when a loop is set. A reduced-motion setting does not play it.

## 5. Hand-off to character ranges

A style does not store a glyph position or "which character". "The emphasized word is red and large" is a rule with `scope: "run"` and `role: "emphasis"` on `look`. Giving `role` to runs in captions.json is defined by the next character-range contract.
