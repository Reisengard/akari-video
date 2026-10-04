**English** | [日本語](./contract-2026-07-14-edit-json-v1-audio.ja.md)

# edit.json v1 audio schema contract

- Date: 2026-07-14
- Status: source of truth for the implementation round. Only the `audio` field is fixed. Crop and the other fields are not fixed and are out of scope.
- Depends on: `contract-2026-07-13-m1-m4.md` (the fixed edit.json v0 contract) and section 5 of `notes-2026-07-13-edit-json-v1.md` (Japanese). This contract promotes that section.
- Scope: only the `audio` field of edit.json (BGM and sound effects). Crop in section 2 of `notes-2026-07-13-edit-json-v1.md` is the next stage. Another contract covers it. This document only mentions it.

## 0. How version is used

Backward compatible. **`version` stays `0`.** Do not bump it.

- `audio` is an optional top-level field. When it is absent, behavior matches v0 exactly. There is no BGM and no sound effects. The only audio is dialogue from the source.
- "v1" in this document and in the notes is a nickname for the feature wave. It is a different axis from the `version` integer on edit.json. An integer bump is reserved for a structural breaking change, for example a future crop that changes the meaning of `cuts`.
- The existing `validate_edit` check that rejects `version != 0` does not need to change. That function lives in `src-tauri/src/export/mod.rs` in the legacy Tauri shell. In this monorepo, read that path as a pointer to where the matching check is reimplemented. Adding `audio` as an optional value is enough. A v0 file with no `audio` still reads and writes as before.

## 1. Fixed schema

```jsonc
{
  "version": 0,
  "output": { "width": 1280, "height": 720, "fps": 30 },
  "source": { "path": "sample.mp4", "proxy": null },
  "cuts": [ { "in": 5.0, "out": 10.0 }, { "in": 30.0, "out": 35.0 } ],
  "overlays": [ /* unchanged from v0 */ ],

  "audio": {                                 // optional. Omitted = same as v0 (no added audio)
    "bgm": {                                 // optional. An object, not an array. One track for the whole piece
      "path": "assets/bgm.m4a",              // relative to edit.json, or absolute
      "gain_db": -18,                        // default 0.0 (unity gain). Range [-60, 12]
      "ducking": true                        // default false
    },
    "sfx": [                                 // optional. An array. One entry per scene moment, and more than one is allowed
      { "path": "assets/pop.m4a", "t": 12.3, "gain_db": -6 }
    ]
  }
}
```

### Fields

| Field | Type | Required | Default | Unit and coordinates |
|---|---|---|---|---|
| `audio` | object, or omitted | No | Omitted means no added audio | none |
| `audio.bgm` | object, or omitted | No | Omitted means no BGM | none |
| `audio.bgm.path` | string | Required when `bgm` is present | none | Relative to edit.json. Resolved by `edit::resolve` |
| `audio.bgm.gain_db` | number | No | `0.0` | dB. Clamped to `[-60, 12]` (section 4) |
| `audio.bgm.ducking` | bool | No | `false` | none |
| `audio.sfx` | array | No | `[]` | An array of per-scene events |
| `audio.sfx[].path` | string | Required inside an element | none | Relative to edit.json |
| `audio.sfx[].t` | number | Required inside an element | none | Timeline seconds, after cuts are joined. The same coordinate system as `overlays[].start`. Not source seconds |
| `audio.sfx[].gain_db` | number | No | `0.0` | dB. Clamped to `[-60, 12]` |

`bgm` is an object (one) and `sfx` is an array on purpose. See section 6.

## 2. Path resolution

`audio.bgm.path` and `audio.sfx[].path` use the same rule as `source.path` and `overlays[].html`. A path is relative to the directory that contains edit.json. An absolute path is also allowed. Reuse `edit::resolve(base, rel)` from `src-tauri/src/video_plane/edit.rs` in the legacy Tauri shell. In this monorepo, follow that design and reuse the matching resolve function. Do not add a resolver that exists only for audio.

## 3. Who does what

Preview is AVFoundation. Export is ffmpeg.

This is the same invariant as the sandwich in `design-2026-07-13-agent-native-architecture.md` (Japanese). Preview is the approximation. Export holds the exact result. The time system in the M1 through M4 contract works the same way.

| Item | Preview (M1, `video_plane/macos.rs`) | Export (M4, `export/ffmpeg.rs`) |
|---|---|---|
| Insert BGM | Create a new `AVMutableCompositionTrack` (audio). Repeat `insertTimeRange` until the timeline length, looping. Clamp the tail to the timeline length. | Read BGM as a new input. Loop it with `aloop` or `-stream_loop -1`, then mix. See below. |
| Insert sound effects | Create one composition audio track per element. `insertTimeRange` at `t`. | Delay by `t` seconds with `adelay=<t*1000>`, then mix. |
| Apply gain | `AVMutableAudioMix` and `AVMutableAudioMixInputParameters.setVolume`. Convert `gain_db` to linear `10^(gain_db/20)`. | A `volume=<linear>` filter. The same conversion. |
| Ducking | A static approximation. When `ducking` is true, add a fixed extra attenuation to the BGM track (for example -12 dB). Do not follow loudness over time. | Dynamic and exact. `sidechaincompress` (section 4) lowers BGM in real time as dialogue loudness changes. Export is authoritative. |
| Round the duration | The composition duration decides the timeline length. Existing `load_edit` stays. | The final encode always clamps to the timeline length with `-t <duration>` (`append_encode_args`). BGM or sound effects that run past that length are cut automatically. No extra trim step is required. |

Accept the static ducking approximation in preview as a known v1 limit. The same judgment lets preview be off by tens of milliseconds on a seek in the M1 through M4 contract. When you need to judge how ducking actually sounds, judge the export.

## 4. What ducking means in v1

Updated 2026-09-02. The `sidechaincompress` method is retired. Preview and export now share one deterministic envelope, with attack and release, keyed to the declared narration and speech ranges. The rest of this section stays as the original v1 design record.

The original choice was `sidechaincompress`, on export only, an ffmpeg built-in filter. A simple gain based on caption or speech ranges was rejected.

### Why that choice was made

1. It does not depend on analysis.json. Gain control from speech ranges needs the `transcript` in `analysis.json` (`schemas/analysis.schema.json`), or a separate voice-activity detector. The M5 contract (`contract-2026-07-13-m5-analysis-report.md`) was still "design fixed, and it becomes an implementation contract after M1 through M4 are stable". That is later than this round's order in the notes: audio, then crop, then the output profile, then layout. If the edit.json audio contract depended on analysis.json, implementation would block.
2. It runs with no new local dependency. `ffmpeg -filters` already lists `sidechaincompress` (ffmpeg 8.1.1). Dialogue audio is the source audio track that `render_cuts` has already fixed, so it can be the sidechain input. No precomputed speech ranges and no extra data structure. The loudness itself is the dynamic trigger.
3. The schema needs one bool. `ducking: true` or `false` is enough, which matches the field count in the original proposal in `notes-2026-07-13-edit-json-v1.md`. Threshold, ratio, and the other parameters live as initial values in code and are tuned in operation. See below. If those parameters later need to be data, consider an object such as `ducking: { enabled, threshold_db, ratio }` in v2. Turning a bool into an object is a breaking change, so this contract does not do it.
4. It matches the rule that the engine only composites. The footage-plan chapter of the M5 contract has a person approve whether to use BGM and sound effects. How ducking is applied is an execution detail inside the engine. It does not leak into the analysis and judgment layer.

### Implementation notes for the original export path

Initial parameters.

- Filter direction. `main` is BGM, the side that is lowered. `sidechain` is dialogue, the trigger. `[bgm][dialogue]sidechaincompress=...[bgm_ducked]`
- Initial values. Tune them in operation. As with `scoreValue` in `analysis.schema.json`, thresholds are expected to be tightened in use. `threshold` about -24 dB (linear about `0.063`), `ratio=8`, `attack=5` (ms), `release=300` (ms).
- The final mix is `amix`. Set `normalize=0` explicitly. The default `true` divides loudness by the input count, so the absolute value from `gain_db` stops meaning what it says. See common mistakes in section 7.
- Loop BGM with `aloop`, or with the input option `-stream_loop -1`, then clamp to the timeline length with a later `-t <duration>`. A crossfade at the loop boundary is out of scope for v1. That limit is known.

## 5. Degradation when a file is missing or a value is invalid

Audio elements are decoration. They must not decide whether the picture itself exports. This is the same idea as the three-way "if it is no good, do not use it" decision in the M5 contract. Drop what you cannot use, quietly, and do not stop the whole export.

| Situation | Behavior |
|---|---|
| No `audio` field | Same as v0. No BGM and no sound effects. Not an error. |
| The file resolved from `audio.bgm.path` does not exist | Ignore BGM entirely. Log a warning and name it in the result report. Export continues. |
| `audio.bgm.path` is broken (ffprobe fails) | Same as above. Ignore BGM only, and continue. |
| An `audio.sfx[].path` does not exist or is broken | Ignore that one sound effect. The other sound effects, BGM, and picture are unaffected. |
| `gain_db` is not finite (NaN or Infinity) | Ignore that element (the whole BGM, or that sound effect) and warn. |
| `gain_db` is finite but outside `[-60, 12]` | Clamp into the range and warn. The clamp is a guard against clipping or silence. It is the same "do not crash on a broken input" idea as the finite-value check on `overlays[].transform`, but here the choice is clamp, not reject. A slightly wrong loudness that still plays does less harm than silence. |
| `sfx[].t` is not finite, or is negative | Ignore that sound effect. |
| `sfx[].t` is at or past the timeline length | Ignore that sound effect. There is no time left to play it. |
| `sfx[].t` is near the end and the sound is cut off | No extra handling. The final encode's `-t <duration>` clamp cuts it. See the table in section 3. |
| `ducking` is true but `bgm` itself is omitted | No-op. Ignore it. Not an error. |
| There is no ducking field on `sfx` | As specified. A sound effect is short, so it is not ducked. Section 6 says this explicitly. |

Every degradation drops only that audio element. Do not fail the export of the picture, the overlays, or the other audio elements. Report it the same way `overlay::render` reports `warnings`.

## 6. Why the data is shaped this way

BGM is the whole piece. Sound effects are per scene.

As in the original proposal, section 5 of `notes-2026-07-13-edit-json-v1.md`, the shape of the schema says the intent.

- `audio.bgm` is one object, not an array. The schema forces one BGM per project, so a reader does not have to wonder why a BGM is there.
- `audio.sfx` is an array. Each element has `t`, one point on the timeline. The type itself says this is a sound effect tied to a moment in a scene.
- BGM has no `t`. It is always tied to the whole timeline, from 0 to duration. It keeps playing across cut boundaries. BGM is stuck to the timeline axis and is independent of the cut structure on the source side. A sound effect is the opposite. The single value `t` is the whole placement, and the role as a per-scene treatment is clear.
- This matches the footage-plan section of `contract-2026-07-13-m5-analysis-report.md`, which separates what the whole piece uses (BGM) from what a scene uses (sound effects, B-roll, and the rest). The upstream decision lands directly as the shape of the downstream schema.

## 7. Check against analysis.schema.json

`schemas/analysis.schema.json` (v0) was checked. Neither `events` (`filler`, `trouble`, `chapter`, `hook`) nor `tracks` (`speakers`, `faces`, `person_matte`) has a field about choosing BGM or sound effects. This contract does not collide with it. Do not later join `events.hook` and `audio` directly. The path from "a hook candidate in the footage" to "the decision to use this BGM or sound effect" is one way, through the editorial-judgment report in the M5 contract, and a person approves it. The `audio` field exists only as the executed form of that approval, the place the decision lands. The engine layer has no path that reads analysis.json directly. That keeps the M5 rule that the product only composites.

## 8. Common mistakes

- Passing source seconds in `sfx[].t`. That is wrong. `t` is timeline seconds, the same as `overlays[].start`, after cuts are joined. It says where the sound plays in the final output, not where it plays in the source.
- Leaving `amix` `normalize` at its default `true`. Loudness is then divided by the input count, and the absolute loudness from `gain_db` is effectively ignored. Always set `normalize=0`.
- Treating `ducking: true` with no BGM as an error. The rule is a no-op (section 5). Tolerate a generation mistake on the caller side. Do not add a useless failure.
- Making `bgm` an array. In the schema it is one object. If a use appears that switches among several BGM tracks, design that in v2. For now, keep one BGM per project.
- Rejecting an out-of-range `gain_db` as an error. A finite value outside the range is clamped (section 5 table). An error is only for a non-finite value.

## 9. Type sketch

Reference only. Not binding. The implementation round fixes the details. This is a draft of the legacy Tauri types.

The sketch assumes an addition to `src-tauri/src/video_plane/edit.rs` in the legacy Tauri shell. It is not the current implementation. Field names and the details of the default implementation may change when it is built. This contract binds the JSON schema in section 1 and the behavior in sections 3 through 6. It does not bind the Rust types.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edit {
    pub version: u32,
    #[serde(default)]
    pub output: Option<Output>,
    pub source: Source,
    #[serde(default)]
    pub cuts: Vec<Cut>,
    #[serde(default)]
    pub overlays: Vec<Overlay>,
    #[serde(default)]
    pub audio: Option<Audio>,   // added in v1. Omitted = same behavior as v0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Audio {
    #[serde(default)]
    pub bgm: Option<Bgm>,
    #[serde(default)]
    pub sfx: Vec<Sfx>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bgm {
    pub path: String,
    #[serde(default)]
    pub gain_db: f64,   // 0.0 when omitted
    #[serde(default)]
    pub ducking: bool,  // false when omitted
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sfx {
    pub path: String,
    pub t: f64,          // timeline seconds
    #[serde(default)]
    pub gain_db: f64,    // 0.0 when omitted
}
```

## 10. Next stage

Out of scope here.

Per-cut crop (reframing) in section 2 of `notes-2026-07-13-edit-json-v1.md` is not covered. The implementation order in the notes is audio, then crop, then the output profile, then layout. Crop gets its own contract in the next round, after this audio contract is fixed.
