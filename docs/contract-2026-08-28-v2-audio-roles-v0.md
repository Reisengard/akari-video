**English** | [Japanese](./contract-2026-08-28-v2-audio-roles-v0.ja.md)

# v2 audio-processing roles v0. Web Audio preview and the ffmpeg master

- Date: 2026-08-28
- Status: draft (L1 measurements are reflected)
- Depends on `contract-2026-07-14-edit-json-v1-audio.md`, `contract-2026-07-20-edit-json-v1-narration.md`, and `contract-2026-07-25-r6-audio-tracks-and-trim.md`
- Scope: how the frame-engine bench supplies BGM, narration, and SFX for preview, and where render-cut's responsibility for the final export audio starts

## 1. Role split

**Preview is an approximation through Web Audio. Export is canonical through ffmpeg master processing.**

The frame-engine bench builds a deterministic schedule from the resolved timeline duration, the audio declarations in edit.json, and the decoded footage duration, and it feeds that schedule to `AudioBufferSourceNode` and `GainNode`. During playback, `AudioContext.currentTime` is the canonical clock, and picture drawing follows it. The same schedule can play on `OfflineAudioContext`, so the real-time preview and the offline render used for comparison take the same input.

render-cut is the only canonical source for the audio quality of the final artifact. Do not use what was heard in preview as a guarantee of delivery audio, including loudness, true peak, noise processing, and dynamic ducking.

## 2. Approximation list

| Item | Preview (Web Audio) | Export (ffmpeg) | Nature of the difference |
|---|---|---|---|
| ducking | Apply the shared deterministic envelope with `exponentialRampToValueAtTime` | Turn the same envelope into f32le and `amultiply` | Allow only the decoder difference and the sample-boundary difference |
| BGM fade | Linear `AudioParam` automation of `fadeIn` and `fadeOut` on the timeline | Apply `afade` inside the master audio chain | Measured difference with no master is within ±0.034 dB (§3.2). Amplitude after later processing may not match |
| SFX fade | Linear automation of `fade_in` and `fade_out` against the clip's effective duration | Apply `afade` to the effective duration after trim | The basic shape matches. Later master processing affects export only |
| Loudness | Only the mix of per-item gain and fade or ducking. No program-wide normalization | Apply EBU R128 measurement and master processing | I, LRA, and TP are not guaranteed to match |
| BGM loop boundary | `AudioBufferSourceNode.loop`. After the first `in`, it returns to the start of the footage | Clamp the ffmpeg loop input to the final duration | Decoder boundary, sample rounding, and click-suppression differences may remain |
| trim | Clamp `in` and `out` to the decoded duration, then convert to a start offset and a playback duration | Clamp to the probed duration and run `atrim` plus a timestamp reset | Both aim at the same footage second. Allow only the decoded-duration and sample-boundary difference as the approximation |
| SFX overlap | Connect each event at the same time as its own BufferSource | Delay each event, then mix with `amix normalize=0` | Peaks with multiple inputs, and later protection, differ |
| gain | Clamp `gain_db` into range and convert with `10^(dB/20)` to a linear gain | Pass the same dB value to `volume` | The base conversion matches. Absolute amplitude after master processing is canonical on the ffmpeg side |
| afftdn | Do not apply | Apply according to the master-processing composition | The noise floor and the high band change on export only |
| loudnorm and true-peak guard | Do not apply | Apply according to the output policy | Final level, LRA, and true peak are guaranteed by export only |

## 3. L1 measurements

Use the same edit.json and a deterministic tone footage. BGM is 200 Hz and narration is 3000 Hz. Separate the 200 Hz band of the mix and measure the BGM attenuation trace. The preview side uses `OfflineAudioContext`. The export side uses the render-cut artifact as input. Measure loudness on both with ffmpeg `ebur128=peak=true`.

### 3.1 Sync

The environment was macOS 26.2 and Chromium (Playwright). The fixture was 300 s total, 30 fps, 300 cuts, 10 narration items, 20 SFX, and 1 BGM (ducking on). This table is a measurement of the Web UI bench. The shell bench can take the same quantities through the same observation window, `window.akariFrameEngineAudioDebug()`.

| Condition | Sample interval | Sample count | Max drift (ms) | p95 (ms) | Judgment cap (ms) |
|---|---:|---:|---:|---:|---:|
| 5 minutes straight | 10 s | 29 | 2.700 | 2.700 | 33 |
| After 30 seeks | after each seek | 30 | 16.667 | 6.666 | 33 |

Drift converts "timeline seconds of the last frame that finished drawing, minus the playback position from AudioContext" into ms, and aggregates the absolute value. The maximum of all 59 points was 16.667 ms, and p95 was 6.666 ms. All 29 points of straight playback sat at 2.700 ms. No diverging component that grows with time was observed. `scheduleStartAtSec` was 0.0293 s. `wallClockOffsetSec` after running the full 5 minutes was 0.0224 s.

### 3.2 Difference between preview and export

| Measurement | Unit | Preview | Export, no master | Delta, preview minus no master | Export, with master | Delta, preview minus with master |
|---|---:|---:|---:|---:|---:|---:|
| BGM attenuation during narration | dB | -11.628 | -9.956 | -1.672 | -27.639 | +16.010 |
| fade-in at 0.5 s (ratio to plateau) | dB | -12.021 | -11.992 | -0.029 | -8.383 | -3.638 |
| fade-in at 1.5 s (ratio to plateau) | dB | -2.512 | -2.516 | +0.004 | +1.085 | -3.597 |
| fade-out with 1.5 s left (= 10.5 s, ratio to plateau) | dB | -2.467 | -2.471 | +0.004 | -24.571 | +22.104 |
| fade-out with 0.5 s left (= 11.5 s, ratio to plateau) | dB | -11.890 | -11.856 | -0.034 | -33.081 | +21.191 |
| Integrated loudness (I) | LUFS | -12.3 | -12.3 | 0.0 | -14.3 | +2.0 |
| Loudness range (LRA) | LU | 11.5 | 11.5 | 0.0 | 5.7 | +5.8 |
| True peak (TP) | dBFS | -11.9 | -14.7 | +2.8 | -10.7 | -1.2 |

`no master` is the raw mix difference, including ducking and fade. `with master` is the delivery-side difference after adding `denoise: off` and `loudnorm: -14`. This version does not make the size of the difference a pass or fail condition. The machine judgment is only that the measurement completed, and that sync stayed under the 33 ms cap.

1. **The fade shape effectively matches when there is no master.** All 4 points differ by at most 0.034 dB absolute, which is measurement noise. The preview's linear `AudioParam` ramp and ffmpeg `afade` line up in both time and curve.
2. **Ducking depth differs by 1.67 dB with no master.** The preview's fixed -12 dB is deeper. `sidechaincompress` is a compressor with attack 5 ms, release 300 ms, and ratio 8, and the span average does not sink all the way to -12 dB. Use this difference as input to the decision in §4.1.
3. **Relative dB with master is contaminated by the time-varying gain of 1-pass `loudnorm`.** `loudnorm` moves the gain per span, so the plateau-ratio scale itself stops holding. The -24 dB and -33 dB on the fade-out side are not the attenuation of the BGM itself. In this column, only the three rows I, LRA, and TP mean anything. Read the fade and ducking rows as evidence that a relative measurement stops working after master processing.
4. **With no master, loudness matches exactly on I and LRA.** The 2.8 dB TP difference is because export goes through an AAC re-encode. With master, I moves toward the -14 LUFS target, and LRA is compressed from 11.5 LU to 5.7 LU. That is the numeric backing for "preview does not guarantee loudness".

## 4. Items to settle before G3

1. Measure the BGM attenuation difference of ducking, and the attack and release difference. Decide whether to keep the rectangle approximation, or to have both sides consume a shared envelope computed by the kernel. Even if they are unified, the final say on the compressor and limiter stays on the ffmpeg side.
2. Check whether the relative fade curve stays inside the tolerance. If the times match and only the amplitude differs because of master processing, keep it as an approximation. If the times differ, fix the schedule or the ffmpeg filter order before G3.
3. Add a measurement at the loop boundary and the trim boundary for clicks, a gap of one sample or more, and an unintended overlap.
4. Measure true peak when SFX overlap. Decide whether to add a light protection on preview, or to keep an export check mandatory. Do not reimplement loudnorm on the preview side.
5. Decide whether the I, LRA, and TP differences need to be shown in the UI. At least at G3, keep the label "preview is an approximation, check the final audio on export".

**G3 ruling (2026-08-28):**

1. The 2026-09-02 contract turned ducking into a shared deterministic envelope. `sidechaincompress` was retired.
2. Fade stays an approximation, because the times match.
3. The extra measurement of the loop boundary and the trim boundary is a separate ticket.
4. SFX true peak stays an export check, and preview gets no protection.
5. Keep the label "preview is an approximation, check the final audio on export".

## 5. Approximations that stay

- Decoder, sample-boundary, and output-device differences between Web Audio and ffmpeg.
- Preview does not run afftdn, loudnorm, or the true-peak guard.
- The shared ducking envelope is the same on both paths. Only the decoder and sample-boundary difference remains.
- Preview does not pay the compute cost of the final master processing, so a listening check stays immediate.

Even with these approximations kept, the start on the timeline, trim, loop, gain, fade, and the span that ducking targets must be reproducible from the same deterministic schedule.

## 6. Speech in shot footage, and the ducking sidechain

`speech` is the audio inside shot footage on cuts[]. It projects each cut's trim and speed onto the output timeline. The 2026-09-02 contract adds transcript spans from `analysis.json` to the ducking key through the same map. Export consumes this speech key. Wiring the speech key into the preview server is outside that contract. Until it is wired, the key degrades to the narration key only.

`gain_db` (-60 to 12, default 0) and `mute` (boolean, default false) on `tracks[].items[].source` (`kind: 'media'`) can attenuate or mute the embedded audio per cut. `mute: true` does not create a speech declaration at all, and it removes both the preview sidecar request and the PCM cost. Export keeps the duration with a silent span. The default with no key is exactly the previous behavior, so an existing job's output does not change.

### 6.1 Per-track `tracks[].muted`

`muted?: boolean` defaults to false. `muted: true` on a visual track replaces the cut's embedded audio with anullsrc and keeps the duration (a video layer is out of scope). `muted: true` on an audio track drops the item from the export mix and the preview mix, and also drops it from ducking. `hidden` and `locked` on a track stay on the storage side, as before, and do not appear in edit.json.

## 7. Pitch-preserving sidecar for sped speech

Speech in shot footage whose `speed` is not 1 is taken out of the Web Audio `playbackRate` approximation. Before preview, cut the target cut's `[in, out)` with ffmpeg and generate, once, a 48 kHz `pcm_s16le` WAV with the same `atempo` chain as render-cut. Keep the original channel count. Preview plays this short WAV at offset 0 and `playbackRate = 1`.

The artifact lives in the job's `.akari/cache/speech-atempo/`. The key is decided from the footage identity, trim, speed, and the `atempo` chain. The same input is not generated again. An item that fails to generate or decode emits one warning line and falls back to the previous `playbackRate` path. It does not stop preview of the picture or of the other audio. Therefore the pitch difference of sped speech is not part of the "approximations that stay" in §5.

## 8. Preview audio sidecar and prefetch (update of §7)

The WAV in §7 is retired. Speech in shot footage, at any speed, is cut once to FLAC (compression level 5) at 48 kHz and the original channel count, for the used span only. At a `transition_out` boundary, the handles before and after are included in the same sidecar. The preview schedule overlaps them with the same linear gain as the ffmpeg `acrossfade` default `c1=tri:c2=tri`. Therefore "where speech is supplied from" and "the sound of the transition span" are not approximation targets in §2 or §5.

The output directory is the job's `.akari/cache/preview-audio/`. The file name is `sha1(sourcePath|size|mtime|in|out|speed|padBefore|padAfter|recipe)`, and recipe is `preview-audio-flac-v1`. The same key is not generated again. Each time a schedule is built, the set of keys in use now is canonical, and FLAC files outside that set, plus old `.akari/cache/speech-atempo/*.wav`, are cleaned up. Only on a generation failure, fall back to the original file. If the speech source file is 64 MB or larger, do not load the whole file into the renderer. Skip that item with one warning line.

BGM, SFX, and narration use the same FLAC sidecar when the original file is WAV and larger than 8 MB. frame-engine establishes picture ready first. Immediately after that, it decodes all audio asynchronously, in order of first use on the schedule, two at a time. Decoded PCM is tracked by total bytes. The default budget is 256 MiB. Crossing the budget does not drop buffers (revised 2026-09-02. Previously it silently evicted the item whose next use was furthest away, that source disappeared from the schedule, and the result was silence). The overrun is one warning line and `debug().prefetch.overBudget`. A source whose expanded size is estimated above 64 MiB (about 2.9 minutes of 48 kHz stereo) is decoded on `OfflineAudioContext` down to 24 kHz and folded to mono (compact. This is a preview-only approximation and does not affect the delivery master). The estimate comes from the WAV or FLAC header. Other compressed audio uses 16 times the encoded size. Playback start reuses items that are already prefetched and waits only for items that have not arrived, so prefetch does not block drawing the first frames. An item that fails to decode is retried after 5 seconds, and until then it sits on `debug().prefetch.failed`.

## 9. Stacking BGM (crossfade)

Several `role:"bgm"` items may overlap in time if they sit on different audio tracks. During the overlap, both play. render-cut applies fade and the ducking envelope to each BGM, then adds them with `amix normalize=0`. A crossfade puts a duration on the earlier item's `fade_out` and the later item's `fade_in`.

edit-lint warns with `v2.audio-bgm-multiple` only for an overlap where the earlier item has no `fade_out` and the later item has no `fade_in` (relaxed from error on 2026-09-28, #120). An overlap on the same track stays an error, `v2.track-no-overlap`, as before.

The real-export measurement is fixed in `packages/render-cut/test/bgm-crossfade-overlap.test.mjs`. Measured on 2026-09-28, Windows, ffmpeg 9.0. Band level applies `bandpass` (Q=15) and `volumedetect` to a 0.2 second window at each time. Peaks are measured with `astats`. Units are dB and dBFS.

| Measurement | With fade | Without fade |
|---|---:|---:|
| 440 Hz band, at 1.0, 1.55, 1.75, 1.95, and 2.5 seconds | -9.4, -10.7, -15.5, -26.5, -36.1 | -9.4, -9.4, -9.4, -11.5, -36.1 |
| 880 Hz band, same times | -36.1, -23.7, -14.6, -10.0, -9.3 | -36.1, -10.3, -9.2, -9.3, -9.3 |
| Peak of footage `a.wav` | -3.06 | -3.06 |
| Peak of the whole output | -5.82 | -0.96 |
| Peak of the overlap span (1.5 to 2.0 seconds) | -6.05 | -0.96 |
| Peak of the earlier solo span (0.5 to 1.3 seconds) | -5.89 | -5.89 |
| Peak of the later solo span | -5.82 | n/a |

With fade, both frequencies play in the overlap, and the peak does not exceed the solo span (-6.05 against -5.89 dBFS). Without fade, the overlap peak rises by about 4.9 dB (-0.96 dBFS. A louder footage could reach 0 dBFS). That is why an overlap with no fade is a warning.

A measurement on the preview (Web Audio) side has not been done.
