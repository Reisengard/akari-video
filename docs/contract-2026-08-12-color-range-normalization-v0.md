**English** | [Japanese](./contract-2026-08-12-color-range-normalization-v0.ja.md)

# Color range normalization v0

## 1. Background and purpose

Passing a full-range input (`color_range=pc` or `yuvj420p`) straight through to H.264 output makes the levels and the metadata disagree with players and verifiers that expect limited range for delivery. This contract normalizes every Render encode stage to limited range (FFmpeg `tv`) and keeps the final artifact consistent with the intermediate artifacts.

The origin of the bug and the reproduction conditions are in [public issue #21](https://github.com/AkariLabs/akari-video/issues/21).

## 2. Final-output guarantee

The final picture stream of an MP4 or H.264 file must satisfy both of the following.

- The pixel format is `yuv420p`.
- `color_range` is `tv` (limited range).

That pair is the AKARI Video delivery output.

## 3. Invariant for value conversion and metadata

Color-range normalization always does both steps together. It converts the pixel values, and it tags that metadata on the picture stream.

- Each video filter chain converts values immediately before output, equivalent to `scale=out_range=tv`.
- Each H.264 encode tags metadata equivalent to `-color_range tv`.
- Tagging `tv` while leaving full-range pixel values is forbidden.
- Converting the values to limited range and omitting the tag is also forbidden.

When the input is already tv range, `scale=out_range=tv` is a no-op for the range conversion.

## 4. Stage invariant

The output frame of every encode stage is tv range. That includes cut, tail padding, track stack, layers, and overlay composite. The rule applies to the final artifact and to every intermediate artifact passed to a later stage.

For a multi-source cut, each source's preprocess chain normalizes to tv range before the frames enter concat or a transition. Do not pass a mix of pc-range and tv-range frames straight into the same concat. Stages after a LUT or a composite also normalize to tv range at their end.

An audio-only mux that does not re-encode the picture, and a non-H.264 overlay intermediate that carries alpha, are out of scope.

## 5. Probe and provenance

Read the input source's `pix_fmt` and `color_range` from the ffprobe picture stream. Record them as provenance next to the existing duration, audio presence, width, height, and fps. If ffprobe does not report the input `color_range`, record `null`. Do not replace it with a guess.

## 6. Verify contract

Add `color_range: "tv"` to the render plan's expected values. Official verify reports `verify.color-range`.

- If the measured `color_range` is `pc`, that is an error.
- If the measurement is `tv`, that is a pass.
- If ffprobe does not report `color_range`, treat it as tv and pass. The H.264 default for an unspecified range is limited range.

Keep the `verify.pixel-format` expectation of `yuv420p`. Judge it independently of `verify.color-range`.

## 7. Reserved, out of scope for v0

The following belong to other contracts. v0 does not implement them.

- Colorspace conversion, such as BT.601 to BT.709.
- Colorspace metadata normalization with `-colorspace`, `-color_primaries`, or `-color_trc`.
- Conversion, tone mapping, and output format for 10-bit and HDR input.

`tv` normalization in this contract covers color range only. It does not silently promise the gamut or transfer conversions above.
