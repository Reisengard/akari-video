**English** | [Japanese](./contract-2026-08-18-v1-render-parity.ja.md)

---
lifecycle: draft
created: 2026-08-18
updated: 2026-08-18
---

# v1 render-path parity for `cuts[].at` and `cuts[].track`

> **Closing note (2026-09-01).** The ffmpeg composite path this document covered was retired in #130d. The implementation text stays as a reference record.

- Date: 2026-08-18
- Status: **draft** (fix it at the same time as the implementation)
- Depends on:
  - `contract-2026-07-22-render-basics.md` (the rule that `cuts[].freeze` and a gate-aware timeline are not used together. This contract extends that rule, unchanged, onto the v1 equivalent path)
  - `contract-2026-08-12-still-image-cut-source-v0.md` (the still-image `-loop 1` recipe in `buildMultiSourceCutCommand`. Paths added here inherit that recipe unchanged)
- Scope: `packages/render-cut/src/plan.mjs` (cut command generation) and `packages/edit-lint/src/edit-lint.mjs` (warning alignment)

## 0. Background and the real damage

v0 (`source` alone) interpreted `at` (explicit placement, gaps) and `track` (stacked composite) on `cuts[]` with `buildGapAwareCutCommand` and `buildTrackStackPlan`. v1 (`sources[]`) `buildMultiSourceCutCommand` only **joined** `cuts[]` in array order and never looked at `at` or `track`. UI drags write `at` and `track` into a v1 project as a normal action, so preview (the kernel maps `at` and `track` correctly) and export disagreed. That WYSIWYG break showed up on a real machine (2026-08-18). A cut with `track` >= 1 was not composited. It was joined into the output duration as-is, and the baked mp4 grew in duration while that cut never appeared on screen.

## 1. Ruling. Which dispatch to fix

Two v1 paths can actually honor `at` and `track`. **Only one of them showed the symptom.**

1. **Default order (`usesDefaultTrackOrder` is true).** `buildPlan` calls `buildMultiSourceCutCommand` directly on `edit.cuts`. The typical write from the UI, which does not declare `timeline.tracks`, is this path. **This path was broken.** It was a plain join that never looked at `at` or `track`.
2. **Custom order (`timeline.tracks` explicitly declares an order different from the default).** `buildTrackStackPlan` filters `cuts[]` per `track`, calls `buildMultiSourceCutCommand` on the filtered array (still a plain sequential join), then `resolveCutTrackRanges` (`track-compose.mjs`) tracks where each cut's content sits inside that plain sequential clip by the cumulative sum of `offsets`, and places it at `at` with `overlay=...enable=...` in `buildCutTrackCompositeCommand`. **That design included the correction and worked from the start** (confirmed by a real render test in `track-compose.test.mjs`, with a pixel check).

This task therefore **fixes only the dispatch in (1)**. Do not change `buildMultiSourceCutCommand` itself, `buildTrackStackPlan`, or `resolveCutTrackRanges`. The correction in (2) depends on `buildMultiSourceCutCommand` always returning a plain sequential join. Adding a branch inside the (1) dispatch breaks (2), because a filtered array with `track` >= 1 always makes `needsGapAwareCutTimeline` true, and that collides with the plain branch.

## 2. Implementation

### 2.1 New function `buildGapAwareMultiSourceCutCommand` (`plan.mjs`)

The v1 form of v0's `buildGapAwareCutCommand`. Only the v1 branch of `buildPlan` calls it. Per-track calls from `buildTrackStackPlan` stay on the existing `buildMultiSourceCutCommand`.

```
cut = needsGapAwareCutTimeline(edit.cuts)
  ? buildGapAwareMultiSourceCutCommand(...)  // an at gap or track>=1 is declared
  : buildMultiSourceCutCommand(...)          // the existing plain join, unchanged
```

- **How a gap is filled.** Same as v0. Black for the duration with `color=c=black:...`. `look` (LUT) is ignored. The black is plain. Same behavior as v0 `buildGapAwareCutCommand`.
- **Stacked-composite semantics.** The winner-take-all switch in `computeVideoRuns` (`cut-timeline.mjs`). At a given instant, the cut with the highest `track` number **occupies the whole frame**. It is not a simultaneous alpha composite. This is exactly the model v0 uses for the default order. It is not a new rich composite model. A still on an upper track, even with an identity `transform`, cannot prove full-frame opacity from natural size and alpha when it crosses a lower track in time (cross-track). On projection, move it aside into `layers`.
- **Audio is per cut, not per run.** Each cut's `[in,out)` plays at that cut's `at`, and `amix` stacks them. Even when the picture shows only one side, both audio streams play. This follows the audio loop of v0 `buildGapAwareCutCommand`.
- **Not used together with `cuts[].freeze`.** Same reason as v0. The output-second to source-second map in `computeVideoRuns` is a linear form that assumes speed only, and it cannot express the nonlinear held span of a freeze. If `hasCutFreeze(cuts)`, throw and stop. Do not drop it silently.
- **Still-image `-loop 1`, `transform` (scale, x, y, rotate), `fx`, and LUT.** Reuse the existing `appendCutVisualTransform`, `appendCutFxChain`, and `isImageLayerSource` as they are.

### 2.2 Reordering `predictedDuration`

v1 used to hit the `version === 1` branch first and never reached the `needsGapAwareCutTimeline` test. It always returned the plain sum from `sequentialDurationWithTransitionOverlap`, which ignores an at gap and PiP. Move the gap-aware test ahead of the version branch. For both v0 and v1, use the maximum segment end (the max of `end` from `resolveCutSegments`). `verify.duration` then matches the new, correct render duration.

### 2.3 Remove the `cut_track_declaration_unrendered` flag

`buildPlan` returned a hint flag that "a v1 track or at declaration is not taking effect" (`verifyArtifact` attached the note when `verify.duration` failed). The root cause is gone, so remove the flag. Do not leave the old note. It misleads.

## 3. Remove the edit-lint warnings

`cuts.track-render-unsupported` and `cuts.at-render-unsupported` (`validateCutTrackRenderSupport` in `packages/edit-lint/src/edit-lint.mjs`) existed only to warn that a v1 export ignores track and at. The implementation in 2.1 removes the root cause, so the checks are removed with it. `cuts.track-transition-unsupported` (no `transition_out` support on a custom `timeline.tracks` order) is out of scope. The path in §1 (2) is unchanged, so the existing check stays in force.

## 4. Known limits (the same as v0, none added)

- `cuts[].freeze` cannot be used together with an at or track gap-aware timeline (§2.1). There is no advance warning in lint. v0 also only throws at render time, and never had a lint check. Keep that posture.
- Stacked composite is a winner-take-all switch, not a simultaneous alpha overlay (§2.1). A custom `timeline.tracks` order (§1 (2)) gets a real stack through `buildTrackStackPlan` (`overlay=...enable=...`). The split in use is the same as v0.

## 5. Verification

- L0. `npm test` for `packages/render-cut` and `packages/edit-lint` is a full pass.
- Real ffmpeg (`packages/render-cut/test/v1-track-parity.test.mjs`):
  - (a) For a v1 project with an at gap, the output duration and the time each cut appears match the declaration, within ±1 frame.
  - (b) A PiP at `track:1` is actually composited on screen. Pixels in the PiP region differ from the lower track.
  - (c) An existing v1 project (no at, joined) does not regress. The filter graph matches the previous graph byte for byte.
  Also confirm, on a fixture that matches the owner's real project (v1, all stills, an at gap, audio clips), that the export duration and timing match the timeline declaration.
