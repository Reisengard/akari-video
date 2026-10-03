**English** | [Japanese](./contract-2026-08-30-edit-json-v2-object-tree-v0.ja.md)

---
lifecycle: accepted
created: 2026-08-30
updated: 2026-08-30
---

# edit.json v2 object tree contract v0. Only edit.json holds the tree, the contents live in bags, and a person does not touch the JSON

- Date: 2026-08-30
- Status: **v0 (owner ruling 2026-08-29 to 2026-08-30, not implemented yet).** A mismatch found in the implementation task is resolved by appending.
- Depends on:
  - `contract-2026-07-17-data-contract-versioning.md` (a version is required, and evolution is additive only. **This contract keeps `version: 2`.**)
  - `editV2`, `itemV2`, and `trackV2` in `packages/schemas/edit.schema.json` (the current v2 shape. The Aug 18 five stages, schema, internal model, draw, write and migrate, vocabulary, have landed.)
  - `contract-2026-08-02-preview-parity.md` (preview, osr, and gpu, the three exits, draw the same picture)
  - `contract-2026-07-25-project-structure-v0.md` (canonical files directly under the project. `motion/` was appended today.)
  - `contract-2026-07-22-render-basics.md` §4-4 (the existing `keyframes` semantics)
- Scope: for edit.json v2, **tree recursion (groups), the projection from a bag (HTML, captions.json, motion/), part items, track invariants, the save format, the read and write rules, and the edit-store script API.** The UI (timeline tree rows, the inspector, focus mode) is another contract.
- Sibling contract: `contract-2026-08-30-motion-and-keyframes-v0.md` (the four levels of motion, the `motion/` bag, and the L2 animator)
- Design source (private): the decision note in the internal repo `akari-video-internal`, "object tree, timeline, and inspector design round (2026-08-29)". Other editors (Diffusion Studio, HyperFrames Studio, Theatre.js, Lottie) are **design references only. No code is ported.**

## 0. Place in the system

**edit.json is canonical. The tree (track, then item, then item, and so on) lives only in edit.json. Contents that grow in volume live in a bag. A person does not touch the JSON.**

- The tree is `tracks[]` (a track), then `items[]` (an item), then `items[]` (a child), and so on. **Items recurse.** Group nesting, order, and time all live in edit.json.
- A bag is an HTML fragment, `captions.json`, or `motion/<group-id>.json`. The inside of a bag (parts, caption rows, keyframe curves) is **not written** into edit.json. edit.json carries **only what a decision needs** (structure, time, static transform values, presets, references, plus a count). This generalizes the existing shape, where HTML fragments, captions.json, and analysis.json live outside and edit.json only refers to them.
- **A person does not touch the JSON at all.** The AI reads and writes it. A person touches only knobs and the UI. The format exists for the AI's grep and Edit, and for git diff (§5).
- Footage files (HTML, captions.json, 3D) are **not rewritten** by an edit operation. Detach, group, and a time shift are tree operations, not bag operations.

## 1. Data model (additive only, `version: 2` stays)

**Do not add a new subschema beyond the ones listed here.** A part, a caption row, and a group are all an ordinary item, and they use the common fields as they are (`id`, `at`, `duration`, `transform`, `opacity`, `blend`, `crop`, `perspective`, `keyframes`).

### 1.1 Recursion. An item may have `items[]`

```jsonc
{ "id": "g-hook", "name": "Hook", "at": 0, "duration": 90,
  "source": { "kind": "group" },
  "items": [
    { "id": "h-title", "at": 0,  "duration": 90, "source": { "kind": "telop", "preset": "ref3_title", "params": { "text": "..." } } },
    { "id": "h-logo",  "at": 12, "duration": 78, "source": { "kind": "html", "path": "overlays/logo.html" } }
  ] }
```

- Every item may have `items: itemV2[]`. **A child's `at` is an integer frame relative to the parent** (the parent's `at` is 0). A child fits in the parent's `[0, duration)` (lint error otherwise).
- A child's transform and opacity **compose** with the parent's (the child sits in the coordinate system after the parent's transform is applied. `opacity` multiplies).
- **The order of `items[]` is z order (later is in front).** Each child of a group is an independent row. There is no constraint on time overlap among children. The track invariants of §2 apply **only to the top-level `tracks[]`.** The tree shape differs only in that the top-level container is called a track.
- There is no depth cap (lint rejects a cycle and a self-reference. JSON cannot express them structurally).

### 1.2 A pure group, `source.kind: "group"`

- A container with no contents of its own. `name` is optional. It still has `at`, `duration`, `transform`, `opacity`, `blend`, `keyframes`, and `motion` (a small composition).
- "Group" (§3.2) creates this. Wrap in a group that has no transform, and coordinates and time stay unchanged.

### Draw rules for a group's children (appended 2026-09-25)

- A child's absolute time is the sum of the ancestors' `at`. Draw only the intersection of the child's own time span and every ancestor's `[at, at + duration)`. The end is exclusive.
- The look composes `transform` from the ancestors outward. Position applies the parent's scale and rotation. Scale multiplies. Rotation adds. Opacity is the product of the ancestors and the child.
- Overlap order inserts the child's array order at the parent's track position. Nesting expands with the same rule. A captions bag, and a row detached from a bag, also use the parent's track position.
- A media child is projected to an absolute-time layer in the old view used for drawing. The tree in the original `edit.json` and the footage files are not changed.
- When a captions bag places a row that is listed in `source.exclude` as a child caption item, the original bag does not draw it, and the child is drawn once.
- A caption item inside a group uses the same caption HTML as one directly under a track (typeface, the default fade, the font reference). The current default font reference and fade have an existing constraint that the GPU eligibility check marks `degraded`. `render-cut --engine auto` chooses OSR for both, and an explicit GPU exit refuses with an eligibility error. Putting the item in a group is not a reason to change the caption HTML or the check.
- The group's own `keyframes` and `motion` are outside this static composition. If motion is needed, declare it on a child that is drawn.

### 1.3 A bag group. An `html` or `captions` item that has `items[]`

**A bag is a container of name-tagged parts.** The name tag of an HTML fragment is `data-akari-part="<id>"`. The name tag of `captions.json` is the row `id`. A future 3D (glTF node name) or Lottie (layer name) is added in the same shape (undefined in this contract, vocabulary reserved only).

```jsonc
// An HTML bag (always this shape at import. Collapse is a UI display state, not data).
{ "id": "s01", "name": "Opening", "at": 0, "duration": 120,
  "source": { "kind": "html", "path": "overlays/s01.html", "exclude": ["C"] },
  "items": [
    { "id": "s01.B", "at": 6, "duration": 114, "transform": { "y": -40 },
      "source": { "kind": "html", "path": "overlays/s01.html", "part": "B" } }
  ] }
```

- **A visible child is a projection from the bag's name tags.** It is not written into edit.json. In the example, if `s01.html` has parts A, B, and C, then A is a projection (untouched, default time equals the bag), B is explicit (it was touched, so it lives in `items[]`), and C is `exclude` (not shown inside the bag, which means it was detached to another place, or removed).
- **Only a touched child becomes an explicit item.** An explicit item is placed in `items[]` as a child of the bag, or placed somewhere else in the tree (detach, §3.1). Either way the bag side holds the id in `source.exclude`.
- **Inside a bag, do not reorder and do not ungroup** (HTML DOM order, or captions.json row order, is canonical). A part you want to change is detached.
- A fragment with no name tag is "one item for the whole bag" (no `part`, no `items`). Existing overlays are this (**no regression**).
- Reading name tags (walking the HTML) is **the draw and preview side's job** (§4). The edit.json load layer only treats a bag as an item that may have children.

### 1.4 A part item, `source: { kind: "html", path, part }`

- Add 3 optional keys to the existing `itemSourceHtmlV2`. `part: string` (the name tag). `style: { "<css-prop>": "<value>" }` (inline style on the part root. An open map. Lint does not validate CSS values). `text: string` (a replacement for the body text).
- `vars` and `params` (the existing knob path) work on a part item too. `style` and `text` are the escape hatch for fixing a place that has no designed knob, so the look can change without rewriting the HTML.
- A part item's `at`, `duration`, `transform`, `opacity`, and `keyframes` are the common fields. **There is no part-specific subschema.**

### 1.5 Captions are a bag group (the dedicated track is abolished)

```jsonc
{ "id": "captions", "name": "Captions", "at": 0, "duration": 5400,
  "source": { "kind": "captions", "path": "captions.json", "exclude": ["c-0042"] },
  "items": [] }
```

- Captions are **a group, not a dedicated track.** The shape matches an HTML bag (the bag is captions.json, a child is a row). It can collapse, move forward and back, sit inside another group, and a row can be detached, with the same operations as a part. Every track becomes unnamed (§2).
- A child's (a row's) time stays in **source seconds** of captions.json (the existing contract). The projection's `at` and `duration` are derived by the load layer's timeline mapping (they are not baked into edit.json).
- **Detaching a row.** `{ "id": "cap-42", "at": 1210, "duration": 48, "transform": { "y": -120 }, "source": { "kind": "caption", "path": "captions.json", "id": "c-0042" } }`. Text and style stay canonical on the captions.json row. Only position and time are overridden on the tree side.
- **Convert to telop.** `source: { "kind": "telop", "preset": "...", "params": { "text": "..." }, "from": "captions.json#c-0042" }`. After that it is an independent telop (`from` is provenance. The original row is `exclude`). **Append.** "Convert to telop" was removed as a GUI operation on 2026-09-21. The `kind:"telop"` seat and `baked` playback stay for backward compatibility.
- How two rows at the same time are shown (a secondary row) is a draw-side rule, not data. An overlap that is an edit mistake is a lint warning.
- **The old shape `tracks[].content: { from: "captions.json" }` can be read (tolerant reader) but is deprecated.** The load layer lowers it to the same internal form as a bag group. Writers (the shell and skills) emit the bag-group shape, and `akari migrate` normalizes the old shape into the bag-group shape. Lint warns on the old shape with `v2.captions-content-deprecated`.

### 1.6 Extract, `source.derivedFrom`

- Detach (§3.1) stays on one sheet (the clone mask, §4). **Extract** is an explicit operation. It writes the part out to a derived file `overlays/s01.C.html`, replaces `source.path`, and leaves `source.derivedFrom: "overlays/s01.html#C"` as provenance. The original HTML is unchanged. After that the part can be rewritten freely as independent HTML (the link to the original is cut).

### 1.7 Optional fields common to every item (added)

| Key | Type | Meaning |
|---|---|---|
| `name` | string | Display name (a group, a bag, or any item). If absent, the UI derives it from `source`. |
| `hidden` | boolean | Do not draw (preview and export both. "What you see is what is output.") |
| `locked` | boolean | The UI cannot move it. Drawing is unaffected. |
| `items` | itemV2[] | Children (§1.1) |
| `motion` | object | L0 preset motion (sibling contract §1) |
| `animator` | object[] | L2 animator (sibling contract §4) |
| `keyframes` | array **or** `{ path, count }` | L1. An inline array (the existing `keyframeV2[]`) or a reference to a `motion/` bag (sibling contract §2 through §3). |
| `anchor` | `{ caption, range?, offset?, duration? }` | Tie the time to a caption row, or to a partial span of source seconds ([caption-row anchor contract](contract-2026-09-02-item-caption-anchor-v0.md)) |

- Collapse, selection, and the in-focus scope are **display state**. They are not saved in edit.json.
- `id` is unique across the whole tree (the UI composes a projected child's id as `<bag id>.<name tag>`. Once it becomes an explicit item, that id is written into edit.json).

### 1.8 Vocabulary and presentation (2026-09-01, owner ruling). "Group" means only a pure group

The data model already separates §1.2 (**pure group**, what a person makes with Cmd+G) from §1.3 (**bag group**, what the data produces at import). **The UI does not call these two by the same word.**

| | Pure group (§1.2) | Bag (§1.3) |
|---|---|---|
| Who makes it | A person, with Cmd+G | The data is already that way (it appears on its own) |
| Name in the UI | **"Group"** | Call it by the footage kind ("Captions", "Overlay", "SFX"). **Do not call it a group.** |
| Expand toggle | **Show it** | **Do not show it** |
| Ungroup (Cmd+Shift+G) | Allowed | **Not allowed** (already fixed in §3.3) |

- **One track is always one row.** A leaf item (one with no children) is a chip inside the bar, not a row in the header column. A header-column row is only (a) a pure group that has children, or (b) a child of a pure group that is expanded.
- **Two paths reach a bag's child.** (a) Click the chip on the bar directly to select it. (b) Double-click to enter focus mode ("go inside", §7). There is **no** operation that expands a bag on top of a track.
- Marks on a collapsed bar that show where children sit stay as they are (the bar tells you what is where).
- "Detach" (§3.1) and "convert to telop" (§1.5) stay usable as **operations on a bar chip** (they are reachable even when there is no row). **Append.** "Convert to telop" was removed as a GUI operation on 2026-09-21. The `kind:"telop"` seat and `baked` playback stay for backward compatibility.

**Basis.** A bag is a container the data already is. A person did not make it, and it cannot be ungrouped. Calling it a "group" in the UI raises questions that have no answer, such as "can it be ungrouped" and "does it need to expand". On a real job (30 SFX, 30 caption rows) making every leaf a row swelled the header column to 71 rows, and this mix-up showed up as a break.

**Only the presentation changes** (§1.3's "collapse is a UI display state, not data" stays. The data format, serialization, and lint are unchanged).

## 2. Track (`tracks[]`) invariants

| # | Invariant | When it breaks |
|---|---|---|
| 1 | **Two items do not overlap on one track.** `items[]` of the same track do not overlap in output time `[at, at+duration)`. | lint **error** (the writer keeps it. An edit-store operation grows a track when it would place something on an overlap.) |
| 2 | **An overlap grows a track.** An operation that places something on an overlap creates a new track **above** that track and places it there (it does not trim the neighbor to pack). | An edit-store operation rule (a data transform) |
| 3 | **An empty track disappears.** A track whose `items` are empty is deleted on save, and numbers are packed from the bottom as V1, V2, and so on (the display name is unnamed. `name` is only an optional note). | edit-store normalizes on save |
| 4 | **A higher track is in front.** `tracks[]` array order is bottom to top, which is z order (the existing v2 ruling). Inside a group, `items[]` order is z order, the same way. | A draw rule (existing) |

- Tracks are unnamed (V1 through Vn are display numbers). `lane` (`visual` / `audio`) stays as it is.
- Detach (§3.1) **always grows a new track**, as a consequence of invariant 1 (it cannot overlap on the same track). Undo (Cmd+Z) removes the track.
- Audio tracks follow the same 4 conditions (the same as the existing overlap ban).

**Total-duration retreat rule.** While the maximum end of the picture body (`media`, `telop`, and `filter` on the visual lane) is greater than 0, that value is the canonical total duration. Only when that end is 0 is the total duration derived from the maximum end of `html`, `group`, `captions`, and `caption` on the visual lane (including nesting) and of narration and SFX on the audio lane. BGM is footage that is cut to the total duration, so it is not a retreat target. If the maximum end of the retreat targets is also 0, the total duration is 0.

### 2-5 append (2026-08-31, owner ruling). Captions get no special z rule either

- **Captions (a bag group, a detached row, and the result after convert-to-telop) also take z from the track.** The special rule "captions are always on top" is **abolished** (the draw side's unconditional push to the top track via `generatedFrom` is removed too).
- A captions bag landing on the front-most track at import is a **default placement**, not a rule. The user and the AI can move the captions track forward and back freely.
- Aim. Do not grow a special rule per kind (keep the state where the 4 invariants of §2 explain every kind). Switch preview, osr, gpu, and render-cut, the four exits, at the same time, and hold it with parity.

## 3. Operation semantics (defined as data transforms. UI commands and key bindings are another contract)

The operations are the three **detach, group, and ungroup**, plus extract and convert to telop. **There is no "put back"** (Cmd+Z only. Regrouping is just "group"). **Append.** "Convert to telop" was removed as a GUI operation on 2026-09-21. The `kind:"telop"` seat and `baked` playback stay for backward compatibility.

### 3.1 Detach

- Input. One child item (a projection or an explicit item) and a destination (a track, or another group).
- Transform. (1) If it is a projection, make it an explicit item (write out the bag's defaults). (2) Convert `at` from parent-relative to destination-relative (absolute if the destination is a track). Bake in the parent's `transform` and `opacity` (the same formula as §3.3). (3) If it came from a bag, add the id to the bag's `source.exclude`. (4) If the destination is a track and it overlaps, grow a track (§2-2).
- A detached part is one item, equal to one group (it can be grouped again).

### 3.2 Group

- Input. Several items that sit in the same place (siblings on the same track, or siblings inside the same group). If they are mixed, detach first (lint and the UI refuse).
- Transform. Wrap them in a parent of `source.kind: "group"` that has no transform. The parent's `at` is the minimum `at`. `duration` is the maximum `at+duration` minus the minimum `at`. A child's `at` is rewritten to be parent-relative. **Coordinates, time, and look are unchanged** (the test is that the draw plan matches before and after the transform).
- **When items on separate tracks are grouped.** The new group is placed on **the track where the front-most member was**, and the other members rise to there (order among members is kept). Another bar that was sandwiched between them (one whose time overlaps) goes behind the members that rose, so the look changes. **Do it, notify that something's order changed, and Cmd+Z can undo** (the notification implementation is the UI contract).
- Nesting is allowed (a group inside a group). Selecting "detached part A plus the remaining bag" and grouping them puts a group inside a group.

### 3.3 Ungroup

- Input. One group.
- Transform. **Bake** the parent's `at`, `transform`, and `opacity` into each child, and place the children where the parent was (a track, or a higher group). The bake formula is `at' = parent.at + child.at`, `transform' = compose(parent.transform, child.transform)` (x and y add after the parent's scale and rotate are applied, scale multiplies, rotate adds), and `opacity' = parent.opacity * child.opacity`. The parent's `keyframes`, `motion`, and `animator` **cannot be baked** (make it a lint error and refuse. Expand to keyframes first).
- The children that come out go to their own tracks (a track grows, by §2-2). A bag group **cannot be ungrouped** (order inside the bag is owned by the bag. To detach every projected child, detach them one by one).

### 3.4 Extract (§1.6) and convert to telop (§1.5)

> Append. "Convert to telop" was removed as a GUI operation on 2026-09-21. The `kind:"telop"` seat and `baked` playback stay for backward compatibility. The rest of this section records the semantics from before the removal.

- Both are one way. The original file is unchanged, and provenance (`derivedFrom` or `from`) stays.

## 4. Drawing. The clone mask

- **Mount the whole fragment once per part item**, and set `visibility: hidden` on name-tagged elements other than that `part` (not `display: none`, so layout and CSS inheritance stay intact). Each mount has its own clock (item-relative time), transform, and z.
- Projected children of a bag group (untouched parts) are **combined into one mount** as long as their time and position line up with the bag (an engine-side optimization. The data is unchanged). An `exclude` part is `visibility: hidden`.
- `source.style` is applied as inline style on the part root element. `source.text` replaces the part root's textContent (if `text` is set on a part that has child elements, lint warns, and the draw replaces only the first text node).
- CSS or GSAP animation inside a part (L3) seeks on the part item's clock (the existing HTML seek rule, unchanged).
- **The same rule on the three exits, preview, osr, and gpu** (`contract-2026-08-02-preview-parity.md`). "What you see is what is output."
- Cost. Mounts grow by the number of detached parts (typically 2 to 5, about the same as the current overlay count).
- Walking name tags is done by the draw side (the HTML layer of overlay-runtime and frame-engine). **The edit.json load layer does not read HTML.**

## 5. Save format and read and write rules

### 5.1 Canonical serialization. edit-store owns it

A person does not touch the JSON, so "text surgery that keeps hand-written formatting" is no longer needed. **edit-store is the only serializer**, and every save normalizes to the following shape. edit.json, captions.json, and motion/*.json all use the same rule.

- **One record, one line.** An item, a caption row, and a keyframe are one line. Only the **outer frame** of an array or an object opens vertically.
- A group (an item that has children) is "its own fields on one line, plus `"items": [`, plus each child on one line (indent plus 2), plus `]}"`. **A record is the item's own fields.** Each line starts with `"id"`.
- Inline `keyframes` (8 points or fewer) stay on the item's line. More than that goes to a bag (sibling contract §2-3), so the line does not grow long.
- Key order (fixed): `id, name, at, duration, hidden, locked, transform, opacity, blend, crop, perspective, motion, animator, keyframes, source, items`. Inside `source`, `kind` is first and the rest follow declaration order. The top level is `version, output, sources, audio, tracks, ...` (an unknown key is kept at the end, tolerant reader).
- Indent is 2 spaces. In-line separators are `, ` and `: `. Unicode is not escaped. One trailing newline. Numbers use the JS default notation.

```jsonc
{
  "version": 2,
  "output": { "width": 1920, "height": 1080, "fps": 30 },
  "sources": [
    { "id": "main", "path": "assets/talk.mp4" }
  ],
  "tracks": [
    { "id": "v1", "lane": "visual", "items": [
      { "id": "c1", "at": 0, "duration": 195, "source": { "kind": "media", "src": "main", "in": 12, "out": 18.5 } },
      { "id": "c2", "at": 195, "duration": 210, "source": { "kind": "media", "src": "main", "in": 40, "out": 47 } }
    ] },
    { "id": "v2", "lane": "visual", "items": [
      { "id": "s01", "name": "Opening", "at": 0, "duration": 120, "source": { "kind": "html", "path": "overlays/s01.html", "exclude": ["C"] }, "items": [
        { "id": "s01.B", "at": 6, "duration": 114, "transform": { "y": -40 }, "source": { "kind": "html", "path": "overlays/s01.html", "part": "B" } }
      ] }
    ] },
    { "id": "v3", "lane": "visual", "items": [
      { "id": "s01.C", "at": 30, "duration": 60, "keyframes": { "path": "motion/s01.json", "count": 14 }, "source": { "kind": "html", "path": "overlays/s01.html", "part": "C" } }
    ] },
    { "id": "v4", "lane": "visual", "items": [
      { "id": "captions", "name": "Captions", "at": 0, "duration": 405, "source": { "kind": "captions", "path": "captions.json", "exclude": [] }, "items": [] }
    ] }
  ]
}
```

- A save writes the real file **only when the lint gate (write-gate) passes** (existing). edit.json, captions.json, and motion/*.json are written atomically together in one save (captions.json already works this way).
- One record per line is **a format change only** (meaning unchanged). An existing project becomes canonical on the next save (a large diff happens only once).

#### 5.1 append (2026-08-30, after the implementation task A2 deviation report)

- Serialization rule for a top-level key that is not in the example (`audio`, `captions`, `thumbnail`, and similar). **An object whose value includes a non-empty array opens its outer frame vertically, and the same rule applies recursively to the inside. Any other object is one line.** `output` stays one line (as in the example). Determinism and idempotence are fixed by tests.
- "A file that was touched" is a file whose bytes after canonical serialization differ from the original file. `save()` on a canonical project with no edits writes nothing (lint does not run either). A non-canonical form is rewritten to canonical even with no edits (the implementation of "the next save becomes canonical").
- Deleting an empty track (§2-3) packs the following tracks' `orderIndex`. That is a consequence of normalization. If the ffmpeg command sequence matches, the meaning is unchanged.

### 5.2 How the AI reads (a skill rule, to be reflected in SKILL.md)

1. **Do not Read the whole of edit.json, captions.json, or motion/*.json.** `grep -n '"id": "<id>"'`, then Read only that line, then Edit. To see the tree structure, read only the outer frame, as in `grep -n '"kind": "group"\|"items": \['`.
2. A write goes (a) through the edit-store script API (§6), or (b) a direct Edit of that line plus lint on save (pass the write-gate equivalent on the CLI). **Either way the lint gate always runs.**
3. A bulk operation ("shift captions after 1:00 by 0.5 seconds", and similar) is **a script the AI writes** (import the §6 API). Do not prepare a bulk command ahead of time.
4. When writing motion, default to an L0 preset or an L2 animator (a few values are enough). Hand-authored L1 keyframes are mainly what a person makes in focus mode.
5. **Do not build observation or surgery CLI commands (`akari edit tree`, `move`, `group`, and so on)** (owner ruling 2026-08-30. The file is the API).

## 6. edit-store script API (the spec of implementation task A2)

Rebuild `@akari-video/edit-store` (currently 8,044 lines, text surgery plus the lint gate) into **a public API that an AI script imports.**

```ts
import { openProject } from '@akari-video/edit-store';
const p = await openProject('/path/to/project');
p.edit.tracks;                          // typed (TS types generated from the schema)
p.captions.rows;                        // captions.json
const m = await p.motion('s01');        // motion/s01.json (an empty bag if absent)
// Fix it (ordinary object operations. Look up by id. Index arguments are abolished).
const item = p.edit.find('s01.B');
item.at += 15;
for (const row of p.captions.rows) if (row.start >= 60) { row.start += 0.5; row.end += 0.5; }
// Tree operations (with invariants: a track grows, values are baked)
p.edit.detach('s01.C', { track: 'above' });
p.edit.group(['s01', 's01.C'], { name: 'Hook' });
p.edit.ungroup('g-hook');
await p.save();                         // canonical serialization, then the lint gate, then an atomic write (the 3 files together)
```

- The only entry is `openProject(dir)`. `save()` owns the §5.1 canonical serialization, the §2 normalization (delete empty tracks, pack numbers), and the lint gate.
- **Unify on id arguments** (v2 gives every item an id). Index arguments for a cut or a layer are abolished.
- A README (`packages/edit-store/README.md`) plus two script examples (`examples/shift-captions-after.mjs`, shift captions after 1:00 by 0.5 seconds, and `examples/speed-up-group.mjs`, halve the duration of a group's children). SKILL.md refers to these.
- The shell and preview-server move onto the same API (text surgery is retired in stages. Until retirement is complete, both emit the same canonical form).

## 7. Lint (invariants added to the save-time gate)

| check | severity | Condition |
|---|---|---|
| `v2.id-unique` | error | id is unique across the whole tree (extend the existing check to recursion) |
| `v2.child-in-parent` | error | A child's `[at, at+duration)` fits in the parent's `[0, duration)` |
| `v2.track-no-overlap` | error | items on the same track do not overlap in time (existing, now written down) |
| `v2.group-bake-blocked` | error | An ungroup was attempted on a group that has `keyframes`, `motion`, or `animator` (at edit-store operation time) |
| `v2.part-ref` | warning | Whether an id in `source.part` or `source.exclude` exists in the bag (**string level.** HTML is a grep of `data-akari-part="..."`. Captions are row ids.) |
| `v2.captions-content-deprecated` | warning | The old shape `tracks[].content` is in use |
| `v2.caption-overlap` | warning | A detached caption row and a bag projection overlap at the same time |
| `v2.keyframes-ref` | error | The bag for `keyframes: { path, count }` is missing, or `count` differs from the real count |
| `v2.empty-track` | info | An empty track (it says it will be deleted automatically on save) |
| `engine.unsupported-field` | error | The item declares a field that the selected GPU or OSR exit treats as `ignored` |
| `engine.partial-field` | warning | On the selected exit the field is approximate or partial (`partial`) |
| `engine.capability-unknown` | warning | The engine conformance table has no `path` or `applies_to` for a canonical key |

## 8. Versioning and migration

- **`version: 2` stays.** Every addition in §1 is an optional field (versioning contract, principle 1). An existing v2 project reads with not one bit changed (an acceptance condition of the implementation task).
- Deprecated: `tracks[].content` (§1.5). `akari migrate` normalizes it to the bag-group shape (meaning unchanged, and the draw plan matches, which is the test).
- One record per line is format only. migrate is not required (the next save is canonical).
- v0 and v1 are outside this contract (raise them to v2 with the existing migrate first).

## 9. Implementation sequence (task list and dependencies)

| # | Task | Contents | Depends on |
|---|---|---|---|
| A1 | `v2-object-tree-schema` | Schema additions (§1), load-layer recursion (parent-relative to absolute), lint (§7), fixtures. **Do not read HTML. Do not touch drawing.** | This contract |
| A2 | `edit-store-script-api` | The §6 API, canonical serialization (§5.1), track normalization (§2), the three tree operations (§3), README and examples | A1 |
| A3 | `object-tree-render` | The clone mask (§4) on the three exits (preview, osr, gpu), walking name tags, `style` and `text` | A1 |
| A4 | `object-tree-write-and-migrate` | Point shell, preview-server, and skill writes at the A2 API, migrate `content` to a bag group, and save as one record per line | A2, A3 |
| D | Timeline tree rows | Collapse, drag-and-drop reparent, Cmd+G and Cmd+Shift+G, automatic create and destroy of tracks (the UI contract) | A2 |
| F | Captions as a bag group (UI) | Abolish the dedicated track, tick marks on a collapsed bar, detach a row, convert to telop. **Append.** "Convert to telop" was removed as a GUI operation on 2026-09-21. The `kind:"telop"` seat and `baked` playback stay for backward compatibility. | D, A3 |
| H | Focus mode | Sibling contract §7 | D plus the sibling contract |
| I | SKILL.md read rules | Put §5.2 into edit-plan, address-review, and analyze-project | A2 |

- At each stage, a regression holds that **the draw plan and the output bytes of an existing project (a real v2 job from fieldtest) are equivalent** (the same yardstick as the Aug 18 five stages).

## 10. Out of scope, or later

- Making the timeline bar a canvas (a separate ticket, after measuring draw-side performance following D. Owner ruling 2026-08-30).
- Putting 3D (glTF node name), Lottie (layer name), or audio into a bag group (vocabulary reserved only).
- Observation or surgery CLI commands (do not build them. §5.2 item 5).
- A different group per kind (sequence, scene, and similar). Only the two words "track" and "group".
- Per-character keyframes (sibling contract §8).
