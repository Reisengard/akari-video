**English** | [Japanese](./contract-2026-09-02-export-verify-declared-vs-measured-v0.ja.md)

---
lifecycle: draft
created: 2026-09-02
updated: 2026-09-02
---

# Export verification, declared versus measured, v0

## 1. Background

In issue #45, a long Export passed every existing ffprobe check, but the declared audio was digital silence and the declared camera move did not appear in the output. Container checks such as duration, frame count, resolution, and codec cannot tell whether the declared picture and sound are actually there.

This contract adds a declared-versus-measured layer to `render-cut` `verifyArtifact`, on the final MP4 shared by every engine. The layer is separate from the container checks. v0 covers loudness and crop or transform keyframes on media cuts.

## 2. Rules

- Measure a small sample of the final MP4, using the declaration as the ground. An intermediate file, or a check inside an engine child, is not the source of truth.
- Run the existing 11 ffprobe and full-frame-decode checks first. Do not change their results or their order.
- If audio was declared and every sampled interval is digital silence, fail. A measurement that cannot be made also fails closed.
- A "too similar" camera-move judgment can false-positive, so v0 keeps it as a warning.
- A warning does not block `verdict: pass`, CLI exit 0, or creation of the immutable render receipt.
- Existing receipts read `verification.measured` as a closed world. Do not change it. New results are recorded on `verification.declared`, and they remain in `.akari/render.json` and the render report.

## 3. Check table

| check | Declaration ground | Measurement | severity | Record |
|---|---|---|---|---|
| Existing `verify.*` | Plan duration, fps, video and audio codec, and related fields | ffprobe plus a full-frame decode | A mismatch is an error | `verification.measured`, as before |
| `verify.audio-level` | `plan.commands.audio_mix.hasAudibleAudio` (BGM, SFX, narration, or master) or `has_audio` on footage in use | `volumedetect` on at most 6 intervals of the final MP4 | Declared audio plus a max level below -80 dB, or a measurement that cannot be made, is an error. No declaration plus an audio stream is a warning. Audible audio is info. No audio stream is skipped | `verification.declared.audio_level` |
| `verify.motion-static` | A cut whose crop or transform changes across 2 or more keyframes, at most 8 cuts from the start | Extract the two times with the largest difference as 160 by 90 gray, and compute NCC | NCC at or above 0.98 is a warning. Below that is info. A uniform frame is skipped | `verification.declared.motion[]` |
| `verify.blank-frames` | Active spans of `edit.overlays` and `edit.cuts` | Measure every frame of the final MP4 in one `signalstats` pass. Extract a span where YMAX stays at or below the estimated background plus 8 for at least 0.3 seconds | A warning when an active Overlay or cut is present. Info when the count is 0. This is not an error, and it does not change the verdict | `verification.declared.blank_frames[]` |

The blank-frame scan is on by default. `--no-verify-blank` stops it. Background YMAX is the median of the lowest 5 percent of YMAX observations over the whole output. The scan does not use `-skip_frame` or a downscale, so the shortest reported run is 0.3 seconds. A record is `{start, duration, ymax_max, active_overlays[], active_cuts[], severity}`. The content and order of the existing 11 findings, `verification.measured`, and the closed key set of the receipt payload do not change.

`verification.declared.audio_level` has this shape.

```jsonc
{
  "declared": true,
  "reasons": ["bgm", "footage-audio"],
  "threshold_db": -80,
  "intervals": [
    { "start": 0, "duration": 10, "mean_db": -24.1, "max_db": -3.2 }
  ],
  "max_db": -3.2,
  "verdict": "pass"
}
```

`footage-audio` names an input whose `has_audio` is true. The token `declaredAudioReasons` pushes for that case is in `packages/render-cut/src/verify-artifact.mjs`. `verdict` is `pass`, `fail`, `warning`, or `skipped`. Each motion record is basically `{ cut, t1, t2, ncc, verdict }`. When it cannot be judged, it keeps `ncc: null` and `skipped` of `"uniform"` or `"measurement"`.

## 4. Loudness interval sampling

Let the output duration be `D` seconds. The interval count, the interval length, and each start are:

```text
k = min(6, max(1, ceil(D / 300)))
L = min(30, D)
s_i = clamp((i + 0.5) * D / k - L / 2, 0, D - L)  (i = 0..k-1)
```

`s_i` rounds to 3 decimal places. Each interval is measured on its own, with an input seek:

`ffmpeg -ss <s_i> -i <out> -t <L> -vn -af volumedetect`

`mean_volume` and `max_volume` accept `-inf`. `max_db` is the maximum of `max_volume` across every interval. The threshold is fixed at -80 dB in v0. It is not an option.

## 5. Camera move and NCC

A render-edit keyframe `t` is **output-local seconds** already converted from frames by edit-store. Only an input that still looks like an unprojected frame value is converted to seconds with `fps`. The check time is `T = the cut's output start seconds + t`, clamped to `[0, D - 1/fps]`.

Pick the point pair with the largest L1 distance across crop `x`, `y`, `w`, and `h`. If crop does not change, pick the pair with the largest difference across transform `x`, `y`, `scale`, and `rotate`. Extract 160 by 90 gray rawvideo at the two times, and compute the normalized cross-correlation of pixel columns `a` and `b`.

```text
NCC = Σ((a - ā)(b - b̄)) / sqrt(Σ(a - ā)² * Σ(b - b̄)²)
```

If either standard deviation is below 2, the frame is close to one color and correlation cannot judge it, so skip as `uniform`. Otherwise, NCC at or above 0.98 warns that the output frames are too similar for the declared different framing. The warning is printed before the CLI PASS line as `WARN verify.motion-static: ...`.

## 6. v1 candidates

- Sampling pixels of Captions and Overlays
- A check against the original, after a map from original time to output time is defined
- A new threshold and severity ruling from the measured motion distribution
- Making the threshold an option
- The same checks for a direct CLI call of gpu-export or osr-export

Extending the receipt payload, and changing edit-lint, belong to a separate contract from the candidates above.

## 7. Acceptance

- Lock the loudness interval plan, the parser that accepts `-inf`, the six audio judgments, NCC, and motion-probe selection with pure-function tests.
- Confirm an audible tone, digital silence, and a file with no audio stream against real ffmpeg.
- A still non-uniform picture is a motion warning. A uniform picture is a `uniform` skip. A moving picture is info.
- Keep the content and order of the existing 11 findings, the key set of `verification.measured`, and the key set of the receipt payload unchanged.
- A warning does not change the verdict, the exit code, or receipt creation. The CLI and the HTML report show it as a yellow row.
