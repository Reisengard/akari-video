**English** | [Japanese](./contract-2026-08-01-export-nle-beta.ja.md)

# Contract. export-nle: export to other NLEs (BETA, real-NLE import not confirmed)

- Implementation: `packages/export-nle/` (CLI `bin/export-nle.mjs`). Entry skill: `skills/export-nle/`.
- Standing: **beta-unverified**. The implementation and the unit tests for structure, time quantization, and mapping are done. **Import into a real Final Cut Pro, DaVinci Resolve, or Premiere Pro has not been tested.**
- Direction: **one-way export only**. Import from an NLE back into edit.json is out of scope. Do not start that work until a separate contract exists.

## 1. Target formats

| Output | Format | Expected importer |
|---|---|---|
| `<project>.fcpxml` | FCPXML 1.11 | Final Cut Pro or DaVinci Resolve |
| `<project>.premiere.xml` | FCP7 XML (xmeml v5) | Premiere Pro |
| `<project>.srt` | SRT | Any NLE, and only when captions.json exists |
| `export-report.json` | Report | `written[]`, `dropped[]`, `warnings[]` |

Do not aim at `.prproj` (a closed format) or at a CapCut draft (unofficial, and encryption work is in progress). If CapCut demand is confirmed, judge it separately as a lab spike.

## 2. Time quantization (rounding policy)

- Round every float second in edit.json to the **nearest frame boundary of the destination** before writing it.
- FCPXML converts `output.fps` to a frameDuration rational. NTSC-family 23.976, 29.97, and 59.94 become 1001/24000, 1001/30000, and 1001/60000. Integer fps becomes 1/fps. Any other fps becomes a rational at millisecond precision. Every timestamp is a reduced rational second equal to frame count times frameDuration.
- xmeml uses integer frames. NTSC-family rates use timebase 30, 24, or 60 plus `ntsc TRUE`. Frame numbers round at the true fps, such as 30000/1001.
- SRT uses millisecond precision.

## 3. Timeline semantics (aligned with render-cut)

- The canonical semantics for cut placement, speed, xfade overlap, and the (src, source-second) anchor map are `packages/render-cut/src/cut-timeline.mjs` and `captions.mjs`. export-nle carries a minimal port of the same formulas so it does not take a dependency. If render-cut changes, export-nle follows.
- An edit with no `at` and no `track` joins cuts in order and subtracts xfade overlap. That matches `computeCutTimelineOffsets`.
- An edit with `at` or `track` (gap-aware) uses absolute placement. **Do not export transition_out in that case**, because the boundary is not limited to adjacent cuts. List it in dropped.
- `start`, `end`, and `t` on captions, beats, and emphasis_words are (src, source-second) anchors, not timeline seconds. On export, map them through the cuts onto the timeline. An anchor that sits in no cut goes to dropped.

## 4. Field mapping

### What moves

| edit.json | FCPXML | xmeml | Notes |
|---|---|---|---|
| cuts[].in/out/at/track | asset-clip offset/start/duration | clipitem start/end/in/out | |
| cuts[].speed | timeMap, 2 points (unverified estimate) | timeremap at constant speed (unverified estimate) | Constant speed only |
| cuts[].transform | adjust-transform (coordinate system not verified) | Basic Motion (center not verified) | |
| cuts[].opacity | adjust-blend amount | Opacity filter | |
| transition_out dissolve | a transition with no child element (the default cross dissolve) | Cross Dissolve transitionitem | The approximation in §5 |
| transition_out fade-black/white | cross dissolve **approximation**, plus dropped | same as FCPXML | Dip to color is a manual reset |
| layers (baked/video) | connected clip on lane 2 and higher | a higher video track | An alpha mov is just a clip |
| layers[].blend | adjust-blend mode (not verified) | **dropped** (warning) | |
| audio.narration | lane -1, role dialogue | audio track | gain is adjust-volume or audiolevels |
| audio.sfx | lane -2 and lower (per track), role effects | audio track (one per sfx track) | in and out are mapped |
| audio.bgm | loop-expanded to the real duration, plus fade keyframes (unverified estimate) | same as FCPXML | If the real duration is unknown, one clip for the whole duration, plus a warning |
| beats / emphasis_words | a marker on the clip (source seconds, unchanged) | a sequence marker (mapped onto the timeline) | The semantic layer degrades to a marker |
| captions.json | not in the XML. It goes to SRT | not in the XML. It goes to SRT | `display_text` wins. Plain text |

### What does not move

List every one of these in `dropped[]`. Do not drop a field silently.

audio.bgm.ducking, audio.master (loudnorm and denoise), output.look (LUT), sources[].chroma_key, layers[].chroma_key, direction, caption style (style, text_style, words), and beats or emphasis_words anchors that fall outside the cut range.

## 5. Known approximations (explicit beta tradeoffs)

1. **xfade.** An AKARI render is an xfade across the whole overlap. The export shortens the previous cut's visible duration by the overlap, butts the cuts together, and centers the transition on the boundary. **The cut point and the sync of later material are preserved.** The frames inside the boundary are an approximation.
2. **The exchange form of speed** (FCPXML timeMap, xmeml timeremap) is an estimated implementation based on the specification and on looking at exported files. Import verification is the most important unchecked point.
3. **The keyframe form of a volume fade** (FCPXML adjust-volume param, xmeml audiolevels) still stands if the importer ignores it. The fade is dropped and the gain remains.
4. Media is referenced by a **file URL with an absolute path**. After the project moves, relink on the NLE side is assumed.

## 6. Execution contract

- The CLI is deterministic. It does not mix in an LLM decision, a random number, or the current time. It has zero external npm dependencies. ffprobe is only a direct call to the binary that media-bin resolves. `--no-probe` is fully offline. Audio then uses a placeholder duration plus a warning.
- Read only. Do not rewrite edit.json or captions.json. The only write is `--out` (default `<project>/exports/nle/`).
- Exit 0 means the export finished. Warnings are allowed. Exit 2 means an input or environment error.

## 7. Conditions for leaving beta

Remove the BETA label when this list is empty.

- [ ] Confirm fcpxml import on a real Final Cut Pro. Check cut position, audio sync, and markers.
- [ ] Confirm fcpxml import on a real DaVinci Resolve. Check the same items.
- [ ] Confirm premiere.xml import on a real Premiere Pro. Check the same items, plus timeremap and Basic Motion.
- [ ] Write the import results for speed, transform, and fades into the approximation notes in §5. Fix the implementation if that is required.
- [ ] Decide whether the import-test reproduction steps belong in the verify skill series (the L series).

Record verification results by appending to this file. Keep them as history. Do not rewrite the conclusion in place.
