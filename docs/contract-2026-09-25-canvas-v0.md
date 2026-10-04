**English** | [Japanese](./contract-2026-09-25-canvas-v0.ja.md)

# Canvas v0

A canvas is an explicit edit container on an `edit.json` v2 item whose `source.kind` is `"group"`. The screen also calls an existing group without `canvas` a canvas. Save data is not converted in bulk.

```json
{
  "id": "canvas-1", "name": "Intro", "at": 300, "duration": 150,
  "source": { "kind": "group", "canvas": {
    "origin": "user", "durationMode": "fixed", "intent": "What to show first",
    "background": { "type": "color", "color": "#112244" }
  } }, "items": []
}
```

- `origin` is `user` or `plan`. In v0, `durationMode` is `fixed`. `content` is reserved for a later version.
- `background` is `none` or `color`. A color is `#RRGGBB`. The background fills the canvas interval and sits under the children. Audio does not change.
- An empty canvas is a placeholder that still owns an interval. The intent appears on the Preview dotted frame only while the canvas is empty. The output does not burn that text in.
- A child's `at` is relative to the parent. Moving the parent moves each child's absolute time. Moving a child in or out keeps that child's absolute time, look, and overlap order.
- A change to a `fixed` duration changes only the visible range. Child times and durations stay put. Nothing outside the parent interval is drawn. `v2.child-in-parent` is a warning for that reason.
- Timeline range edges round to whole frames. An edge within one frame of a whole second snaps to that second, so pointer error cannot turn 0:10 to 0:15 into 301 and 149 frames.
- Items that share a time are not folded on their own. Each stays on its track row. Those items become a canvas only when the user presses Make canvas. Only an explicit action changes save data. An empty canvas is not unfolded on its own. The canvas header band is the same height as a Captions row. Children of a folded canvas appear only as marks on that band. They are not drawn on outside rows. Open the canvas to show the child rows.
- To move a placed caption in as a child, create a `caption` item and put the same caption id in `source.exclude` on the original `captions` bag. That stops a double draw. After the move, taking the caption back out makes an independent `caption` item that keeps its absolute time. `exclude` stays.
