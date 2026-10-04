**English** | [Japanese](./contract-2026-09-13-generation-v0.ja.md)

# Generation v0

Placeholder clips, nine slots, meta.json, the capability catalog, and state.

> A public copy of the source of truth (2026-09-13, revised 2026-09-21). Technical sections only. Public sections 1 through 9 match internal sections 1 through 9. Public section 10 (frame capture) matches internal section 11.

### 0-5. Ruling D (settled, 2026-09-23)

| # | Decision | Why |
|---|---|---|
| D-1 | **An empty audio frame** is an audio media item whose footage is a silent wav of the frame's length. The sibling meta.json is `kind: "audio"` and `status: "planned"`. The place is `assets/generated/`, the same as an empty picture frame | It can be the replacement target for Narration |
| D-2 | **Audio track display names count from the top** (A1 is nearest the picture, then A2, A3 downward). Picture counts from the bottom (V1 is the bottom picture track). The order and ids of edit.json `tracks[]` do not change | A track added under A1 becomes A2, and the name A1 stays |

## 1. The join (placeholder and timeline)

1. A placeholder is an **edit.json v2 media item** whose `sources[].path` points at a still (png or jpg) or a text-card png. The duration lives on the cut, as in the still-image clip contract of 2026-08-12.
2. Generation intent and state live in the sibling **`<path>.meta.json`** (section 3). edit.json gains nothing.
3. The join between meta and footage is the footage **sha256**. The path is a hint. A move or rename updates the path. A duplicate may share the same meta when the sha256 matches.
4. Make video is a **replacement** that rewrites that item's `source.path` to an mp4. The item id, the track, and the duration do not change (section 7).
5. A storyboard is a print of the timeline (9/6, section 5). It is not a generation input.
6. plan.json's placeholder role (`confidence` and `fill`) is retired. The target of `pass: "scaffold"` in `plan-comments.json` moves from `slot` to a **clip id**.
7. **Empty frame** (2026-09-21). A frame drawn with the placeholder tool (F) on an empty span is a media item whose footage is a **text-card png** with no prompt yet. That extends the rule that a clip with no picture is represented by a text-card png. The grid is 0.5 seconds. Edges snap. The frame does not eat into a neighbor. It is not shorter than 0.5 seconds. There is no dedicated track. It can sit on any track.
   Implementation. Select is V, split is C, placeholder is F. The old A and B still work. Even with snap off, a placeholder prefers a nearby visible edge or the playhead over the 0.5 second grid. It saves `assets/generated/frame-<time>-<unique suffix>.png` and the sibling `.meta.json`.
   An audio track can also hold a silent-wav frame. Where there is no track, add a picture track above and an audio track below, place the frame, and one undo removes the added tracks, the frame, and the source.
8. **A frame from a gap** (2026-09-21). Click a gap, then Generate the gap, and a frame of that gap's position and length is placed. The last frame of the previous clip and the first frame of the next clip are extracted into the two ends (slots 2 and 3). An extract from video writes one frame to `assets/captures/` (section 10).
   The right panel builds a frame from the AI tab list (still, or make video).
   Implementation. A gap is an empty span of at least 0.5 seconds on the same picture track, with a clip before it and a clip after it. The previous frame is `source.out − 1/output.fps` (and not before in), before composite. The next frame is `source.in`, before composite. A still uses its original path.
   The extracted PNG is saved at `assets/captures/frame-<footage name>-<seconds>-<hash of footage and update time>.png`. The same footage at the same time is reused.
9. A frame **has a duration and a place before generation, and the result lands in the same item** (an extension of item 4). It does not go through the media panel. The timeline is the source of truth.

## 2. Nine slots (the normalized generation input)

For every model, an input falls into one of these nine. The adapter translates them into the provider's argument names (section 5).

| # | Slot | Type | Notes |
|---|---|---|---|
| 1 | `prompt` / `negative_prompt` | string / string? | Camera notation (slot 8) is composed into the prompt before send |
| 2 | `first_frame` | reference? | Default is that clip's still. **Optional.** H3 can generate from the last frame alone |
| 3 | `last_frame` | reference? | The main seven families support it. A value on an unsupported model is a validation error |
| 4 | `reference_images[]` | reference[] | The cap is the catalog. Use `name` and `role` only when the model requires them |
| 5 | `reference_videos[]` | reference[] | Count and total seconds. **A source whose motion is copied.** It is not pasted in |
| 6 | `reference_audios[]` | reference[] | The default candidate is Narration over the clip range. Wan's attached BGM does not go here |
| 7 | `source_video` + `mode` | reference? plus `edit`, `extend`, `motion`, or `frame-edit` | **The source to continue or fix.** v1 is the field only |
| 8 | `camera` | `{ notation: "bracket" or "trajectory" or "prose", value, from_annotation? }` | The translation target of the annotation pen. The adapter picks notation for the model. **It is not burned into the picture** |
| 9 | `seed` | integer? | Shown for reproduction only. Determinism is not guaranteed |
| Output knobs | `duration_s` / `resolution` / `aspect` / `audio_out` | number / string? / string? / boolean? | Duration comes from the cuts. Round to what the model allows, and show that a round happened |
| Escape | `extra` | object | Model-specific arguments. **Only names in that catalog row's `extra_allowed[]` pass** |

A reference is `{ path, sha256, source_id?, name?, role?, range_s?: [in, out] }`. path is project-relative.

## 3. meta.json v1 (footage sidecar)

Place. A result is `assets/generated/<file>`. The sidecar is `assets/generated/<file>.meta.json`. When generating from live footage or existing footage, the sidecar sits **next to the result**, not next to the source footage.

A still with no meta gets one the first time a draft is written. The shell creates `kind: still, status: done` (an imported image). Video, audio, and html do not get a new meta that way.

```json
{
  "version": 1,
  "kind": "video",
  "status": "done",
  "model": { "id": "fal:h3-i2v", "endpoint": "minimax/h3/image-to-video", "as_of": "2026-09-12" },
  "inputs": {
    "prompt": "...", "negative_prompt": null,
    "first_frame": { "path": "assets/stills/s03-leaving-desk.png", "sha256": "...", "source_id": "src-03a" },
    "last_frame":  { "path": "assets/stills/s03-family-garden.png", "sha256": "...", "source_id": "src-03b" },
    "reference_images": [], "reference_videos": [], "reference_audios": [],
    "source_video": null,
    "camera": { "notation": "bracket", "value": "[Tracking shot]", "from_annotation": null },
    "seed": null, "extra": {}
  },
  "output": { "duration_s": 6, "resolution": "768P", "aspect": null, "audio_out": null },
  "cost": { "estimate_usd": 0.36, "actual_usd": null, "unit": "usd_per_second", "source": "estimate" },
  "job": { "provider": "fal", "request_id": "01a0...", "status_url": "...", "response_url": "...", "started_at": "2026-09-13T...", "stale_after_s": 900 },
  "provenance": { "created_at": "...", "tool": "akari generate video", "key_source": "env:FAL_KEY" },
  "result": { "path": "assets/generated/s03-leaving-to-garden.mp4", "sha256": "...", "bytes": 0, "duration_s_actual": 6.592,
              "width": 1344, "height": 768, "fps": "24/1", "has_audio": true, "expanded_prompt": "...", "elapsed_s": 206 },
  "history": [ { "at": "...", "status": "done", "reason": null } ]
}
```

`kind` is `still`, `video`, `frames`, or `audio` (an empty audio frame). `status` is `planned`, `generating`, `done`, or `failed`. `inputs` is the nine slots from section 2. A slot with no value is null or `[]`.

Rules:

1. **Write `job` before send** (`request_id` and `started_at`). A crash can still be fetched again (`akari generate resume`).
2. `status: generating` and more than `stale_after_s` since `started_at` means **stale**. The shell shows "No response. Fetch again". The default is 900 seconds.
3. State transitions are not undo steps. **Only replacement (section 7)** enters edit-store undo as one step.
4. `history[]` is not deleted. A failure stays.
5. `kind: "still"` puts one `--image=` (Codex) or several (Nano Banana Pro) on `inputs.reference_images`. `kind: "frames"` is a flipbook, and that is another contract.
6. `result.expanded_prompt` is the prompt the provider rewrote. Calibration evaluates **the expanded prompt, not the prompt that was sent**.

### 3-2. Draft `next` for a planned video (2026-09-21)

A planned video that has no mp4 yet stores a `next` block inside the **placeholder footage's meta** (the still's `<still>.meta.json`, or the text card's meta for an empty frame).

```json
{
  "version": 1, "kind": "still", "status": "done",
  "...": "...",
  "next": {
    "kind": "video", "status": "planned",
    "model": { "id": "fal:h3-i2v" },
    "inputs": { "prompt": "...", "first_frame": { "path": "...", "sha256": "..." }, "last_frame": null,
                "reference_images": [], "reference_videos": [], "reference_audios": [],
                "camera": null, "seed": null, "extra": {}, "frames_or_refs": "frames" },
    "output": { "duration_s": 5, "resolution": "768P", "aspect": null, "audio_out": null },
    "updated_at": "..."
  }
}
```

The still's own record stays as it is. The comments in the Japanese sibling name that.

1. **How a reader decides.** `next.kind === "video"` and `next.status === "planned"` means a planned video. A still with no `next` means "leave as a still", a finished piece. A text card whose own meta is `planned`, with no `next` or an empty prompt, means an empty frame.
2. `next.inputs` is a draft of the nine slots in section 2. `first_frame` is **not necessarily this clip's picture** (the previous clip's last frame, a capture, or empty, which means prompt only).
3. **`inputs.frames_or_refs`** is `"frames"` or `"references"`. Only the `next` draft has this field. It is not slot 7 `mode`, which is the source-video mode. When first and last are exclusive with references (`frames_and_refs_exclusive: true` on the row, or a switch between the i2v row and the ref row of the same family), **the draft keeps both sides, and only the `frames_or_refs` side is sent**. Switching does not delete the other side. The validator uses this field to drop the other side from the request body. The result meta's `inputs` does not keep this field. Only the side that was sent remains.
   The right panel switches the same family's frame row and reference row as "First and last" or "References", and it also swaps the model id to the partner. References are a grid with a per-kind badge and a counter. Several can be selected from the footage panel.
4. **On send.** The CLI reads `next` (or `--inputs`) and writes a video meta (`generating`) **next to the result**, as before. It always writes **`placeholder: { path, sha256, item_id }`**, the footage that item points at now (a still or a text card). The reverse lookup from the item uses `placeholder` as the source of truth. `inputs.first_frame.path` stays for meta written on 9/13. `next` is not deleted. It is the source for "again with the same input".
5. **State priority.** If a result meta joined by `placeholder` is `generating`, stale, or `failed`, draw that. Otherwise draw `next`'s `planned`. After a `done` replacement, the mp4 meta applies directly (section 7).
   A rebuild after a done replacement (final quality, or again with the same input) keeps its draft on the mp4 meta's `next`. The original still's `next` does not change.
6. Updating `next` is not an undo step (same as section 3, rule 3). An edit in the right panel saves immediately.
7. Migration. Read `.akari/generation/<itemId>.inputs.json` only when it exists and `next` does not, and move it to `next` on the next save. Do not write new files there.
8. A beat sheet (`akari generate still --spec`) can name a planned video per beat (first only, or first then last). When it does, the CLI writes `next`. When it does not, the result is "leave as a still".

## 4. Capability catalog `gen-models.json` (public repo, `packages/schemas/`)

### 4-1. Shape (one row is one endpoint)

```json
{
  "id": "fal:h3-i2v", "kind": "video", "provider": "fal", "family": "MiniMax H3",
  "endpoint": "minimax/h3/image-to-video",
  "inputs": {
    "first_frame": "optional", "last_frame": "optional",
    "reference_images": { "max": 0 }, "reference_videos": { "max": 0 }, "reference_audios": { "max": 0 },
    "source_video": [], "frames_and_refs_exclusive": false,
    "negative_prompt": false, "camera": "bracket", "extra_allowed": ["prompt_expansion_mode"]
  },
  "duration": { "kind": "range", "min": 5, "max": 15, "step": 1, "default": 5, "format": { "type": "integer" } },
  "resolutions": ["480P", "768P", "2K", "4K"], "aspects": null,
  "audio_out": "always",
  "seed": true,
  "price": { "unit": "usd_per_second", "by_resolution": { "480P": 0.05, "768P": 0.06, "2K": 0.13, "4K": 0.16 }, "audio_multiplier": null },
  "as_of": "2026-09-12",
  "source_url": "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3/image-to-video",
  "price_url": "https://fal.ai/models/minimax/h3/image-to-video",
  "verified": "documented",
  "calibration": ["calibration/2026-08-23-camera-direction", "lab/2026-09-13-w0-spikes"]
}
```

- Reference order notation is the row's `tag` (a prefix), plus `tag_joiner` (empty when omitted), plus a 1-based number. Seedance is `@Image` plus empty, which makes `@Image1`. H3 is `Image` plus a space, which makes `Image 1`. Video and audio follow the same rule. `tag` does not end with a space.
- `inputs.first_frame` and `last_frame` are one of `"required"`, `"optional"`, or `"none"`.
- `duration.format` is `{type: "integer"}`, `{type: "string"}`, `{type: "string", suffix: "s"}`, or `{type: "string", auto: true}`.
- `audio_out` is `true` (can be switched), `"always"` (attached with no field), or `false`.
- `price` **may be null** (B-1). A null row makes the UI say the estimate is unavailable, and an explicit confirm lets it through.

### 4-2. Seven rules (the rejection of old Akari OS defects, and the w1 acceptance)

1. Capabilities are boolean fields and cap fields. Do not invent a `capability` slug.
2. A value on a slot that is not in the map **fails closed and is not sent**.
3. One validator is shared by the CLI, the shell UI, and the agent.
4. Every field is required, and `additionalProperties` is false.
5. Only rows with `verified: "documented"` are included. An estimated row stays a draft in the internal repo.
6. There is no primary-axis count. Only price, duration, inputs, audio, and `calibration[]`.
7. There is no radar chart.

### 4-3. The first 12 rows

Kling v3 standard i2v, Kling v3 pro i2v, Veo 3.1 first-last, Veo 3.1 reference, Seedance 2.0 i2v, Seedance 2.0 reference, Seedance 2.5 i2v, H3 i2v, H3 reference, Wan 2.7 i2v, Grok Imagine i2v, and Vidu Q3 i2v. Images are codex-image and nano-banana-pro edit. Sora stays out until a direct OpenAI adapter exists.

Registered video adapters on 2026-09-22 are the seven rows `fal:h3-i2v`, `fal:h3-ref`, `fal:kling-v3-standard-i2v`, `fal:kling-v3-pro-i2v`, `fal:seedance-2.0-i2v`, `fal:seedance-2.0-ref`, and `fal:veo-3.1-flf`. Being in the catalog is not enough to send. H3 reference names references as `Image 1`, `Video 1`, and `Audio 1`, following OpenAPI. It rejects `first_frame` and `last_frame`.

### 4-4. Freshness and drift

- `as_of` is required. The UI cost display includes the date.
- Weekly CI fetches OpenAPI from `source_url` and compares the row's `inputs`, `duration`, and `resolutions`. A difference opens an issue. Price is out of that check. A person reads `price_url` for price.
- A row whose provider OpenAPI cannot be fetched WARNs 90 days after `as_of`.

## 5. Adapter contract (nine slots to provider arguments)

### 5-1. Map

Each adapter has, for every cell of the nine slots and the output knobs, either "argument name plus format" or "reject". Tests cover every cell.

The support list is the six rows in section 4-3. Seedance 2.0 reference maps image, video, and audio references, and it rejects `first_frame`, `last_frame`, and `seed`. The OpenAPI ground for references is saved under `packages/generate/test/fixtures/openapi/` (fetched 2026-09-22, URL and SHA-256 in that README). H3 reference is not registered until the notation mismatch is resolved.

### 5-2. Duration format (measured in the spike)

| Model | Sent form |
|---|---|
| H3 | integer `6` |
| Kling v3 | string `"6"` |
| Seedance 2.0 | string `"6"` (`"auto"` is allowed) |
| Veo 3.1 | string `"6s"` (only 4, 6, or 8, so rounding is required) |

### 5-3. How references are passed

- Seedance 2.0 reference and H3 reference send image, video, and audio as data URIs in array order. **Over 20 MB is an error and is not sent.** Upload to fal storage comes later. The OpenAPI caps are 9 images, 3 videos, and 3 audios, 12 files across all kinds. Seedance audio references require at least one image or video. H3, following the OpenAPI fetched on 2026-09-22, also allows audio alone.
- Argument names are `image_urls`, `video_urls`, and `audio_urls` for Seedance, and `reference_image_urls`, `reference_video_urls`, and `reference_audio_urls` for H3. The OpenAPI source of truth is `packages/schemas/fixtures/gen-models/openapi/`. The generate tests read that source of truth directly by relative URL. `packages/generate/test/fixtures/openapi/` keeps only the fetch-record README (fetch date, source, and conversion).
- An order tag is the catalog row's `tag`, plus `tag_joiner` (empty when omitted), plus the 1-based array index. A prompt mention written as an at-sign plus the Japanese word for image, video, or audio, then a number, is replaced. Seedance becomes `@ImageN`, `@VideoN`, and `@AudioN`. H3 becomes `Image N`, `Video N`, and `Audio N`. The exact source spellings are the ones asserted in `packages/generate/test/adapters/h3-ref-map.test.mjs`. A number past that kind's count, a number at or below 0, or a non-integer is an error and is not sent. A provider spelling typed directly is number-checked only when it has an `@`. H3's plain English is not checked or replaced, so ordinary text such as `Image 1 of 3` or `Image 3` is not rejected by mistake. If nothing is named, nothing is added to the prompt. Name plus role (PixVerse) comes from the element's `name` and `role`.
- A reference audio with `range_s` is cut with the media-bin ffmpeg before send (the clip range only). With no range, the original audio is sent as it is. The cut's temp file is deleted on both success and failure.

## 6. State and how it looks

| State | Timeline | Preview (while editing) | Export |
|---|---|---|---|
| Empty frame (text card, no `next`, or an empty prompt) | A dotted line plus "planned" | The text card plus a small badge at the upper left | The text card as it is. lint WARN |
| **Planned video** (`next` is video and planned, section 3-2) | **A purple dotted line, film holes above and below, and "Play, planned video".** The body is one first picture, an empty span generation will fill, and one last picture. The same picture is not repeated. Prompt only is text. If the last picture is the next clip's picture, the boundary shows a link mark | Upper-left badge "Play, planned video, <kind>", and a small window at the lower right when a last picture exists | The still or text card as it is. Badge and window are 0 px |
| Still, left as a still (no `next`) | A "Still" badge | The still. **No badge.** It is finished | As it is |
| `generating` | Yellow stripes plus a progress bar | **The reference picture, blurred, as the background**, plus a shimmer, plus a band at the bottom. Progress is the provider's state, not a fake | The still as it is |
| stale | Stripes plus "No response. Fetch again" | The band says "No response" | The still as it is |
| `done` (video) | Normal, plus a frame strip, plus a "Generated" origin badge | The video. Nothing extra is shown | Normal |
| `failed` | A vermilion frame, "Failed", and **"Again with the same input"** | The still plus a vermilion badge | The still as it is |

- Preview adds only **the upper-left badge, the bottom band, the planned-video window at the lower right, and the frame-capture camera button (section 10)**. Approval and compare UI do not sit on Preview.
- Kind display is "Prompt only", "From an image", "First to last", or "From references". It follows what filled the frame. There is no mode-picker UI.
- A failure's "Again with the same input" appears on both the clip and the right panel.
- **On the Export path, the badge, the band, and the dotted line are 0 px.** A pixel compare locks that (w3-b).

## 7. Replacement rules (when the state becomes done)

A video made from a footage image with `--from-image` is added as new footage under `assets/generated/`. The original image and `edit.json` do not change.

An empty frame or a still can be replaced by a picture made with "Still" on the AI tab (Codex). The item and the picture and color settings stay. One undo restores the replacement.
Still tools are Codex, Antigravity, and Grok (called through sign-in, with the metered key removed).

### 7-1. What is rewritten

The same item's `sources[].path` becomes the mp4. The item id, the track, and `at` do not change. The still's path remains on the result meta's `placeholder` (section 3-2). That is the origin. Meta from 9/13 uses `inputs.first_frame`. **One undo step.**

**Clip-side settings are kept** (2026-09-21). Transform (scale, position, opacity, flip) and color (LUT, brightness, and the rest) are settings stacked on the item. Replacement swaps **only the footage**. The other way around, **the picture sent to generation is the footage as stored**. The clip's LUT and size are not sent. A capture placed in a frame is section 10-2.

### 7-2. When the real duration differs

| Real duration | Rule |
|---|---|
| Real duration is at least the cuts | `out` is the cuts length (trim the tail). The difference is recorded on meta |
| Real duration is shorter than the cuts | `out` is the real duration, and `freeze: { at_sec: real duration, duration_sec: cuts minus real duration }` uses the existing `cutFreeze` vocabulary. lint `media.source-range` passes. The timeline's total duration does not change. **The last frame holds** |

A difference over 0.5 seconds is a lint WARN (`generation.duration-mismatch`. The new lint rule is a candidate for a separate w2-b ticket).

### 7-3. Audio

A generated clip's audio track is **muted by default** (`item.mute: true`). Narration and BGM are the source of truth. The right panel can clear the mute. The same rule applies to a model such as H3 that attaches audio with no field.

An empty audio frame is replaced by voice footage from Narration on the AI tab. If the voice is longer than the frame and overlaps what follows on the same track, place it on an empty audio track below, or, if the user chooses, shift the following clips and keep the same track.

## 8. Cost approval (the gate for paid generation)

1. Vocabulary. Approval of paid generation is **cost approval**. **Seal** is used only for the one Export approval, as in the 9/6 contract.
2. Count. The default is one clip at a time. Selecting several and **showing the total for one approval** is allowed. There is no "make every clip a video automatically". The right panel for a multi-selection (the target list, the total estimate, and one combined cost approval) is the real UI. Out of scope items (leave as a still, an empty frame, already generated) are not sent. The estimate stays beside the send button.
3. Estimate. `price.by_resolution` times `duration_s` times `audio_multiplier`, with `as_of`. A provider that cannot return `actual_usd` copies `estimate` and sets `cost.source` to `"estimate"`. An unavailable estimate (price null) passes on an explicit confirm.
4. The stop condition matches autonomy section 4 (paid, or an external send). Codex image generation is treated as free.

## 9. Terms (so they are not mixed)

The right-panel tab label is "AI" (the id is `generation`). The entry is a list of action tiles. Choosing one shows the existing generation form in a dedicated panel.
"Fix" on the AI tab holds transcription. The engine is chosen in the AI tab's dedicated panel. It calls the script panel's process, and when that is done it shows Captions.
The footage AI tab appears in the right panel when something is selected in the footage panel. A result is added as new footage. Transcription goes to the script.

| Term | Meaning |
|---|---|
| Placeholder | A still clip that has a duration and a place. It can also be a finished piece |
| Planned video | A placeholder that has a video-generation draft (`next`). There is no mp4 yet |
| Empty frame | A placeholder that has neither a picture nor a prompt yet (a text card) |
| Leave as a still | A still clip that will not become a video. It is finished |
| Reference video | **A source whose motion or camera is copied.** It is not pasted in |
| Source video | **The source to continue or fix** (extend, edit, motion, or frame-edit) |
| Cost approval | The gate before paid generation runs |
| Seal | The one Export approval (9/6) |
| Fact line | One line on model selection (price, duration, inputs, audio, calibration). It replaces a radar chart |
| Draft, then final quality | Only a video row whose `price.by_resolution` has two or more different unit prices. Draft is the cheapest resolution. Check on sets `next.output.resolution` to the cheapest and locks the resolution. Check off restores the previous choice (or the catalog-order default when there is none) and recomputes the estimate. If the result's `output.resolution` is the cheapest, it is judged a draft. No judgment field is added to the catalog or to meta. "Make this final quality..." is shown only when the original still reached through the done `placeholder` exists and still holds `next`. The initial resolution is the choice from before the draft, or the catalog default. The second price in price order is not used. Choose a higher quality, then the estimate, then the existing cost approval, then generate with the same `next.inputs` (reuse seed when the matching model stored one on meta). The existing `writeGenerationDraft` saves the send draft onto the current mp4 meta's existing `next`, and the CLI `--item` path is reused. The original still's `next` is not deleted. Only that item's footage is replaced, following section 7, and the picture and color settings are kept. When placeholder points at an older mp4, follow it back to the original still. The shown sentence is "Generate again with the same input at a higher quality. The picture can change." |

## 10. Frame capture (2026-09-21)

1. Preview's **button that is only a camera icon** (no text, and not an emoji) saves the current frame **as seen (after composite, including LUT and size)** to `assets/captures/frame-<t>.png` and shows a toast. It appears in the footage panel.
2. When a capture is used as a generation input (slots 2, 3, or 4), **that png is the footage**. A shot that included the LUT is sent with the LUT. That does not contradict section 7-1, "the picture sent is the footage as stored". The footage is that picture. When the UI places it in a frame, it says "The frame as seen, including color and size".
3. The frames before and after Generate the gap (section 1 item 8) use **footage pixels** (before composite). When the as-seen frame is needed, a person shoots it with the camera button.
4. The button is 0 px on the Export path (section 6).
