**English** | [Japanese](./contract-2026-09-02-audio-insert-level-v1.ja.md)

# Insert-time level for audio footage v1

- Date: 2026-09-02
- Status: implemented (S1)
- Depends on: `contract-2026-07-14-edit-json-v1-audio.md`, `contract-2026-07-20-edit-json-v1-narration.md`, and `contract-2026-08-28-v2-audio-roles-v0.md`
- Scope: a deterministic level measurement of one audio footage file, the per-role insert value, and `akari media audio-level` dry-run plus an explicit save into edit.json

## 1. Rules

Auto level is not a process that follows playback. It measures when the footage is inserted, derives the same `gain_db` and default fades from the same input, and leaves those numbers in edit.json. Later Preview and Export consume the declared values. Existing loudness numbers in the footage catalog are not used. External footage is measured the same way, from the file itself.

## 2. Measurement

The meter metric is `akari-audio-measure-v1`. It returns:

| Field | Unit | Definition |
|---|---:|---|
| `integrated_lufs` | LUFS | I from the EBU R128 Summary. `null` at or below -70.0 LUFS, or when analysis fails |
| `loudness_range_lu` | LU | LRA from the EBU R128 Summary. May be `null` when I is invalid |
| `true_peak_dbtp` | dBTP | Peak from the EBU R128 Summary. Silent `-inf` is `null` |
| `sample_peak_dbfs` | dBFS | Peak level from astats Overall. Silent `-inf` is `null` |
| `rms_dbfs` | dBFS | RMS level from astats Overall. Silent `-inf` is `null` |
| `duration_sec` | seconds | ffprobe format duration |
| `sample_rate` | Hz | The first audio stream from ffprobe |
| `channels` | count | The first audio stream from ffprobe |

ffmpeg runs one pass per audio file, with these arguments.

```text
-vn -sn -dn -af ebur128=peak=true:framelog=verbose,astats=measure_perchannel=none:measure_overall=Peak_level+RMS_level -f null -
```

Duration, sample rate, and channels come from ffprobe and are deterministic. The parser reads the last ebur128 `Summary:` and the astats `Overall`. Video, Captions, and data streams are not measured.

### 2.1 Cache

The key is `sha1(realpath|size|mtimeMs|metric)`, joining the footage realpath, byte size, `mtimeMs`, and metric with `|`. The file is `<cacheDir>/<key>.json`. For `akari media audio-level`, cacheDir is `<projectRoot>/.akari/cache/audio-measure/`. The standalone `akari-audio-measure` CLI walks up from the footage parent and uses the first directory that contains `.akari` as projectRoot. Only when none is found does it treat the footage parent as projectRoot. `--no-cache` or `useCache: false` always measures again and overwrites the JSON for the same key.

## 3. Targets by role

| role | integrated target (LUFS) | fade in (s) | fade out (s) |
|---|---:|---:|---:|
| narration | -16 | 0 | 0 |
| sfx | -18 | 0 | 0 |
| jingle | -18 | 0 | 0.3 |
| music | -20 | 0.2 | 1.0 |
| ambience | -26 | 0.5 | 0.5 |
| bgm | -26 | 0 | 0 |

The true-peak ceiling is -1.0 dBTP. The short-file boundary is 1.0 seconds. The short-file sample-peak target is -3.0 dBFS. An unknown role uses the sfx target and the sfx fades.

## 4. Insert-value formula

`computeInsertLevel` decides the value once, in this order.

1. With no measurement, return `basis: none`, `gain_db: 0`, and the role's default fades.
2. When `duration_sec < 1.0` or `integrated_lufs == null`, use `basis: peak` and `gain = -3.0 - sample_peak_dbfs`. If sample peak is also missing, use step 1.
3. Otherwise use `basis: lufs` and `gain = role target - integrated_lufs`.
4. When a true peak exists, `gain = min(gain, ceilingDbtp - true_peak_dbtp)`. Set `peak_guard_applied: true` only when this step actually lowers the gain.
5. Clamp gain to `[-60, 12]`, then round to 0.1 dB with `Math.round(x * 10) / 10`. Normalize `-0` to `0`.

`detail` keeps the chosen target, the measurement, whether the peak guard applied, and whether the clamp applied.

## 5. Role decision

An explicit v2 `role` of narration, bgm, jingle, music, or ambience wins and is used as written. Anything else (sfx, unknown, or unset) prefers a legacy bgm or narration collection, then falls through to the SFX heuristic. The path is lowercased. A path containing `jingle` or `sting` is jingle. A path containing `ambien`, `room`, or `env` is ambience. A measured duration of 20 seconds or more is music. Everything else is sfx.

## 6. CLI

```text
akari media audio-level <projectDir> [--write] [--targets '<json>'] [--ceiling <dBTP>] [--json] [--no-cache]
```

The command reads v2 audio-lane items and legacy `audio.bgm`, `audio.sfx[]`, and `audio.narration[]`. Only items with no `gain_db` are targets. Footage paths are relative to the edit.json parent directory. Dry-run stdout is a header and one row per clip, with path, role, basis, I, TP, `gain_db`, `fade_in`, and `fade_out`. `--json` returns only one JSON array of the same result. Missing footage, or a measurement that cannot be made, skips that item with one warning line on stderr. Zero targets is exit 0.

`--write` writes only `gain_db` and unset `fade_in` and `fade_out`. v2 uses a Project API item patch. Legacy uses the existing edit-store write API. After the save, edit-lint runs. If any finding has severity `error`, the full saved edit.json is restored. A rerun after success has zero targets, so the write is idempotent.

A legacy shape (version 0 or 1) is an error from current edit-lint as an old format, so `--write` always rolls back. Dry-run and `--json` still work. To write, run `akari migrate` to v2 first.

## 7. Next

Settings (`audio.level_targets` and app settings) and the shell insert hook are S2, or another ticket. This contract does not add a schema, a settings screen, runtime follow, or shell UI.
