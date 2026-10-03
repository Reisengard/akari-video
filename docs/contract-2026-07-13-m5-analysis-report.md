**English** | [日本語](./contract-2026-07-13-m5-analysis-report.ja.md)

# M5 contract v0. Analysis pipeline, editorial-judgment report, and generation skills

- Date: 2026-07-13
- Status: design is fixed. The owner has reviewed it. It becomes an implementation contract after M1 through M4 are stable and after the internal research is folded in.
- How to use earlier work. An external earlier implementation is a source of patterns and structure only. Do not copy its code or its prose. Analysis is managed in private internal research. Rebuild numeric craft from primary sources, such as the TikTok Creator Portal.

## Shape of the pipeline

```
Footage set (a recording, or a generation brief)
   |  one subagent analyzes each footage item, in parallel (orchestration)
   v
analysis.json (one machine-readable intermediate contract per footage item)
   |  merge
   v
Editorial-judgment report (one HTML page a person reads. Successor of the frame-analytics lab)
   |  human approval (checkpoint)
   v
edit.json + overlay HTML + a fixed thumbnail (the form the engine consumes)
```

- The report is used for an edit flow and for a generation flow. Recorded footage goes through analysis, then cut decisions. A piece made from nothing goes through research, then a script, then a generation plan. The engine (`edit.json` plus overlays) does not care whether a clip was shot or generated, so the downstream path is shared.
- The implementation form is a skill under `.claude/skills/`. Do not put it in app code. The product only composites. Judgment stays on the skill side. That is the agent-native split.

## analysis.json v0 draft

One intermediate contract per footage item.

```jsonc
{
  "version": 0,
  "source": "raw/2026-07-13-recording.mp4",
  "transcript": [ { "start": 1.2, "end": 3.4, "text": "...", "speaker": "A", "words": [...] } ],
  "keyframes": [ { "t": 12.0, "path": "analysis/kf-0012.jpg", "note": "screen share starts and the document title is on screen" } ],
  "events": [
    { "type": "filler", "start": 5.0, "end": 5.8 },
    { "type": "trouble", "start": 40.0, "end": 55.0, "note": "audio dropout" },
    { "type": "chapter", "t": 60.0, "title": "Setup steps" },
    { "type": "hook", "start": 12.0, "end": 24.0, "score": { "hook": 4, "self_contained": 5, "emotion": 3, "density": 4, "punch": 3 } }
  ],
  "tracks": {
    "speakers": [ { "id": "A", "spans": [[0, 65]] } ],
    "faces": [ { "speaker": "A", "t": 12.0, "box": [0.1, 0.2, 0.3, 0.5] } ],   // for reframing
    "person_matte": null    // path, once a person cutout for text-behind-person has been generated
  }
}
```

- The five hook-candidate scores follow the published claude-shorts method: hook strength, self-containedness, emotion, value density, and punchline. Thresholds are tuned in operation.
- `tracks.faces` and `person_matte` are the shared base for reframing and for text-behind-person. The hand for person segmentation is Apple Vision Person Segmentation (local, fast) or Robust Video Matting. The output is HEVC with alpha, which WKWebView can decode in hardware.
- When to analyze. By default, run analysis in the background at ingest, at the same time as proxy generation. Adapting granularity, and recovering analysis research from the old reference implementation, are TODOs at implementation time.

## Editorial-judgment report

The form is one HTML page, the successor of the frame-analytics lab. The chapter order is fixed.

1. Thumbnail proposals. Several, with title-text variants. This chapter is first. It is tied to click-through, and it is where a person most wants to speak.
2. Analysis summary. The point of each footage item, with links to the supporting frames and to the transcript.
3. Edit direction. The direction, and the reason for it.
4. Cut decisions. Keep or drop, with the reason (an event reference).
5. Footage plan. Split what the whole piece uses (BGM) from what a scene uses (sound effects, B-roll, caption style, and special treatment). Each slot states a three-way decision.
   - If the library has it, propose it. A library search hit, with a preview image.
   - If the library does not have it, generate it. A generation proposal, with the prompt and a generated image.
   - If neither is good enough, do not use it. An explicit rejection is allowed. Do not force a fill.
6. `decision_log`. An append-only decision record. The key is `(category, subject)`. Do not rewrite an entry later.

Images are in the report. Video waits for approval.

- Generate stills (thumbnail proposals, B-roll proposals, title-card proposals) and place them in the report before the report goes out.
- Expensive generation, such as image-to-video or an avatar, runs after the matching image is approved.
- Thumbnails have two paths, plus a mix. Path A is a real frame plus HTML type (Japanese type accuracy, and the step 1 technique of an HTML sheet captured as a screenshot). Path B is Codex image generation. The mix generates the background with B, then sets the type with A.

Approval is a checkpoint. The person approves direction, then the footage plan, then execution. The default is explicit approval.

Decision communication, implemented here from the pattern of earlier work:

- Before a paid or heavy generation, declare which hand you will use and why, then run it.
- When there is more than one choice, do not silently pick the default. State both.
- Append the decision to `decision_log`. The log can be audited.

## Generation skill contract

Hand order is fixed.

1. Codex image generation. Codex writes the file straight into the project directory. Auth uses a ChatGPT login, so there is no API-key to manage.
2. Akari Cloud API or MCP, from the agent layer, not through the app.
- Calling an API key directly (OpenAI, Gemini, and the others) is out of scope. Do not put the leak risk on one person.
- The app itself never talks to a generation service. The product only composites. Generation is a hand.
- Every generated file records provenance: the hand, the prompt, and the time.
- The flow is two steps, image then image-to-video. Composition and style are fixed by image approval before anything moves.

## Skill set

A router plus leaves.

```
akari-video-skills/
  SKILL.md                 # router. Thin. Only hard rules at the FORBIDDEN level
  analyze-footage.md       # analyze one footage item, write analysis.json
  edit-plan-report.md      # merge, report, approve, write edit.json
  authoring/               # overlay authoring rules, the CLAUDE.md rules as skills
    telop.md / table.md / 3d.md / motion.md
    thumbnail.md           # situation-to-pattern table, design vocabulary, and the rule for path A, path B, or the mix
    text-behind-person.md  # person cutout plus z-order. The cutout uses analysis person_matte
  harvest.md               # turn a good result into a library asset
```

- The shape that won in the survey is a principle, a numeric threshold, and a "common mistakes" section. One skill is one judgment area. Real knowledge lives in the leaves, disclosed as the reader goes deeper.
- A subagent loads only the leaves it needs and produces in parallel.
- If this is published outside, invest in making the single entry point (the router) easy to find. A skills.sh measurement showed the router at 424.9K and a leaf at 2K. The traffic sits on the router.

## Out of scope

- Style learning. Accumulated `edit.json`, reports, and footage become the learning material later. The base comes first.
- Stock-footage API integration. Add sources such as Pexels in steps. Watch Storyblocks-style EULA terms that forbid AI and ML use. For audio, Epidemic Sound provides an official MCP and is the first candidate for a hand that searches licensed BGM and sound effects.
- Community distribution and sales. See the asset library contract v0.

## Addendum (2026-07-14). Highlight events and transcript-driven keyframes

Additions from operating on long real footage, about 60 minutes. The new vocabulary is backward compatible with analysis.json v0. The existing four event types and the required keyframe fields do not change. `version` stays 0.

### Highlight event

A general slot for an important line.

A hook is a measure specialized for a "moment to show" in a short. There was no place for a plain line that still changes an edit decision, such as a decision, a conclusion, a number, or a strong claim. Add that place as `highlight`.

```jsonc
{ "type": "highlight", "start": 312.0, "end": 318.5,
  "quote": "a quote faithful to the spoken line", "reason": "states the release date (a decision)", "importance": 4 }
```

- `quote` stays faithful to the spoken line in the transcript. Do not summarize it and do not invent it. `reason` says why it matters. `importance` is an optional score from 1 to 5.
- Downstream uses: a keep reason in a cut decision, a caption quote, a chapter title, thumbnail text, or the seed of a short candidate.
- Do not create one when the transcript is empty. `quote` is required.

### Transcript-driven keyframes

A third extraction family.

Keyframe extraction used to have only two picture-side families: scene (a visual change) and interval (a safety net at a fixed spacing). It could not aim at the frame of an important line. Add a third family that extracts a frame from a highlight time.

- Effect. Speech and picture can be matched. You no longer need a dense interval to avoid misses, which eases the explosion of candidates on long footage. Measured: 62 minutes at a 10 second interval is 374 candidates.
- Add optional `keyframes[].origin` (`scene`, `interval`, or `transcript`) so a reader can trace which family accepted the frame.
