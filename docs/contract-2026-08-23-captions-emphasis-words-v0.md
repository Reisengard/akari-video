**English** | [Japanese](./contract-2026-08-23-captions-emphasis-words-v0.ja.md)

# captions.json v0 data contract for word-level emphasis (`emphasis_words`)

- Date: 2026-08-23
- Status: source of truth for this implementation round. It fixes the seat in `captions.json` and the read priority.
- Depends on the [edit.json v1 word-level emphasis contract](./contract-2026-07-23-edit-json-v1-emphasis-words.md)
- Scope: the optional top-level field `emphasis_words[]` on an object-root `captions.json`, and the read priority against the old `edit.json` seat

## Background

Word-level emphasis that belongs to caption display lives on `captions.json`, the source of truth for captions, not on the edit timeline. The 2026-08-21 ruling that removed `emphasis_words` from `edit.json` v2 still stands. Do not put the seat back into the v2 exact keys. The reason given for that ruling, zero uses across 60 field-test files, did not include production reels outside that set. Production reels actually used 15 words, so the claim that word-level emphasis itself is unnecessary is corrected.

## 1. Seat

Only when `captions.json` has an object root, an optional top-level `emphasis_words[]` is allowed.

```jsonc
{
  "emphasis_words": [
    {
      "id": "e-0001",
      "src": "main",
      "t_start": 12.08,
      "t_end": 12.44,
      "word": "best",
      "emotion": "joy",
      "style_preset": "neon",
      "style_hint": "size-pulse"
    }
  ],
  "captions": [ /* unchanged */ ]
}
```

An array root (`[{ ...caption... }]`) cannot hold a top-level field, so it has no seat for `emphasis_words[]`. To write word-level emphasis, move to an object root and wrap the existing array in `captions[]`.

## 2. Record contract and the delta

Record shape, field vocabulary, source-second anchors, the rule that copies measured word-level timestamps, the selection rule, and the degradation rule are all the same as the [edit.json v1 word-level emphasis contract](./contract-2026-07-23-edit-json-v1-emphasis-words.md). This contract changes only the following two points.

1. Move the array from `edit.json.emphasis_words` to `captions.json.emphasis_words` on the object root.
2. Do not write it to `edit.json` v2. The old v0 and v1 seat stays as a read-only backward-compatible fallback.

Each record is therefore `{ id, word, emotion, src?, t_start, t_end, style_preset?, style_hint? }`. `id` matches `^e-\d{4}$` and is unique in the file. `word` and `emotion` are non-empty strings. Times are source seconds with `0 <= t_start < t_end`. `emotion` uses `joy`, `pain`, `surprise`, `anger`, `sadness`, and `emphasis` as the standard vocabulary, but, as in the v1 contract, it is not a forced enum. `style_hint` stays a suggestion to the renderer. `style_preset` is optional. It suggests a `textstyle-catalog` id, the same catalog as caption templates, as the look of the word. Applying Template from a word selection in the transcript panel writes one record per range into this seat.

## 3. Read priority

A consumer reads exactly one seat, in this order.

1. If the object-root `captions.json` has an `emphasis_words` key, use that value.
2. If the key is absent, read v0 or v1 `edit.json.emphasis_words` as the backward-compatible fallback.
3. If neither seat exists, there is no word-level emphasis.

Do not merge when both seats exist. Use only the `captions.json` side, and do not warn. The new caption source of truth always wins. An existing v0 or v1 project whose `captions.json` has no seat still renders from the `edit.json` side alone, as before, and does not regress.

## 4. Verification duties

`captions.schema.json` defines the optional `emphasis_words[]` only on an object root. It checks required fields on each element, types, the `id` shape, non-negative times, and non-empty `word` and `emotion`. JSON Schema cannot compare sibling values, so `validate-captions.mjs` checks `t_end > t_start` and unique `id` values inside the array. Matching a word against the measured `captions[].words[]` stays the writer's discipline, as in the v1 contract. Static verification does not do it.
edit-lint accepts `emphasis_words` on an object root and checks it with the same rules.

## 5. Drawing `style_preset`

The shared caption kernel adds `words[]` and `word_styles[]` to a display cue only when an `emphasis_words[]` entry that has `style_preset` hits a word after projection. `words[]` has `start` and `end` in output seconds, the body `text`, and `line`, the line number inside `display_lines`. `word_styles[]` has the half-open `from` and `to` into `words[]`, the preset id `preset_id`, and the resolved CSS variables `style_vars`. If the time range overlaps only the middle of a word, round to that whole word (the containing side). A cue with no matching word gets neither key, and the previous output does not change.

The draw DOM marks a normal word as `akari-caption__tok` and a word with a preset as `akari-caption__tok akari-caption__tok--preset`. The preset word also gets `data-emphasis-preset` and inline CSS from the resolved `style_vars`. The shell preview, the web preview, render-cut, and gpu-export all draw with this same rule. The transcript panel keeps each word span readable as `data-emphasis-preset`, and shows only the preset color and a light underline. The existing line-template chips stay.

A record with no `style_preset` stays on the existing `emotion` and `style_hint` path. Today the `style_vars` passed to a word are only the color, font-size, font-weight, line-height, and stroke family. Glow, shadow, `letter_spacing`, and `text_transform` are not supported.
