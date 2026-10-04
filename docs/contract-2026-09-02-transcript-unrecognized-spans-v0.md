**English** | [Japanese](./contract-2026-09-02-transcript-unrecognized-spans-v0.ja.md)

# Unrecognized transcript spans (`unrecognized[]`) v0

- Date: 2026-09-02
- lifecycle: accepted
- Applies to: `transcript[]` in `analysis.json` and caption records in `captions.json`

## 0. Place

`unrecognized[]` records a span that has sound but did not become text, the same idea as Vrew's inline `??`. It covers a vocalization that did not become a word, a breath, noise, or music. Silence itself is out of scope. This contract defines the data, the detection, and the carry into captions. Display and editing of `??` belong to T5b.

## 1. Data model

Each `transcript[]` segment in analysis.json, and each caption record in captions.json, may carry a sibling array `unrecognized: [{ start, end }]`. `start` and `end` are non-negative seconds. In analysis they are source seconds. In captions they use that record's `time_domain`. When `time_domain` is omitted, they are source seconds.

Each array is sorted by ascending `start`, and the spans do not overlap. A producer does not emit a zero-length span, and a span does not overlap any word span in `words[]`. `words[]` keeps only recognized words from the body. Unrecognized spans are not mixed in.

## 2. Detection rules

Detection has only two grounds.

1. The time span of a non-speech marker whisper stated explicitly, such as `[inaudible]` or `(unintelligible)`, and the same bracket forms with the spellings asserted in `packages/akari-tools/test/unrecognized-spans.test.mjs`. Control markers are dropped. Those are `[BLANK_AUDIO]`, `[_BEG_]`, `[_TT_n]`, `[_SOT_]`, `[_EOT_]`, and `[_TRANSCRIPT_]`.
2. Each gap of at least 0.45 seconds at the segment start, between words, or at the end, after ffmpeg `silencedetect` silence is subtracted, when at least 0.3 seconds remain. The `silencedetect` default is `noise=-35dB:d=0.2`.

Ground 1 has no length threshold. A span that overlaps ground 2 is merged with it. Boundaries round to milliseconds. The same input, word times, silence spans, and options always produce the same output.

## 3. Carry into captions.json

`fill-caption-words` copies a transcript segment's `unrecognized[]` onto each caption by time overlap, and clips each span to the caption's `[start, end]`. An empty result does not write the key. An existing non-empty `unrecognized[]` is kept unless `--force` is set. That choice is independent of whether `words[]` exists and of the overwrite decision for words.

## 4. Lint

The schema and the validator check the array, exact keys on each element, finite non-negative `start` and `end`, `start <= end`, ascending order, and no overlap. The validator allows a span outside the caption range. edit-lint reports the same shape violations as a `captions.schema` error, a span outside the caption as a `captions.unrecognized-range` warning, and an overlap with a word span as a `captions.unrecognized-overlaps-word` warning.

## 5. What consumers promise

The shape of existing `words[]`, the rule that `text` is non-empty, and the meaning "one element is one word of the body" do not change. Karaoke drawing, the word re-derive kernel, and the existing Preview do not consume `unrecognized[]` as words. Inline `??`, replacement, cutting, and QC linkage are T5b.

## 6. Out of scope

Confidence, a marker for a low-confidence recognized word, and automatic replacement or automatic cutting of an unrecognized span are not in this contract. SpeechAnalyzer and cloud backends do not add their own non-speech marker readings. Only detection from word gaps is shared.

## 7. Panel promise (T5b)

The script panel shows each unrecognized span as a fixed `??`, in time order. The display position is immediately after the last word that satisfies `span.start >= words[i].end`. If no such word exists, it goes at the start of the line. If it is after the last word, it goes at the end of the line. On a line with no `words[]`, the marks are placed at the end of the body. `??` is not a caption word and is not a karaoke word index.

Replacing a span with heard text updates `text` and `unrecognized` in one `setCaptionFields` write. The characters are inserted in the body immediately after the word that precedes that `??`, and only the target span is removed from `unrecognized[]`. The shared kernel `rederiveCaptionWords` places the new word's time between the kept words on either side. Other existing words do not change.

A per-picture cut passes the target `[start, end]` to `applyCutRanges` with no padding and with `kind: 'unrecognized'`. After a successful cut, the target span is removed from `unrecognized[]`. If the caption update fails, edit.json from before the cut is restored.

The transcript-tab regenerate serializer and the edit-store `insertCaptionLine` serializer both preserve a non-empty `unrecognized[]`. On regenerate, a row with `edited: true`, and a row with no matching segment, keep their existing value. A regenerated row with `edited: false`, and a new row, clip the analysis segment's spans to the caption `[start, end]` at millisecond precision, sort them by time, merge adjacent and overlapping spans, and carry them over. An array that became empty is not written.

A marker for a low-confidence recognized word, a single `?`, and a distinct use of `???` are out of scope for T5b.
