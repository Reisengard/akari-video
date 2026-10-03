**English** | [日本語](./contract-2026-07-25-r6-audio-tracks-and-trim.ja.md)

# R6 contract. Timeline placement, multiple audio tracks, audio trim, and the source trimmer

- Date: 2026-07-25
- Status: draft. The decision is final. The status becomes approved as implementation proceeds. This document is the technical spec only. The reasoning and the lane operations stay in private internal records. This repo does not hold them.
- Depends on: `contract-2026-07-14-edit-json-v1-audio.md` (the audio schema source of truth) and `contract-2026-07-17-data-contract-versioning.md` (the three principles).

## 1. Decisions fixed on 2026-07-25

1. Timeline placement adopts the Premiere model.
   - Audio groups stay pinned to the bottom. They cannot be reordered.
   - The cuts band (Video) is the vertical center above that. Layers and captions, the stacked items, sit above the cuts.
   - Inside picture tracks, a higher row is still in front. The z-order decision does not change.
   - The ruler stays where it is.
   - This matches the default stack from the bottom: audio, then cuts, then layers, then captions. This decision writes that stack down as a fixed placement rule.
2. Overlapping audio becomes multiple audio tracks.
   - The UI exposes the existing `track` field on sfx, so audio can add tracks.
   - This decision ends the old practice that audio stays on ref 0, a single track, for now.
   - `timelineTrack` already allows more than one declaration with `kind: 'audio'`. No schema change is required. Audio tracks grow and shrink only inside the bottom group from decision 1.
3. The source trimmer opens when a timeline clip is double-clicked.
   - Double-click a clip. Parts outside the cut draw dimmed. Slide the left or right edge to set in and out.
   - Double-clicking a footage file still plays the raw source. That entrance is a different one.

## 2. Audio trim

Schema extension.

### Schema

- Add optional `in` and `out` on `sfxItem`. The unit is footage seconds. `in` is at least 0, and the default is 0 when it is omitted. `out` is greater than `in`, and the default is the end of the footage when it is omitted. Playback is the footage interval `[in, out)`. The timeline start stays `t`, in timeline seconds. The displayed duration is `out` minus `in`.
- Add the same optional `in` and `out` on `narrationItem`. The playback interval, the footage-second unit, the defaults, and the check that `out > in` match sfx. The timeline start is the narration `t`.
- Add optional `in` on `bgm`. It is the start offset, in footage seconds, inside the BGM file. The existing meaning of loop and of full-length trim does not change.
- edit-lint reports `out <= in` as an error. Lint does not detect a range past the real duration. Lint does not run ffprobe. The consumer clamps.
- State the meaning in `$comment`, following the vocabulary used on cuts.

### Consumers

render-cut and preview.

- render-cut applies the sfx slice `[in, out)` to the output. It applies the bgm `in` offset.
- render-cut also applies the narration slice `[in, out)` to the output. If `in` is at or past the real footage duration, clamp `in` to 0. If `out` is past the real footage duration, clamp `out` to the end of the footage and emit a warning. If `out <= in` after the clamp, skip that narration item only. Whether or not `in` and `out` are present, probe each narration item once for its real duration, as today, and use that probe to decide whether it can be decoded. If it cannot be decoded, skip that item only and emit a warning, as today. When both `in` and `out` are omitted, do not prepend `atrim`. Keep the filter string byte-identical to the previous one.
- preview (`previewAudio`) plays with the same meaning. An `in` or `out` past the real duration clamps to the end of the footage.

### UI

- Drag the end of an audio bar to trim, and write `in` and `out` back. The gesture matches a video-clip trim.
- Show multiple audio-track rows, add rows, and move items between tracks (decision 2).
- Implement the placement rule (decision 1). Pin the audio group to the bottom, center the cuts vertically, and put stacked items above. Do not move the ruler.

## 3. Source trimmer

- Entrance: double-click a clip (decision 3). While trimmer mode is on, parts outside the cut draw dimmed, and a left or right slide adjusts `in` and `out`. Leave the mode with Esc, a second double-click, or by selecting another clip.
- Bake the filmstrip of the whole footage once. Moving the window changes only the CSS `background-position`. Trim and slip do not bake again.

## 4. Acceptance

- Schema. Every schemas test and every edit-lint test is green.
- Consumers. Measure sfx output that has `in` and `out` with ffprobe and a waveform. The slice position and the duration match. Preview uses the same fixture for a listen and a measurement. Measure the clamp.
- UI, on a real device. (a) The display matches the placement rule. (b) Adding an audio track and moving an item writes back to edit.json. (c) Dragging an audio-bar end writes `in` and `out`, and the values survive reload. (d) The trimmer displays and adjusts. (e) Existing track UI and z-order do not regress.

## 5. Addendum to section 2. sfx fades

`audio-clip-fades`, 2026-08-18. Owner decision T2, "a clip is the unit".

The decision to place BGM as a clip (the matching task in the private repo `akari-video-internal`) requires that music placed as a clip in `audio.sfx[]` can fade the same way a BGM bed can. Add optional `fade_in` and `fade_out` on `sfxItem`, in seconds, each at least 0. The extension is additive. `version` does not change. Follow `contract-2026-07-17-data-contract-versioning.md`.

### Schema

- `sfxItem.fade_in` and `fade_out` are seconds. The omitted value is 0, which means no fade. Unlike `audio.bgm.fadeIn` and `fadeOut`, which are camelCase, these names are snake_case, the same series as the existing `gain_db`.
- The fade applies to this clip's effective playback window `[t, t + effective duration)`. When section 2's `[in, out)` is known, the effective duration is `out - in`. When `in` and `out` are omitted, it is the footage duration, and only when the consumer could resolve the real duration.
- The clamp matches `audio.bgm.fadeIn` and `fadeOut`. Clamp `fade_in` and `fade_out` independently, each to at most half the effective duration. render-cut implements the clamp. edit-lint can warn only when both `in` and `out` are known. Lint does not run ffprobe, so a range past the real duration stays the consumer's job. That rule from the body of section 2 applies to fades as well.

### Consumers

render-cut and the three preview surfaces.

- render-cut inserts the sfx `afade` immediately after volume and immediately before `adelay`. Placing it after `adelay` would make `st=0` point at the silence the delay inserted. When `in` and `out` are also set, compute `afade` from the effective duration after `atrim` and `asetpts` reset the duration.
- Shell preview (`akari-preview`). sfx plays once through a `BufferSourceNode`, so it does not recompute a fade multiplier on every tick the way bgm does. At schedule time it builds a breakpoint list with `gain.gain.setValueAtTime` and `linearRampToValueAtTime` (`sfxFadeGainSchedule`). When a seek resumes playback, it rebuilds the breakpoints from the elapsed seconds.
- Speech uses the same path. That means narration, or an audio-lane item with `role: 'speech'`. Added 2026-09-18. It uses the same breakpoint list. `buildWebAudioSchedule` passes `fadeGainEvents` no matter the kind. Only the window differs from sfx. sfx uses the item's effective duration as it is. Narration uses `min(track.durationSec, max(0, duration - track.t))` and cuts at the end of the timeline. That matches what `render-cut/src/plan.mjs` actually does. Using one window for both would make sfx disagree with export. The clamp rule is shared. Each fade clamps independently to half the effective duration.
- Shot audio on cuts and layers (preview kind `'speech'`) has no fade field in the declaration, and export does not apply `afade` to cut audio. Adding a fade here would disagree with export, so it is left out on purpose.
- The web UI (`preview-server`) recomputes every tick, the same way as bgm. This layer does not yet implement sfx `in` and `out` trim, so the fade's effective duration is always the full length of the decoded footage. Revisit that when trim is implemented.

### Inspector

- `akari-annotations` shows the same Fade tab as bgm (`fadeIn` and `fadeOut` knobs) when an sfx item is selected. Ducking is a bgm idea, so the tab does not show it for sfx.
- The source of truth for a text edit of edit.json is `packages/edit-store`. The file boundary of the implementation lane for this addendum (task `2026-08-18-audio-clip-fades`) does not include `packages/edit-store`, so the write-back lives in `apps/shell/extensions/akari-annotations/src/common/sfx-fade-store.ts` as an implementation that stays inside that boundary. It reuses exported edit-store helpers such as `updateArrayElementByIndex`. A later edit-store task may fold this back into the source of truth.
