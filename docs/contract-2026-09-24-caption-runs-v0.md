**English** | [Japanese](./contract-2026-09-24-caption-runs-v0.ja.md)

# Caption character ranges (runs) v0

- Date: 2026-09-24
- Status: v0

## Stored form

Each caption in `captions.json` may add `runs`. Existing fields stay as they are.

```json
{
  "text": "This is the best idea",
  "runs": [{
    "from": 12, "to": 16, "role": "emphasis",
    "style": {
      "color": "#ff5a5f", "font_weight": 900, "scale": 1.3,
      "baseline_shift_em": -0.1, "rotate_deg": 8, "letter_spacing_em": 0.05,
      "italic": true, "underline": true,
      "stroke": { "color": "#000000", "width_px": 1 }
    },
    "animation": { "loop": { "id": "float" } }
  }]
}
```

`from` is inclusive and `to` is exclusive. The unit is a Unicode grapheme. Count `display_text` when it is present, otherwise `text`. Line breaks in `display_fragments` do not cut a range. Draw time projects the range onto each line. An empty run, or a run outside the string, is a lint warning and is ignored at draw time. `role` is an open string. `emphasis`, `keyword`, and `aside` are the recommended values.

## Composite and draw

A later run wins over an earlier run field by field. `style` stacks on the caption-wide `text_style`. `scale` is the glyph scale. A positive `baseline_shift_em` moves the glyph down. `rotate_deg` rotates that glyph. `letter_spacing_em` is the gap between glyphs. A v0 run style has only the nine fields in the example: `color`, `font_weight`, `scale`, `baseline_shift_em`, `rotate_deg`, `letter_spacing_em`, `stroke`, `italic`, and `underline`. It has no position, background plate, or shadow.

Run glyphs are drawn as `akari-caption__run` spans. Only the looks that are needed go into the inline style. A caption with no runs keeps the existing draw path. Existing `emphasis_words` still carry time and a preset, and they coexist with runs. When both hit the same glyph, the run style wins. Moving `emphasis_words` into runs is a later version.

`animation` reserves the textanim slots `in`, `loop`, and `out`. v0 does not draw them. GPU Export caption motion is `captionMotionAt` per caption inside the `gpu-export` `page-runtime`. Per-run motion needs a change in that layer. Turning it on for Preview and OSR alone would split the three paths, so they turn on together.

## Rebase while editing

A text edit computes the smallest grapheme diff between the old display string and the new one. Runs before the diff stay. Runs after the diff move. A run that overlaps the diff grows or shrinks. A run whose whole range was deleted is dropped. A caption split breaks runs at the boundary. A merge adds the following caption's offset and joins the runs.

edit-store's `updateCaptionFieldsInSourceWithReport` returns a run that fell off as `removedRuns`. `captionRunsRemovedNotice` builds the notice text. The existing `updateCaptionFieldsInSource` still returns a string. Script, inspector, and Preview text edits send `removedRuns` and `removedEmphasis` through `captionEditNotices`. Repeated identical copy collapses to one notice in the lower right.
