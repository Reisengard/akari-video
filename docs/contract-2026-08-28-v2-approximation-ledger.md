**English** | [Japanese](./contract-2026-08-28-v2-approximation-ledger.ja.md)

# Engine v2 approximation ledger

Adopted: 2026-08-28

## 1. Purpose and status rules

This ledger is the history of settling, one item at a time, the lasting approximations that accumulated between preview, the legacy export of that period, and engine v2. Legacy export is now retired.

A row has one of three statuses.

- **Resolved.** `packages/frame-engine/test/golden` has a point set, `test:seek` covers it, or this contract records a measurement.
- **Kept approximation.** The row stays on purpose. The reason is the role split between live preview and delivery processing, or a legacy-only difference during the compatibility period.
- **Separate ticket.** The row is outside the v2 pass or fail result. Track it under the candidate name in the table.

A **Resolved** row must name its acceptance point set or its measurement on that same row. A golden comparison is `diff 0` on the raw frame. The negative case must fail when the frames differ by 1 px. OSR determinism is a match of SHA-256 over every frame of two software-render passes. GPU byte-exact output is not a pass condition.

## 2. Ledger

| Approximation | Source | Legacy behavior | v2 status | Evidence, reason, or ticket candidate |
|---|---|---|---|---|
| Freeze does not extend duration | preview-parity, former §2.4.3 | The picture stopped in real time, the output duration did not grow, and the picture and every audio stream stopped together | **Resolved** | The resolved timeline moves later cuts. The 28 base-parity points that include freeze are `diff 0`. The long-lived acceptance uses `frameLifetime = 1000` frames |
| Screen FX `noise`, `particles`, and `flare` | preview-parity, former §2.4.5 | A scaled-down canvas, 4 bright points, and a CSS gradient approximated the ffmpeg expressions | **Separate ticket** | The golden set has no pixels for these three FX, so the row is not Resolved. Candidate name: **deterministic kernel for the three screen FX** |
| Bounding box of `cuts[].transform.rotate` | preview-parity, former §2.4.6 | The CSS box was not enlarged, so it could disagree with legacy `rotw` and `roth` and with the transparent padding edge | **Resolved** | The container and the export exit both consume the same frame-engine evaluator. The 28 base-parity points that include cut transform and opacity are `diff 0` |
| `cuts[].framing` together with `cuts[].transform` | preview-parity, former §2.4.2 | `transform-origin` on the same `<video>` fought itself, and the scale and rotate pivot shifted to the top left | **Resolved** | Framing and transform are composed inside the same frame-engine. The 28 base-parity points that include the combination are `diff 0` |
| Ducking as a -12 dB rectangle | preview-parity, former §2.5, and audio-roles §2, §3.2, and §4 | Inside a narration span the level jumped to a fixed -12 dB. It had none of the attack, release, or level dependence of `sidechaincompress` | **Kept approximation** | Kept by the G3 ruling. Measured without master: preview -11.628 dB, export -9.956 dB, delta -1.672 dB. Candidate name if they are unified: **shared ducking envelope** |
| Transition audio `acrossfade` | preview-parity, former §2.5 | The two sources around a cut boundary were not mixed together. A seek at the boundary switched from one to the other | **Kept approximation** | Picture goldens do not accept the audio waveform. Delivery audio treats ffmpeg `acrossfade` as canonical and keeps the difference from live preview explicit |
| `dissolve` not drawn, or xfade pseudorandom mismatch | preview-parity, former §2.6, #60 | Some containers did not draw it, or used a different random sequence and interpolation than ffmpeg xfade | **Resolved** | `transitionParity = 90` points and `transitionSemantics = 30` points are `diff 0`. The negative case always fails on a 1 px difference |
| Curves of `fade-black` and `fade-white` | preview-parity, former §2.6 | The contract allowed the curve difference between CSS opacity and ffmpeg xfade | **Resolved** | `transitionParity = 90` points cover 5 transitions, and the semantic `transitionSemantics = 30` points are `diff 0` |
| YUV to RGB bt601 versus bt709 | OSR §11.2 | Untagged footage was converted as bt601, so the color disagreed with v2 | **Kept approximation** | The G3 ruling makes v2 `bt709-limited` canonical. Against legacy, bt601 is MAD 9.28 and maxDelta 155. bt709 is MAD 0.886. The remainder comes from chroma interpolation |
| B-frames shown 2 frames early | OSR §11.1 | Negative DTS and the edit-list media time were not corrected, so the presented frame was always 2 frames early | **Resolved** | Fixed at the root in main `b30057de`. `bFrame = 160` sampled rows (summary 10), `bFrameTail = 24` rows (`bframe-tail-duration`), `test:seek` `bFrame.rows = 720` (coverage full), and `bFrameTail.rows = 24`. The tail is `finalFrameNumber = 239` |
| Seek at the end of a GOP | preview-parity, former acceptance section, #58 | Warm-up and lookahead at the end of a GOP were short, so the last frame could not be chosen stably | **Resolved** | Golden `gopTail = 9` points, `test:seek requestCount = 94`, `performance.lookahead.hits = 8` |
| `<img>` swap for a still-image cut | still-image §5.2 | The container did not rebuild `<video>`. It toggled a stacked `<img>` and kept the audio graph | **Separate ticket** | This branch exists only for the compatibility `<video>` container. Frame-engine golden pixels cannot be the evidence. Candidate name: **still-image cuts in the v2 container, and retirement of the img branch** |
| `audio.master` badge only | preview-parity, former §3, and audio-roles §1 and §5 | The UI showed a badge and did not reproduce `afftdn`, `loudnorm`, or the true-peak guard | **Kept approximation** | Role split. Live preview does not promise delivery audio. Measured with master: I -14.3 LUFS, LRA 5.7 LU, TP -10.7 dBFS |
| `loudnorm`, true-peak guard, and `afftdn` | audio-roles §2 and §5 | Preview did not apply them. Only the ffmpeg master did | **Kept approximation** | Kept by the G3 ruling. Measured without master, then with master: I -12.3 and -14.3 LUFS, LRA 11.5 and 5.7 LU, TP -14.7 and -10.7 dBFS |
| Chrome raster jitter of ±1 px on legacy export | OSR §9, #90 §5.4 | The same input still moved the Chrome raster edge by ±1 px, so legacy output could not be byte-exact | **Kept approximation** | Legacy-only difference during the compatibility period. v2 pass or fail moved to a SHA-256 match of every frame across two OSR software-render passes. Legacy byte-exact output is not a pass condition |

## 3. Totals

- Resolved: **7**
- Kept approximation: **6**
- Separate ticket: **2**
- Total: **15**

Separate tickets collect in [Engine v2 open items](./notes-2026-08-28-engine-v2-open-items.md) (Japanese). When a status changes, update this table's evidence cell and the acceptance contract in the same change.
