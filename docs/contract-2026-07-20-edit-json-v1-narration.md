**English** | [日本語](./contract-2026-07-20-edit-json-v1-narration.ja.md)

# edit.json v1 narration audio contract

- Date: 2026-07-20
- Status: source of truth for the implementation round. Only the `audio.narration` field is fixed.
- Depends on: `contract-2026-07-14-edit-json-v1-audio.md` (the fixed contract for `audio.bgm` and `audio.sfx`. This contract adds `audio.narration` in the same style) and `contract-2026-07-17-data-contract-versioning.md` (version required, additive evolution, and an explicit migration).
- Scope: only the `audio.narration` field of edit.json. The existing contracts for `audio.bgm` and `audio.sfx` do not change. Switching the ducking sidechain input is a separate task. This document only writes the rule down.

## 0. How version is used

Backward compatible. Follow section 0 of `contract-2026-07-14-edit-json-v1-audio.md`. **Do not bump `version`.**

- `audio.narration` is an optional field under the `audio` object. When it is absent, behavior matches the previous behavior exactly. There is no narration.
- The existing `audio` contract and implementation (`bgm` and `sfx`) are not modified. Adding `audio.narration` does not affect an existing `edit.json` that has no `narration` field.
- This is an optional field only, which is principle 1 of `contract-2026-07-17-data-contract-versioning.md` (a version is required, and evolution is additive). No `version` bump is required.

## 1. Fixed schema

```jsonc
{
  "version": 0,
  "output": { "width": 1280, "height": 720, "fps": 30 },
  "source": { "path": "sample.mp4", "proxy": null },
  "cuts": [ { "in": 5.0, "out": 10.0 } ],
  "overlays": [ /* unchanged */ ],

  "audio": {
    "bgm": { "path": "assets/bgm.m4a", "gain_db": -18, "ducking": true },
    "sfx": [ /* unchanged */ ],

    "narration": [                       // optional. An array of per-scene events. The same idea as sfx
      {
        "id": "n-0001",                  // required. ^n-\d{4}$. Unique inside edit.json
        "path": "out/narration/n-0001.mp3",  // required. Relative to edit.json
        "t": 12.5,                       // required. Timeline seconds. At least 0
        "in": 5.8,                       // optional. Footage seconds. 0 when omitted
        "out": 9.7,                      // optional. Footage seconds. The end of the footage when omitted
        "gain_db": 0,                    // optional. Default 0. [-60, 12], the same as bgm and sfx. Out of range is an error
        "script": "Hello, this is AKARI Video.",   // optional. Display script. The text a person reads
        "reading": "hello this is akari video",    // optional. Pronunciation script. The text actually sent to generation
        "provenance": {                  // required
          "provider": "voicevox",        // required. Examples: voicevox, fal, elevenlabs, human. Not a forced enum
          "engine": "voicevox-0.25.2",   // optional
          "voice": "speaker:3",          // optional. Examples: speaker:3, profile:owner-ja
          "credit": "VOICEVOX:Zundamon", // required when provider is voicevox (attribution). Optional otherwise
          "generated_at": "2026-07-20T09:00:00+09:00"  // optional. For human, the recording date and similar
        }
      }
    ]
  }
}
```

### Fields

| Field | Type | Required | Default | Unit and coordinates |
|---|---|---|---|---|
| `audio.narration` | array, or omitted | No | Omitted means no narration | none |
| `audio.narration[].id` | string | Required inside an element | none | `^n-\d{4}$`. Unique inside edit.json |
| `audio.narration[].path` | string | Required inside an element | none | Relative to edit.json. The same rule as `audio.sfx[].path` |
| `audio.narration[].t` | number | Required inside an element | none | Timeline seconds. The same coordinate system as `audio.sfx[].t` and `overlays[].start`. At least 0 |
| `audio.narration[].in` | number | No | `0` | Footage seconds. Start of the playback window `[in, out)`. At least 0 |
| `audio.narration[].out` | number | No | End of the footage | Footage seconds. End of the playback window `[in, out)`. Greater than 0, and `out > in` |
| `audio.narration[].gain_db` | number | No | `0.0` | dB. Clamped to `[-60, 12]`, the same as `audio.bgm` and `audio.sfx` |
| `audio.narration[].script` | string | No | none | Display script. The text a person reads. The source text for caption linking and similar uses |
| `audio.narration[].reading` | string | No | none | Pronunciation script. The text actually sent to TTS after reading conversion |
| `audio.narration[].provenance` | object | Required | none | Metadata about where it was generated |
| `audio.narration[].provenance.provider` | string | Required | none | Examples: `voicevox`, `fal`, `elevenlabs`, `human`. Not a forced enum |
| `audio.narration[].provenance.engine` | string | No | none | Example: `voicevox-0.25.2` |
| `audio.narration[].provenance.voice` | string | No | none | Examples: `speaker:3`, `profile:owner-ja` |
| `audio.narration[].provenance.credit` | string | Required when `provider === "voicevox"` | none | Required attribution. Example: `VOICEVOX:Zundamon` |
| `audio.narration[].provenance.generated_at` | string | No | none | ISO 8601. For `human`, the recording date and similar |

Like `audio.sfx`, `narration` is an array. More than one per-scene event is allowed. That contrasts with `audio.bgm`, which is one object. Narration inherits the design intent in section 6 of `contract-2026-07-14-edit-json-v1-audio.md`, "BGM is the whole piece, sound effects are per scene". Narration is also a per-scene treatment that carries one point, `t`. The "one track for the whole project" constraint that BGM has does not apply.

### 1.1 Trim of narration footage

`in` and `out` use the same footage-second vocabulary as `audio.sfx[]`. Playback is `[in, out)`. The timeline start stays `t`. When `in` is omitted, it is 0. When `out` is omitted, playback runs to the end of the footage. edit-lint reports `out <= in` as an error. render-cut resolves agreement with the real duration. If `in` is at or past the real footage duration, clamp it to 0 and warn. If `out` is past the real footage duration, clamp it to the end of the footage and warn. If `out <= in` after the clamp, skip that narration element only and warn.

## 2. Path resolution

`audio.narration[].path` uses the same rule as `audio.bgm.path` and `audio.sfx[].path`. A path is relative to the directory that contains edit.json. An absolute path is also allowed. Do not add a resolver that exists only for audio. Follow section 2 of `contract-2026-07-14-edit-json-v1-audio.md`.

## 3. Which track leads ducking

The contract of 2026-09-02 retired the sidechain method and moved to a deterministic envelope whose key is the union of the declared narration ranges and the declared speech ranges. The default key is both. The target is bgm and sfx with `ducking: true`.

Section 4 of `contract-2026-07-14-edit-json-v1-audio.md` defined the sidechain input (the trigger) for `audio.bgm.ducking: true` as dialogue audio, the audio track that came from the source itself. Now that narration is first-class data, the lead and the fallback for that input are fixed as follows.

1. When `audio.narration` has one or more elements, the export sidechain input is the narration track, one track that mixes every narration event. That track is authoritative. Narration is the voice the piece wants heard. As the signal that says what should push BGM down, it is more direct, and the intent is clearer, than the raw dialogue in the footage.
2. When `audio.narration` is omitted, dialogue audio from the source stays the trigger, as in section 4 of `contract-2026-07-14-edit-json-v1-audio.md`. That is the fallback. An existing `edit.json` with no narration does not change its export behavior at all.

In either case the implementation method in section 4 does not change. `sidechaincompress`, `main` is BGM, `sidechain` is the trigger, and the initial parameters are `threshold` about -24 dB, `ratio=8`, `attack=5 ms`, and `release=300 ms`. The only change is the rule that chooses which track is fed to the `sidechain` input.

The implementation is a separate task. This contract only writes the rule down. See the scope note in section 0.

## 4. Degradation when a file is missing or a value is invalid

Apply section 5 of `contract-2026-07-14-edit-json-v1-audio.md` to narration as well. Audio is decoration. It must not decide whether the picture itself exports.

| Situation | Behavior |
|---|---|
| No `audio.narration` field | As before. No narration. Not an error. |
| The file resolved from `audio.narration[].path` does not exist | Ignore that narration element only. Log a warning and name it in the result report. Other narration, BGM, sound effects, and the picture are unaffected. |
| `audio.narration[].path` is broken (decode fails) | Same as above. Ignore that element only, and continue. |
| `gain_db` is finite but outside `[-60, 12]` | Clamp and warn, the same as `audio.bgm` and `audio.sfx`. Follow the section 5 choice to clamp rather than reject. |
| `gain_db` is not finite (NaN or Infinity) | Ignore that element and warn. |
| `t` is not finite, is negative, or is at or past the timeline length | Ignore that narration element. There is no time left to play it. |

Every degradation drops only that narration element. Do not fail the export of the picture, the overlays, or the other audio elements. That policy is shared with BGM and sound effects.

## 5. Why both script and reading are stored

`script` (the display script) and `reading` (the pronunciation script) are separate fields on purpose. The reading preprocess is not reversible. Converting a display script into a pronunciation script (reading kanji as kana, reading numbers and symbols out, inserting pause marks, adding pronunciation-control tags that belong to one TTS engine) usually passes through a person or through a non-deterministic rule. `script` cannot be computed back from `reading`, and saving only `script` cannot rebuild `reading`, the string actually sent to TTS. Both are needed to generate again (synthesize the same audio, or swap in another engine) and for a person to review (the display script is the readable source of truth, and the pronunciation script is the record of what generation actually used). Persist both as independent fields.

## 6. The limit of overlap detection

`audio.narration[].t` is only one time, the start. The playback duration of the actual audio file is not in the edit.json data. Detecting overlap from real durations, whether another narration plays on top of one that is already playing, is out of scope and is a later problem.

What the validation layer (validate-edit and edit-lint) detects in this contract is only a weak approximation, an exact match on the same `t`. Warn when two or more narration elements have a `t` that matches to the digit. That catches an obvious input mistake, two narration tracks starting at the same instant. It does not judge overlap from the real duration. For example, it does not ask whether a 3 second clip at `t=10.0` overlaps a clip at `t=11.0`. When overlap detection that uses the real duration is needed, design it as another contract that has to measure the narration file (ffprobe or similar).

## 7. Preview and export

Apply the sandwich in section 3 of `contract-2026-07-14-edit-json-v1-audio.md` to narration. Preview is the approximation. Export holds the exact result. Inserting narration, applying gain, and choosing the ducking trigger (section 3) are expected to follow the same implementation pattern as BGM and sound effects. Preview inserts into a composition track at `t`. Export mixes with `adelay` and a `volume` filter. The implementation itself is a separate task. This contract only writes down the data shape and the behavior.

## 8. Verification

- `packages/schemas/edit.schema.json` defines the `audio.narration` structure as JSON Schema (types, the `id` pattern, required fields, and the `gain_db` range). The `audio` field itself is undefined in the current schema, including `bgm` and `sfx`, so define only the minimum narration needs. Do not add types for `bgm` and `sfx`. The detail of that decision is in this task's `report.md`.
- `packages/schemas/bin/validate-edit.mjs` checks, when `audio.narration` is present, that it is an array, that each element's `id` has the right form and is unique, that `path` is a non-empty string, that `t` is in range, that `gain_db` is in range, that `provenance` is required, that `provider` is required, and that `credit` is required when `provider === "voicevox"`. It does not check that `path` exists on disk. validate-edit still does not look at the file system.
- `packages/edit-lint` (`src/edit-lint.mjs`) does the same structural checks as validate-edit (those are errors) and also checks that `path` exists on disk (a missing file is a warning, matching the degradation rule in section 4), warns when `t` is past the timeline duration (the sum of `cuts`), and warns when more than one narration has the exact same `t`.

## 9. Next stage

Out of scope for this contract.

- Implement the switch of the ducking sidechain input onto the narration track, in both preview and export.
- Overlap detection that uses the real narration duration (section 6).
- Forcing `audio.narration[].provenance.provider` to an enum. Today the list is only examples in the document.

## Addendum, 2026-09-22. `caption_ref`

A narration element may add an optional `caption_ref`, the caption id it was generated from. The form is `c-` plus four digits. Captions live in another file, so the reference is not checked for existence. The change is additive only. edit.json `version` does not change.
