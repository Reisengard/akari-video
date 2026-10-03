**English** | [Japanese](./notes-2026-07-13-edit-json-v1.ja.md)

# Notes on edit.json v1 extensions

- Date: 2026-07-13
- Status: direction note. v0 is fixed and implemented in `contract-2026-07-13-m1-m4.md`. Promote v1 to a contract once the M5 requirements are firm. Added 2026-07-14. Section 5, audio, was promoted to `contract-2026-07-14-edit-json-v1-audio.md`.
- Rule: step forward with the `version` field. Do not break compatibility with v0.

## Candidates for v1

### 1. Several output profiles, including shorts

```jsonc
"outputs": [
  { "id": "master", "width": 1920, "height": 1080, "fps": 30 },
  { "id": "short",  "width": 1080, "height": 1920, "fps": 30, "duration_max": 60 }
]
```

One analysis and one footage plan produce both a 16:9 master and a 9:16 short. The short is generated semi-automatically from hook candidates in `events.hook` in analysis.json.

### 2. A per-cut crop, for reframing

```jsonc
"cuts": [
  { "in": 5.0, "out": 10.0,
    "crop": { "keyframes": [ { "t": 0.0, "box": [0.2, 0.0, 0.56, 1.0] } ] } }  // normalized coordinates
]
```

- Generate the crop from face and person tracks in `tracks.faces` in analysis.json. The track is already smoothed.
- Preview uses the transform on an AVFoundation video composition. Export uses an ffmpeg crop. The sandwich stays as it is.
- Several rectangles, such as a wide conversation stacked into two vertical panes, are a layout. See the next section.

### 3. Layout, several source rectangles

```jsonc
"layout": { "regions": [
  { "source_crop": [0.0, 0.1, 0.5, 0.8], "dest": [0.0, 0.0, 1.0, 0.5] },   // speaker A, top pane
  { "source_crop": [0.5, 0.1, 0.5, 0.8], "dest": [0.0, 0.5, 1.0, 0.5] }    // speaker B, bottom pane
] }
```

A usual case is making a conversation vertical. The report shows a placement mock, the person approves it, and the result is stored.

### 4. Time sync for a `<video>` inside a fragment, including text behind a person

- On the M2 runtime tick, set `currentTime` on every `<video>` that has `data-akari-sync`, so the element follows the timeline. Today only animations stay in sync.
- Use this for a person cutout, an HEVC-alpha video, placed at the front of the DOM, with text behind the person. The HTML fragment holds the whole effect, so the schema does not change. The runtime still needs the extension, which is why this note records it.

### 5. Audio schema, the executable form of the footage plan

```jsonc
"audio": {
  "bgm": { "path": "assets/bgm.m4a", "gain_db": -18, "ducking": true },   // global track
  "sfx": [ { "path": "assets/pop.m4a", "t": 12.3, "gain_db": -6 } ]        // per scene
}
```

State in the schema that BGM is global and sound effects are per scene. The data should be able to say why this footage is here.

### 6. A settled thumbnail slot

```jsonc
"thumbnail": { "path": "thumbnail.png", "source": "report:candidate-2" }
```

Store the option the report approved. Keep which candidate it came from, as provenance.

## A likely implementation order

Audio, item 5, then crop, item 2, then output profiles, item 1, then layout, item 3. That order follows the dependencies. Item 4 does not depend on the schema. It can land whenever the M2 runtime is revised.
