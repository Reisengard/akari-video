**English** | [Japanese](./notes-2026-07-16-qa-lint-and-transcript-ui.ja.md)

# Direction note for the self-check loop and the transcript editing UI

- Date: 2026-07-16
- Status: direction note. It records a design conversation with the owner. Promote each item to a contract when implementation of that item starts.
- How this note was chosen: an outside design conversation, about a Theia fork and about transcript-driven editing in general, was reviewed against the contracts we already have. Most of it reached the same conclusions we already recorded, including the two layers of analysis.json and edit.json, a smaller MCP, and three keyframe paths. Those items are not copied here. This note records only **the items adopted as a difference** and **the items explicitly rejected**.

## 0. Rejected proposals. Do not revisit them.

| Proposal | Why it was rejected |
|---|---|
| Theia AI, a chat UI plus a tool-call framework | It collides with the harness-independent invariant. That invariant is a PTY plus a file contract, and it must work with both Claude Code and Codex. An agent layer inside Theia would lock the product to Theia. Use Theia only as the box. |
| A command pattern, where the UI and the agent call the same tool functions | The meeting point in this design is not a function. It is the **save data**. A person's edits land in edit.json, a data attribute, or a CSS variable. The agent uses a skill and a script to read, modify, and write. Interoperation is the same, and the design does not add a tool-API coupling. |

The split among tools stays the existing decision. Core edits write the save data directly. MCP is only for reads, for running work, and for outside links such as generation and stock footage search. See design-2026-07-13, section 1, and the generation-skill contract in contract-2026-07-13-m5.

## 1. edit-lint, the deterministic validator, a QA stage skill

State the feedback loop as **two floors**.

| Floor | What it is | Status |
|---|---|---|
| Semantic check | The agent looks at verification frames and checks quality | Established in the Step 1 experiment |
| Deterministic check | **edit-lint**, this section. Not built yet | New |

A tool can finish with no execution error and still produce a meaning error, such as 63 seconds when the limit is 60. A successful edit run does not prove the result meets the constraint. Check anything that can be checked deterministically in ordinary code.

### Checks to consider for v0

- `cuts` are in ascending order, do not overlap, and stay inside the source duration.
- Total duration against `outputs[].duration_max`, including the 60-second limit on a short.
- `start` and `duration` on `overlays` do not run past the timeline duration.
- Referenced files exist. That includes overlay HTML fragments, the paths for `audio.bgm` and for sound effects in `audio.sfx`, and the thumbnail.
- Captions line up with transcript words. This lands after captions are first-class, in v1.x.
- Detect silent spans and volume peaks. ffmpeg can measure both deterministically.

### Shape of the implementation

- A small CLI, under `packages/schemas` or next to it. It takes edit.json and analysis.json and returns PASS or FAIL plus the list of findings.
- Make the operating rule a QA stage skill. After the agent writes edit.json, it runs **lint, fixes the file until the result is PASS, then looks at frames, then writes the report**.
- As of this note, `skills/` has no QA skill. This would be the first implementation of the QA stage named in the stage plan in CLAUDE.md.

## 2. Add confidence on words

- Add `words[].confidence` to analysis.json v0 as an **optional field that stays compatible**. Restore it from whisper.cpp token probabilities. Leave `version` at 0.
- Reason: an ASR mishear barely affects timing, including where to cut. It does affect judgments about meaning, including retake detection, line smoothing, and emphasis choice. The field lets the machine point at the words to doubt.
- Uses:
  - The viewer highlights low confidence. That is the entrance to the caption-correction UI. It connects to section 3 of notes-2026-07-14, which corrects the text and keeps the timestamps.
  - When the agent smooths a line, the score shows which word to doubt and rebuild from the surrounding context.
- The implementation is only a revision of the analyze-footage skill. It does not require a schema change or a runtime change, because the field is optional and `version` stays 0.

## 3. The trigger for visual search by embeddings

- Treat visual search by embeddings, in the CLIP family, as **a new capability, not an optimization**. A visual feature that is not written in the keyframe caption cannot be found by grep on that caption. The limit is structural.
- **Trigger.** Build it when full-text search on keyframe captions, `keyframes[].note`, starts missing things that matter in real use. Do not build it before that.
- Until then, keep the premise that captions plus grep are enough.

## 4. The transcript editing panel, in two stages

This is the implementation plan for section 1 of notes-2026-07-14. That section is the transcript lined up with cuts, a before-edit and after-edit toggle, and accept or reject per word. **Split the MVP from the version we actually want.** Owner decision, 2026-07-16.

### MVP: Monaco decorations

- The shell is Theia, so Monaco is already bundled. No dependency is added.
- Scope: a CSS class per word. A cut word is gray strikethrough. Low confidence is an underline. The playhead follow is a highlight. A click seeks. A hover shows the timestamp. Injected text shows the speaker label. View zones show a thumbnail between paragraphs.
- Text editing is native to the editor. Caption-correction write-back takes the change event and splits it back onto words by proportion.

### The version we want: a rich dedicated UI, at the level of Vrew

- Monaco cannot leave a line-based layout. It has no native support for a different font size per range, for card-like rich typesetting, or for a read-only region. **It cannot reach Vrew's rich editing experience.** The limit is structural, so build a dedicated widget separately.
- What keeps the move off Monaco cheap: **the panel stays a thin display layer, and all state lives on the analysis.json and edit.json side.** That follows the write-back rule. If you throw the Monaco version away, the data, the skills, and the lint assets all remain.

## A likely implementation order

1. Add confidence. Only a revision of the analyze-footage skill. This is the cheapest step.
2. The edit-lint CLI and the QA skill. Establish the deterministic side of the agent's self-check loop.
3. The Monaco transcript panel. An extension of the M3 interaction layer. This is the MVP.
4. The rich dedicated UI. The version we want. Start after step 3 is in use and the requirements are firm.
5. Visual search. Wait for the trigger. The start condition is section 3.
