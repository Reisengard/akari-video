**English** | [Japanese](./contract-2026-09-02-audio-envelope-v1.ja.md)

# Audio envelope kernel v1

- Date: 2026-09-02
- Status: implementation contract
- Applies to: legacy `audio.*`, v2 audio items, Web Audio Preview, and render-cut

## 1. Shared primitive

An `EnvelopePoint` is `{ t, gainDb, easing? }`. `t` is seconds with the clip start as 0. `gainDb` is dB added to the base gain. Before the first point and after the last point, the endpoint value holds. Between points, dB is interpolated with the same easing factor as an Overlay keyframe. `hold` keeps the previous value. The default is `linear`.

Envelopes add in dB. A non-linear span is expanded to a polyline with at most 20 ms between samples. Web Audio turns a dB-linear span into `exponentialRampToValueAtTime`, and the linear-gain floor is `1e-4` (-80 dB). Export samples the same evaluate function as 48 kHz mono f32le.

## 2. Volume keyframes

| Form | Declaration | Time | Range |
|---|---|---|---|
| v2 audio item | `keyframes[].gain_db` | Integer frames relative to the item | `[-60, 12]` dB |
| legacy bgm, sfx, narration | `keyframes[].gain_db` | Seconds relative to the clip | `[-60, 12]` dB |

A visual key is ignored on a v2 audio item, and lint warns. The legacy view converts v2 frames to seconds with `output.fps`. A keyframe value is added to the clip `gain_db`. Fade and ducking multiply in the linear domain, separate from that sum.

## 3. Ducking

| Key | Type and range | Default | Meaning |
|---|---|---|---|
| `ducking` | boolean | `false` | Applies to bgm and sfx |
| `duck_db` | `[-40, 0]` dB | `-12` | Attenuation |
| `duck_attack` | `[0, 2]` seconds | `0.3` | Fall time before a key starts |
| `duck_release` | `[0, 5]` seconds | `0.8` | Return time after a key ends |
| `audio.duck_keys` | An array of `narration` and `speech` | Both | Which keys are selected |

Owner feedback on 2026-09-02 said the switch was abrupt, so the default attack and release were made smoother.

A `narration` key is built from the placed time and the decoded or probed duration. A `speech` key maps source-second transcript entries in the project-root `analysis.json` through the cut's in, out, speed, and timeline map. The source path is normalized against the directory that holds analysis.json, and only a cut whose `sources[].path` matches is used. Speech gaps under 350 ms are merged. An isolated span under 150 ms is dropped. Missing analysis, empty analysis, or a source mismatch degrades to an empty key and one warning line.

Key spans whose gap is less than `attack + release` are merged. Each span `[s,e)` falls from 0 dB at `s-attack` to `duck_db` at `s`, holds until `e`, and returns to 0 dB at `e+release`. A negative time is clamped to 0. The span is made relative to the target clip and clipped to the clip. Effective gain is fade applied to the linearized value of `gain_db + keyframes(t) + duck(t)`.

## 4. Preview

`audio-schedule` emits `envelopeEvents` for every audio kind. frame-engine creates a second GainNode only when events exist, and applies them with `setValueAtTime` or `exponentialRampToValueAtTime`. `duckIntervals` remain for UI display compatibility.

Supplying speech intervals to preview-server is out of scope in this version. With no such input, only narration keys run. The shared kernel itself, and render-cut's speech map, are the source of truth.

## 5. Export

`sidechaincompress` and the narration-branch `asplit` are not used. An `env-<label>.f32` is built only for a target that has keyframes or a real duck span, and it is read as 48 kHz mono f32le. Target audio is aligned to stereo fltp just before `amultiply` with `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo`. Mono footage gets the default rematrix mono-to-stereo coefficients. The envelope is copied to left and right at unity gain with `aformat=sample_fmts=fltp:sample_rates=48000,pan=stereo|c0=c0|c1=c0`. `amultiply` is therefore always stereo by stereo, whatever the footage channel count. The insert sits after `volume` and `afade`, and before `adelay`. An all-zero-dB span does not create an envelope input, and the previous filtergraph stays.

On an input that has audio clip FX v1, the chain is fixed as `atrim`, then `highpass`, then `afftdn` or `anlmdn`, then `rubberband`, then `volume`, then `afade`, then envelope `amultiply`, then `adelay`. Clip FX therefore sits before the envelope. The effective duration after speed is the clip window for the envelope and for duck.

Run and receipt provenance records `duck_keys`, `speech_intervals`, `ducked_items`, and `keyframed_items` on `audio.envelope`. A plan does not keep the arrays themselves. It JSON-encodes only the path and the point count.

## 6. Checks and compatibility

The schema and the reader make type, range, and time-order failures errors. Lint warns on a value past the effective duration, on narration with `ducking:true`, and on a visual key in v2 audio keyframes. Legacy `STATIC_DUCK_GAIN_DB`, `computeDuckIntervals`, and `isWithinDuckInterval` stay as a compatibility face until existing shell consumers move.

| Step | Preview | Export |
|---|---|---|
| Keyframe and duck interpolation | Shared dB envelope, then exponential automation | Shared dB envelope, then f32le, then `amultiply` |
| Fade | Base GainNode | `afade` |
| Key duration | Decoded duration | ffprobe duration |
| Difference that is allowed | Decoder and sample boundary | Decoder and sample boundary |

afftdn, loudnorm, and the true-peak guard belong only to the final master. Preview does not implement them.
