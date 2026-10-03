**English** | [Japanese](./contract-2026-09-02-item-caption-anchor-v0.ja.md)

---
lifecycle: accepted
created: 2026-09-02
updated: 2026-09-24
---

# edit.json v2 item caption anchors v0

## 0. Place

Of the three time-dependency classes, this contract defines class 2, an item that depends on a caption row. Targets are visual items of kind `media`, `html`, `telop`, `filter`, or `group`, and audio items. The item refers to a whole caption row, or to a word-like span inside the row, in source seconds. After the caption time changes, the same pure function derives the item time again.

`captions.json` `emphasis_words[]` also stores a measured span in source seconds, but that span is a performance declaration for a word. This contract's `anchor` is a reference that makes an edit.json item placement depend on a caption. It does not treat a word index or a string as the source of truth.

## 1. Data model

```jsonc
{
  "id": "broll-2",
  "at": 90,
  "duration": 24,
  "anchor": {
    "caption": "c-0002",
    "range": { "start": 3.1, "end": 3.9 },
    "offset": -2,
    "duration": "caption"
  },
  "source": { "kind": "html", "path": "overlays/box.html" }
}
```

- `caption` is a row id in `captions.json` (`^c-\d{4}$`). It is required.
- `range` is an optional `{ start, end }`. It is a half-open span in source seconds inside the caption row's `[start, end]`, with `start < end`. When omitted, the whole caption row is used.
- `offset` is an optional integer frame count. A negative value is allowed.
- `duration` is `caption` or `own`. The default is `caption`.
- `edge` is `start` or `end`. The default is `start`. `end` places the item start at the end of the caption span.
- `anchor.attached_by: { style_uid, caption }` is an optional style-placement mark. `caption` names the same caption as `anchor.caption`. Deleting that caption deletes, in the same write, marked items that name it. Moving a marked item by hand removes the whole `anchor` and keeps the current time. An existing anchor with no mark is kept.
- `at` and `duration` stay required integer frames. When `anchor` is present they are a cache of the resolved result. The source of truth is `anchor` plus the referenced caption.
- A top-level item's `at` is an absolute output frame. A child item's `at` stays parent-relative, as before. An anchor resolves an absolute output position, then subtracts the parent's absolute `at` before saving.

## 2. Resolve rules

`sourceToOutput(segments, sourceT)` returns `outStart + (sourceT - srcStart) / speed` when the source second falls inside a kept `src` segment. Inside a cut it snaps to the next kept segment's `outStart`. A value past the end of the footage clamps to the last segment's `outEnd`. A caption with `time_domain: "output"` is not mapped. Its seconds are used as output seconds.

`start_src = anchor.range?.start ?? caption.start` and `end_src = anchor.range?.end ?? caption.end`. Both ends map to output seconds.

```text
at = round((edge === "end" ? end_out : start_out) * fps) + (offset ?? 0) - parentAtFrames
duration(caption) = max(1, round(end_out * fps) - round(start_out * fps))
duration(own) = item.duration
```

`at < 0` is not clamped. The existing parent-interval lint owns that case. When both ends land on the same output time, the whole span is inside a cut, so it is unresolvable and the cache does not change. A missing referenced caption also keeps the cache. Neither case adds `hidden` on its own.

## 3. Where resolve runs

The shared entry is `readInternalEdit(source, { captions })`. Only when `captions` is passed does the read go through `resolveItemAnchors` before it builds the internal model. When `captions` is omitted, the `at` and `duration` cache is read as before, and behavior from before anchors does not change.

render-cut, gpu, osr, shell Preview, and preview-server each normalize captions.json with `toAnchorCaptions`, pass it as `options.captions` to `readInternalEdit`, and resolve anchors on read. When captions.json is missing, they read the `at` and `duration` cache as before.

`setCaptionTiming`, `shiftCaption`, `insertCaption`, and `removeCaption` change caption times or the referenced set. They remove marked items and update anchors in the same write as captions.json and edit.json. Callers of `writeEditSnapshot`, and of the preview-server captions PUT, own the re-resolve. captions.json and edit.json are not atomic across the two files. If a stop in the middle leaves a stale cache, lint `v2.item-anchor-stale` detects it.

## 4. Mutations

- `setItemAnchor(edit, id, anchor, captions)` writes the anchor, resolves it immediately, and updates the cache. An unresolvable anchor does not throw. It returns a warning and keeps the cache.
- `clearItemAnchor(edit, id)` deletes only the anchor. The current `at` and `duration` remain as baked values.
- `refreshItemAnchors(edit, captions)` is a thin wrapper over `resolveItemAnchors` that re-resolves every item, parent before child, depth first.

## 5. Lint

| check | severity | Condition |
|---|---|---|
| `v2.item-anchor-ref` | error (warning when captions.json is absent) | `anchor.caption` has no target |
| `v2.item-anchor-range` | error | `range` is outside the caption span, or `end <= start` |
| `v2.item-anchor-kind` | error | A `captions` or `caption` item has an anchor |
| `v2.item-anchor-stale` | warning | The resolved `at` or `duration` differs from the cache |
| `v2.item-anchor-unresolvable` | warning | The whole anchor span is inside a cut and has no output duration |

## 6. Out of scope

- Word-range drag on the script panel, the clapper button, and other UI
- A string extension of `itemAtV2`
- A word-index anchor
- An anchor on a `captions` or `caption` item
- Adding `hidden` on its own to an unresolvable item
