**English** | [Japanese](./contract-2026-09-02-audio-clip-fx-v1.ja.md)

# Audio clip FX v1

- Date: 2026-09-02
- Status: implementation contract
- Applies to: legacy `audio.*`, v2 audio items, render-cut, and the preview-audio sidecar

## 1. Declaration

| Key | Applies to | Type and range | Default | v2 location |
|---|---|---|---|---|
| `speed` | sfx, bgm | number `(0.25, 4]` | `1` | `item.source` |
| `pitch_semitones` | sfx, bgm | number `[-24, 24]` | `0` | `item.source` |
| `formant` | sfx, bgm | `preserve` or `shift` | `preserve` | `item.source` |
| `denoise` | sfx, bgm, narration | `{ method: fft or nlm, strength: 0..1 }` | absent | item |
| `lowcut_hz` | sfx, bgm, narration | number `[0, 400]` | `0` | item |

`speed` does not change timeline `t`. The effective duration is the footage window duration divided by `speed`. `pitch_semitones` does not change speed. Narration `speed` and `pitch_semitones` belong to TTS, so a lint warning ignores them. Legacy and v2 projection keep the values in the table in both directions.

## 2. Filter chain

The per-clip order is fixed.

`atrim(in/out)` then `highpass=f=<lowcut_hz>:p=2` then `highpass=f=<lowcut_hz>:p=2` then denoise then `rubberband=tempo=<speed>:pitch=<2^(pitch_semitones/12)>:formant=<preserved|shifted>:pitchq=quality` then `volume` then `afade` then envelope `amultiply` then `adelay`.

Lowcut cascades the same second-order highpass twice. That is an intentional exception to the earlier ruling, so the 24 dB/oct slope meets the L1 gate of at least 15 dB down one octave below.

`fft` denoise is `afftdn=nr=<12+strength*76>:nf=-30`. `nlm` denoise is `anlmdn=s=<0.00001+strength*0.0002>`. rubberband is built only when `speed != 1` or `pitch_semitones != 0`. When every key is at its default, no input and no filter are added, and the previous filtergraph stays byte for byte.

Fade, envelope, and duck windows use the effective duration after speed. BGM keeps the existing loop rule that returns to the start of the footage. The same clip FX runs on the looped input, then the result is cut to the timeline duration.

## 3. Preview sidecar

The recipe is `preview-audio-flac-v2`. The target clip's `[in,out)` is `atrim`med, then processed by the same clip-FX filter builder, then written as 48 kHz FLAC. The cache key includes the source absolute path, size, mtime, in, out, pad, and recipe, plus the full filter list including `atrim`. The same input and the same list reuse the same FLAC. A changed list is a different key. Cleanup still drops FLAC files whose keys are not kept, and it still drops old `speech-atempo/*.wav` files.

Sidecar sfx, bgm, and narration play in Web Audio at `playbackRate = 1`. The FLAC duration is the schedule's effective duration. If generation fails, Preview does not stop. Playback falls back to the original file, and one warning line says the Preview approximation of Export has broken.

## 4. Provenance and the approximation that remains

A receipt's `provenance.audio.clip_fx` counts `processed_items` and `filters`. The only approximation Preview and Export keep on purpose is recompression of the sidecar FLAC, plus decoder and sample-boundary differences.
