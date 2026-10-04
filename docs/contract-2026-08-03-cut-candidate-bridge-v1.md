**English** | [Japanese](./contract-2026-08-03-cut-candidate-bridge-v1.ja.md)

# Cut candidate bridge v1

Updated: 2026-08-03
status: implemented / review-only

## 1. Ownership and stop point

The cut candidate bridge is a helper path. After semantic keep/drop approval at `edit-plan` Checkpoint 1, it builds review candidates for silence shortening and for filler or trouble. It is not a new top-level command or skill.

The output is a derived report. It does not change `edit.json`, the decision log, or approval state. Every candidate fixes `decision:"REVIEW_REQUIRED"`. The report fixes `approved_to_apply:false` and `edit_json_modified:false`. Do not apply candidates before the explicit approval at Checkpoint 3.

## 2. Input

The only public invocation is the following.

```sh
node <resolved-edit-plan-skill>/bin/propose-cut-candidates.mjs \
  --project <project-root> \
  --keep-plan .akari/work/semantic-keep-plan.json \
  --decision-log edit-plan/decision-log.md \
  --approval-ref checkpoint-1/<subject>/<yyyy-mm-dd> [--write]
```

The project has `.akari/connections.json`. The keep plan is a closed v1 object from `packages/schemas/semantic-keep-plan.schema.json`. A v0 mapping is one source and `id:null`. A v1 mapping uses a unique string id. `occurrences[]` order is semantic output order. A range is only `explicit [in,out)` in source seconds, or `full_source`. Zero occurrences is a legal empty timeline. Do not probe or analyze an unused source. The approval ref is a caller assertion. It is not proof of identity.

An active source must be a regular file contained in the project. Analysis lists the collision-safe `*.analysis/analysis.json` under the mirrored sidecar parent, and adopts a candidate only when exactly one schema-valid candidate has `analysis.source` pointing at that same source. Analysis v0 has no source hash and no analysis timestamp, so freshness stays as `UNVERIFIED_CONTRACT_LIMIT`. If the transcript is empty, or if any segment lacks words, do not run the silence detector on that source. Emit one `WORD_TIMING_UNAVAILABLE` on each occurrence.

## 3. Media and the A4 pause math

ffprobe requires a finite positive format duration for MP4, MOV, and the same family, and for Matroska and WebM, plus every stream, and exactly one audio stream. Stop if audio count is 0 or more than one, or if the format duration and the finite audio duration differ by more than 1 second. The detector pins the chosen stream with `-map 0:<index>` and uses `silencedetect=noise=-35dB:d=0.45`.

Compute a pause candidate only when the whole silence is contained in one keep occurrence and word context exists within 1 second before and after. Classify the target as 0.30, 0.166667, or 0.10 seconds, in this order: chapter event, punctuation at the end of a real segment, then default. Leave the target in the center, then snap to a 30 fps cell with the following.

```text
start_frame = ceil((silence.start + target/2 - 1e-9) * 30)
end_frame   = floor((silence.end - target/2 + 1e-9) * 30)
```

Round the displayed seconds and the actual retained duration to 6 digits. For example, `[10,10.8)` with target `0.1` is frames `302..322`, display `10.066667..10.733333`, and actual retained `0.133334`. Use a closed skip code when a word overlaps the ±0.033333 second guard, when the span crosses an occurrence, when there is no frame cell, when the effective shorten is zero, or when the result does not reach the target.

## 4. Candidate families

- `semantic_event_review` presents, per occurrence, the non-empty intersection of analysis filler or trouble with that occurrence. A partial projection has `PARTIAL_EVENT_OCCURRENCE`. Do not auto-merge it and do not drop it.
- `pause_shortening_review` presents only silence that passed containment, word context, classification, frame math, and the speech guard.

Both families always have `UI_WAIT_UNRESOLVED` and `screen_review_required:true`. A context keyframe is evidence. Do not use it to guess how an operation-wait resolves. A missing keyframe is `SCREEN_CONTEXT_MISSING`. A semantic candidate has `INFORMATION_RETENTION_REVIEW`.

## 5. Report, identity, and safety boundary

The report schema is `packages/schemas/cut-candidates.schema.json`. Canonical JSON uses recursive code-point key order, compact UTF-8, and one LF. Stdout bytes are identical with or without `--write`. The only save path is `.akari/reports/cut-candidates/<report-bytes-sha256>.json`. Reject an ancestor symlink. Reuse a file only when the bytes are identical.

Record in the report the bytes and SHA of the input, the policy, the running module, the standalone schema validator and vendor runtime, and the ffmpeg, ffprobe, and Node binaries. Check them again immediately before serialize. The child env is only `LC_ALL=C`, `LANG=C`, and `AV_LOG_FORCE_NOCOLOR=1`. A dynamic library closure and a malicious swap-and-restore are not proved, so always leave `DYNAMIC_LIBRARY_CLOSURE_UNVERIFIED` and `CONCURRENT_RETARGET_NOT_PROVEN`.

What a schema check proves, together with a semantic check of the report alone, stops at self-consistency of the receipt, the totals, and the candidates inside that report. Full binding to the original input happens at generation time. Compare the opened keep plan, source, analysis, detector silence, keyframe, and pure candidate-generation result, then recheck the input hash. To re-verify the same binding later, do not guess from the report alone. Gather the original input bytes the receipt points at and run the helper again.

On failure, stdout is empty. stderr is only one canonical `akari-cut-candidate-error-v1` line with a fixed message. Assign exit 2, 3, 4, 5, and 6 to the contract, integrity, probe, detector, and report or write boundaries. Do not reflect raw stderr, source speech, or an absolute path into the error.

## 6. Human check after apply

Approving a candidate apply at Checkpoint 3 must not auto-approve that the cut is finished. After building the preview or render that includes the candidates, a person checks the following five items against that same version and records the result in the append-only decision log. If any item fails, do not treat the cut as finished. Check every item again on the corrected version.

- `POST_CUT_ASR_REVIEW`. Transcribe the audio after the cut again. Compare it with the original sound for missing words, clipped word starts or ends, and wrong joins.
- `POST_CUT_INFORMATION_RETENTION`. Check that surrounding context, the treatment of filler or trouble, and the information the meaning needs were kept.
- `POST_CUT_UI_TIMING_REVIEW`. Check that clicks, screen changes, load waits, and result displays are not too early or too late relative to the explanatory audio.
- `POST_CUT_AUDIO_BOUNDARY_REVIEW`. Listen to each cut boundary. Check for clicks, pops, missing silence, and unnatural breaks in breath or reverb.
- `HUMAN_APPLY_GATE`. A person explicitly approves the evidence for the four items above. The helper, ASR, a validator, and a past approval do not stand in for this gate.

## 7. Distribution and verification

`scripts/gen-cut-candidate-validators.mjs` generates the Ajv standalone validators for the 3 schemas, and the runtime and license files those validators actually reference. `--check` inspects bare import 0, the relative closure, the license, and a detached startup that leaves out the repo `node_modules`. The edit-plan skill in a checkout, an npm package, a project scaffold, and a copied plugin must carry the same helper, schema, and runtime bytes.
