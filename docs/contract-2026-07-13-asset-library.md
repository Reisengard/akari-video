**English** | [日本語](./contract-2026-07-13-asset-library.ja.md)

# Asset library contract v0

The library lives in the workplace `library/` by default. When there is no workplace, use the previous `~/.akari/assets/`. Confirm the real location on the first line of `akari-assets list` (or `akari assets list`). `<library root>` below means that displayed location. Audio goes in `audio/` under it.

- Date: 2026-07-13
- Status: design fixed
- Depends on: the engine only composites. Assets, and what is known about them, all live outside it.

## Principles

- Do not depend on an external platform such as Pool. A file base, from zero. The git repository is the source of truth.
- The simplicity of an LLM wiki. The AI reads INDEX.md, goes deeper into a category, and reads meta.json. That finishes the job. A person can walk the same path. There is no search engine for now.
- Follow a shape that is already proven. The shadcn registry method, copy it and change it locally, with a JSON schema. An earlier component-distribution ecosystem has already shown the same shape for video components.

## What may enter

The most important rule.

**Admit only what is expensive to generate, or impossible to generate.**

- Admit a 3D model (a phone mockup, for example), a complex motion with many parts, a highly finished caption or thumbnail composition, audio, and B-roll footage.
- Do not admit a simple caption style or a plain animation. Anything natural language can generate each time does not grow the library.
- A user's saved "my style" lives in `styles/` under a separate contract. It is outside this admission rule.
- Do not grow the count too far. Keep a size where INDEX.md navigation still works.

## Structure

```
assets/                     For now, a local directory. A community step promotes it to its own repository.
  INDEX.md                  The spine. One line of description per category.
  scene3d/
    INDEX.md                "smartphone-mockup. A phone you can hold, in an iPhone-like shape. For a product intro."
    smartphone-mockup/
      meta.json
      fragment.html         The file itself. Three.js plus a glTF reference, following the authoring rules.
      model.glb
      preview.png
  overlay/                  telop, board, mockup, and motion are distinguished by tags
  still/                    thumbnail compositions and similar
  audio/                    bgm and sfx are distinguished by tags
  broll/
  font/
```

> On 2026-07-29 the category names switched from a subject axis (`3d`, `motion`, `telop`, `thumbnail`) to the shape of the distributed file. Old names that remain in the body below are historical. The vocabulary that is in force is the section "Category axis" at the end of this document.

- Stop the hierarchy at two levels, category then asset. The lesson from Fab collapsing its categories. A cross-cutting axis (mood, scene kind, aspect) goes into tags.
- One asset is one directory. The file itself, meta.json, and preview.png are the minimum set of three.

## meta.json schema v0

```jsonc
{
  "id": "smartphone-mockup",
  "category": "scene3d",                  // matches the directory. One category. Several categories are forbidden.
  "title": "Phone 3D mockup",
  "description": "An iPhone-like mockup you can hold. Any video or image can be placed on the screen.",  // for search
  "when_to_use": "A scene that introduces an app, demos a product, or explains a UI.",   // the main signal for AI search
  "tags": ["product-demo", "tech", "16:9", "9:16"],
  "knobs": [                              // follows the .mogrt Essential Graphics type system
    { "cssVar": "--screen-src", "type": "media", "group": "content", "label": "Video on the screen" },
    { "cssVar": "--rotate-y", "type": "slider", "min": -45, "max": 45, "unit": "deg", "group": "pose" },
    { "cssVar": "--body-color", "type": "color", "group": "style" }
  ],
  "ai_usage": "The screen texture, the angle, and the color may change freely. Do not break the bezel geometry.",  // follows the AI Usage section of the earlier example
  "requires": ["three.js", "gltf"],
  "provenance": { "origin": "Project xxx / 2026-07-01", "generator": null },  // for a generated file, the hand and the prompt
  "author": "akari",
  "license": { "spdx": "MIT", "scope": "commercial-ok", "attribution_required": false,
               "ai_training_allowed": true },   // a reserved equivalent of Fab's NoAI tag. A market will always ask.
  "price": null                           // a reserved field. null means free. For a future marketplace.
}
```

- `license`, `author`, and `price` are reserved from the start, so a later sales platform does not have to repack the file.
- **`knobs.unit` is the CSS unit attached to the value** (clarified 2026-07-29). Write only a unit that is actually attached to the value, such as `px` or `s`. Omit `unit` for a unitless scale or ratio, such as a short-side ratio. Write the meaning in `label`, for example "Frame thickness (short-side ratio. 0 means no frame)." Under this rule a tool can pass `--var board-width=940` as `940px`, and can pass a ratio knob as a bare number. That is how parameters expand on an HTML asset. Mixing the two produces invalid CSS such as `width: 940`. The picture changes, and the check can misread a break as "it took effect."
- The vocabulary of `knobs.type` is `text`, `color`, `slider`, `dropdown`, `checkbox`, and `media`. The same model as `.mogrt`, vocabulary motion designers already know.
- Do not adopt the `.mogrt` format itself. It is a proprietary container that assumes an After Effects runtime, and it cannot run here. Borrow only the type system. Leave room for a future skill that converts `.mogrt` into this package.

## How an asset is used

- Copy it. Do not link it. Adopting an asset means copying it into the project's `overlays/` and overriding variables. Keep edit.json self-contained, so a past job can still be reproduced after the library is gone.
- On use, record provenance on the project side. Which library, and which version, it came from.

## Search, in stages

1. Now. INDEX.md plus grep. Native to an LLM. Keep the library at a size where this is enough.
2. When it grows. Generate `catalog.json` automatically. A generated wiki layer, for machine filtering.
3. When it becomes a community. A static site plus a JSON index, the same shape as the shadcn registry. Add MCP only as a search window, later. The source of truth is always the git repository. The lesson from Descript is "Don't ship your API as an MCP."

## Harvest

A skill that turns a good result from a job into a package with metadata and harvests it into the library. The library grows as it is used. This is the step before style learning.

- Extract a value that can be derived. The same shape as Fab extracting a vertex count and similar facts from a 3D file. The list of CSS variables inside a fragment becomes knob candidates. A `<script>` dependency becomes `requires`. The skill analyzes size and similar facts and fills them in. A person or an agent writes only the fields that need a judgment (`when_to_use` and `ai_usage`).
- A future single-file distribution takes the dotLottie method as the model, a ZIP plus a manifest, with a public spec, and is considered as `.akari-asset`. For now it stays a directory.

## Community

Later. Not built now.

- A submission is a pull request. Git is the inbox as it stands. Quality is a visible review status, plus which submissions actually get used.

## Catalog and the fetch skill (added 2026-07-14)

### Three layers of assets

```
1. assets/          A local, personal library. The body of this document. Copy the file and use it.
2. catalog/         A cloud-managed catalog. What is distributed is metadata plus a fetch URL only.
                    The binary itself is not hosted.
3. setup / fetch    A skill that reads catalog/, has the user obtain the file from the source,
                    and drops it into layer 1.
```

- `catalog/` uses the same meta.json v0 contract as `assets/`. Instead of a binary it has a `source` block and `remote: true`.
- The actor that fetches is always the user, or an agent acting for the user. The catalog itself does not distribute or store the asset.

### Schema of a catalog entry

In addition to the required fields of meta.json v0, an entry has the following.

```jsonc
{
  // the required fields of meta.json v0, unchanged
  "remote": true,
  "source": {
    "url": "https://example.com/asset/123",       // the fetch page, or a direct file URL
    "acquisition": "direct",                        // direct, login, or purchase
    "license_at_source": "CC0 1.0",                  // the license text the source states, based on the original wording
    "attribution_required": false,                   // whether the source requires attribution
    "preview_url": "https://example.com/asset/123/preview.jpg"  // optional. A preview image on an external host.
  }
}
```

- The vocabulary of `source.acquisition` is `direct` (a download as it stands), `login` (an account is required), and `purchase` (a purchase is required).
- An entry with `remote: true` has no real files at all. No fragment.html, no preview.png, no binary. The `source` block stands in for the file.
- The schema was added with backward compatibility in `schemas/asset-meta.schema.json`. `source` and `remote` are optional fields, so an existing meta.json on the `assets/` side stays valid with no edit.

### Structure of catalog/

The same shape as `assets/`. Two levels, category then entry, plus an INDEX.md spine.

```
catalog/
  INDEX.md              The spine. One line of description per category.
  3d/
    INDEX.md
    <id>/
      meta.json          No real file is stored.
  font/
    INDEX.md
    <id>/
      meta.json
  ...
```

- Stop the hierarchy at two levels, category then entry, lined up with `assets/`. The priority is that a person can walk it with the same model.
- Add a font category. A specific typeface fits the admission rule strictly, "only what is expensive to generate, or impossible to generate." Natural-language generation cannot reproduce the glyphs of a specific font, so obtaining it from a source is always the premise. Do not bundle a font binary directly. Always treat it as `remote: true`, because the redistribution license depends on the source.
- Extend the category enum to `3d`, `motion`, `telop`, `audio`, `broll`, and `font`. Backward compatible. The meaning of an existing category does not change.

### The same shape as a package manager

A catalog is an index of where to fetch, not the distribution itself. Follow the same shape as a Homebrew formula or an npm `package.json`, which holds no file and describes only how to obtain it. Having each environment fetch the file avoids, by structure, redistributing a binary and the copyright problem that comes with it.

### CC0 first

Prefer assets whose source license is equivalent to CC0 (no attribution required, commercial use allowed, modification allowed) when placing them in the catalog. An asset that requires attribution may also be listed. In that case set `source.attribution_required: true`.

### attribution_required, reserved for automatic credit insertion

`source.attribution_required` is only a display flag for now. It is reserved as a design seat that later connects to automatic insertion into a credit line at export, such as an end roll.

### Preview on a remote entry

An entry with `remote: true` bundles neither the file nor a thumbnail. Instead, `source.preview_url` (an optional field) may record the URL of a preview image the source hosts. A viewer and an agent display that URL as a reference only. AKARI Video does not keep the image and does not redistribute it. An entry that lacks `preview_url` may open the page at `source.url` itself in place of a preview.

## Asset scope layers

Added 2026-07-14.

An asset is a directory, so the same scope model as a settings-file walk works. Project, then parents, then the user global. Each layer has its own reach.

| Layer | Place | Applies to |
|---|---|---|
| `local` | `<project>/assets/` | That project only |
| `shared` | `.akari/assets/` in each directory walked upward from the project (fixed by the third ruling on 2026-07-25) | Every project under that directory. A business or an organization. Several layers are allowed. |
| `user` | `<library root>/` (fixed by the third ruling on 2026-07-25) | Every project on that machine |
| `builtin` | `assets/` in this repository | The product's shipped default |
| `catalog` | `catalog/` in this repository (remote) | Fetch it, then admit it into any layer |

- Search order is `local`, then `shared` (nearest first), then `user`, then `builtin`, then `catalog`. When the same id exists in several layers, the nearer layer wins (shadowing).
- Every layer uses the same structure (`<category>/<id>/` plus an `INDEX.md` directly under the layer) and the same meta.json v0. `validate-asset.mjs` is the same regardless of layer.
- The principle "copy it, do not link it" does not change. Whichever layer an asset is adopted from, copy it into the project's `overlays/`. Scope is about the search range. Do not make a reference or a symlink across layers.
- Harvest must ask the person which layer to register into. A guide for the judgment: wording or footage that stays specific to the project goes to `local`. Reuse inside a business or a team goes to `shared`. A personal standard used on every project goes to `user`. Promotion to `builtin` is a pull request, the same path as becoming a community.
- ~~The directory name `.akari-video/` was the initial proposal (needs owner confirmation, with room to change to `.akari` and similar).~~ Then ~~the same-day re-ruling on 2026-07-25 kept `.akari-video`.~~ Then **the third ruling on 2026-07-25 settled `.akari` again.** See the addendum "Directory name ruling" at the end.
- Feedback after an edit is the entrance. "This caption was good, register it." The harvest skill starts, asks the scope, and admits the asset. A corner caption and a thumbnail composition (an HTML type template) can be registered the same way, so add `thumbnail` to category.

## Directory name ruling

Added 2026-07-25. Fixed by the third ruling.

~~**Fixed ruling (the re-ruling on 2026-07-25). Locations outside a project are unified on `~/.akari-video/` as the base.** The held initial proposal (the old item "`.akari-video/` is the initial proposal") is resolved by this.~~

History, the third ruling on 2026-07-25. User assets at that time lived directly under `~/.akari/`. From 2026-09-21, assets moved to the workplace `library/`, and only machine state remains in `~/.akari/`. Other software's existing files may sit directly under `~/.akari/`, so keep the coexistence rules in the next section.

The story of the ruling turning three times on the same day, the first through third rulings and why each was withdrawn, includes detail of the owner's local environment. It is kept in a private internal record. It is not placed in this repository.

What is fixed (updated by the third ruling on 2026-07-25. The value in parentheses is the value at the second ruling):

- The `user` layer is `<library root>/` (at the second ruling, `~/.akari-video/assets/`).
- The `shared` layer is `.akari/assets/` in a parent directory (at the second ruling, `.akari-video/assets/`).
- Recipes are `~/.akari/recipes/`. The current wording of recipe v0 is unchanged, and no change is required. The source is added as one line in section 2 of `docs/contract-2026-07-25-recipe-v0.md`.
- The default drop folder is `~/.akari/audio-drop/`. Changed from `~/.config/akari-video/audio-drop`. The ruling that pulls an XDG-style tree onto the base is kept. Only the destination follows the third ruling.
- Later locations outside a project, including styles, all live under `~/.akari/`.

Remaining work (done in this task, `2026-07-25-akari-home-base-alignment`, the third-ruling edition):

1. Path references in recipe v0. Do not substitute. The current `~/.akari/recipes/` is already correct under the third ruling. Add one source link in section 2 of `docs/contract-2026-07-25-recipe-v0.md`.
2. Change the `dropDir` default in `register-drop-folder.mjs` to `~/.akari/audio-drop/`.
3. Out of range, leave as it is. `credentials.env` and `voice-profiles` under `~/.config/akari-video/`. Where credentials live is a separate question. This ruling does not move them.
4. Moving existing real data that remains on the second ruling's base (`~/.akari-video/`) is done separately by the owner.

## Coexistence rules for `~/.akari/`

Created by the third ruling on 2026-07-25.

Other software's existing files may sit directly under `~/.akari/`. The only thing AKARI Video may do directly under `~/.akari/` is create and manage a new subdirectory that it owns, such as `recipes/`, `assets/`, and `audio-drop/`.

- Do not touch. Do not read or write a file or a directory directly under `~/.akari/` that AKARI Video does not own.
- No reserved name. Do not use the name `cache/` at home level, directly under `~/.akari/`, in the future either. It collides with a name another piece of software owns. AKARI Video's own cache lives in `.akari/cache/` inside the project. See the project-structure v0 contract.
- Existing files. Tidying or moving coexisting files is outside the range of an AKARI Video contract or task.

## Asset version and compatibility

Introduced 2026-07-30.

This completes a leftover in the inventory of section 3 of `docs/contract-2026-07-17-data-contract-versioning.md`. "`.meta.json` has no `version`, so add it as an optional field." Add two optional fields.

```jsonc
"version": 1,               // the asset's version. An integer. The first version is 1.
"min_app_version": "0.5.0"  // optional. The minimum AKARI Video version this asset requires.
```

### Why it is needed

A past job does not break. The principle "copy it, do not link it" copies the asset into the project at adoption time. A version is needed in the next three situations.

1. When switching to a new version. If a knob was renamed or deleted, a setting in `edit.json.overlays[].vars` stops taking effect in silence. The dangerous case is the one that is not an error.
2. When delivering an update to someone who bought the asset. There has to be a way to say what changed, and which setting breaks.
3. When a tool and an asset do not match. An old app or CLI that opens a new asset stops honestly, without guessing. The same shape as principle 3 of the versioning contract. Omit `min_app_version` on an asset that states no requirement.

### When to bump

| Breaking. Raise `version`. | Not breaking. |
|---|---|
| Deleting or renaming a knob | Adding a knob |
| Changing `type` | Updating `label`, `description`, or `tags` |
| Changing `unit`, or adding or removing it | Updating `ai_usage` or `provenance` |
| Narrowing the `min` or `max` range | Widening the range |
| Changing `id` or `category` | Replacing a preview or a demo |
| Changing a class name or a slot structure | A small visual adjustment that does not change the default |

A rename shows up as a deletion plus an addition. If you rename, bump, and write the old name into `ai_usage`.

### Stop a missed bump by machine

Place `harness/knob-diff.mjs` on the workshop side (the internal repository). Compare with the previous git version of `meta.json`, list the breaking changes, and exit 1 if `version` did not rise. The point is not to rely on a person's memory. In fact, the deletion of 15 `unit` declarations on 2026-07-30 passed by hand without being noticed as breaking. Running this tool later on the same history detects 7 of them as breaking.

Later, add a check on the `edit-lint` side that compares the version of an asset the project adopted with the current version. That assumes a mechanism that records the adopted version on the project. Implement the provenance record in "How an asset is used" first.

## What is placed in the repository, and what is fetched

Owner ruling on 2026-07-29.

**The principle. Fetch online. Use locally.** Do not make a path that pulls a file from outside at render time.

- What happens online is search, showing a preview, purchase and license checks, and an update notice.
- At fetch time, fix the file into a local layer (`local`, `shared`, or `user`). Use is always local.
- Three reasons. (1) The determinism of a self-contained `edit.json` breaks. If an asset is updated or deleted, a past job cannot be reproduced. (2) Do not make a path that inserts an external GET during a render. (3) Some third-party assets cannot be redistributed, and a structure that has the user fetch into their own environment (`remote: true`) is also the rights answer.
- Under this principle, a future marketplace does not change the structure of this contract. Only `catalog/` moves outside, and `meta.json` becomes the shape of the API as it stands.

### What may be bundled in builtin (`assets/` in this repository)

1. The minimum seed so the product runs with zero assets.
2. What is required to absorb an environment difference. A typeface is this case. It is the base that lines up glyphs on Mac and Windows, and `packages/render-cut/src/captions.mjs` pins `@font-face` for burned-in captions. It measures 32 MB, and it stays bundled (ruling on 2026-07-29).
3. A guide. One asset at 5 MB or under, and the builtin total around 50 MB. What exceeds that goes to `catalog/`.

### What goes to `catalog/` (an index of where to fetch)

What is heavy, and is not needed to absorb an environment difference. A 3D model, an HDRI, audio, and B-roll.

- Measured on 2026-07-29. `assets/scene3d/` is 20 MB, of which `studio-2k.hdr` (6.4 MB) is bundled twice, the same contents, in two entries.
- Moving it out is done together with introducing `asset_dependencies`, a declaration of dependencies between assets. If only the binary is removed while the current self-contained contract stays (the validator fails a reference outside the asset directory), validation breaks. Once a dependency can be declared, a shared HDRI can be one file, and the fetch skill can resolve the dependency first.

### Sample output of a template

A sample mp4 and a narration wav under `templates/<name>/sample-project/` may be bundled (ruling on 2026-07-29, measured at 5 MB). Templates are expected to grow, and the judgment is that "copy it and it runs, and the finished form is visible" is worth more than a cost of a few MB. Keep the sample per template to a minimum.

## Category axis

Redefined 2026-07-29.

Switch `category` from the subject (what it depicts) to the shape of the distributed file (how it is distributed, and how it is consumed). A subject grows without limit and an enum cannot keep up. In fact `lut` grew outside the enum, and on the `assets/` side four categories stayed empty while a new category was requested. Move to an axis that does not grow.

| v1 category | Definition of the shape | How to judge | Old category |
|---|---|---|---|
| `overlay` | An HTML fragment that has time | Has `fragment.html` plus `data-start` and `data-duration`, and is composited from `overlays[]` | `telop`, `motion` |
| `still` | An HTML sheet that has no time | `fragment.html`. Burned to an image by a deterministic screenshot. | `thumbnail` |
| `scene3d` | A 3D model plus a display fragment, or a bake recipe | `fragment.html` plus glTF, or `scene.py` | `3d` |
| `audio` | A binary that sits on an audio track | Referenced by `audio.bgm` or `sfx` in `edit.json` | `audio` (unchanged) |
| `broll` | Live-action binary that sits on a picture track | Referenced by `sources[]` | `broll` (unchanged) |
| `font` | A typeface binary | Referenced by `@font-face` or by a burn-in | `font` (unchanged) |

- A subject goes into `tags`. `lower-third`, `board`, `chalkboard`, `frame`, `mockup`, `thumbnail`, `motion`, `bgm`, and `sfx` are all tags. They are not categories.
- Not adding a category is the point of this revision. A new subject (a whiteboard, a notebook look, a sticky note) is an existing category plus tags. When proposing a new category, first show a way of being distributed and consumed that fits none of the existing six shapes.
- Folding `audio` into `media` was declined. Real data exists in `<library root>/audio/` (the user layer), and moving it would move user assets outside the repository. `audio` and `broll` also stay split as a shape axis, because the consumption path differs (an audio track, a picture track).
- What the move actually did. Three directories under `assets/` and three under `catalog/` were moved, and the `category` values were rewritten. Validation reran `validate-asset.mjs` on every entry.

## `presets/` is outside this contract

Created 2026-07-29.

`presets/` at the repository root is not an asset library. It is outside this contract (meta.json v0), and `validate-asset.mjs` does not run on it.

| | `assets/` and `catalog/` (this contract) | `presets/` (outside) |
|---|---|---|
| How it is used | A person or an AI chooses it and copies it into the project | Code keeps referring to it by name. It is not copied. |
| Changes | Change it freely at the copy destination | Do not change it. Replace it, or generate it again. |
| Who resolves it | A person or an AI, by reading INDEX.md then meta.json | Code. The resolution path is embedded in the implementation. |
| Description form | `meta.json` v0 | Each table's form (`template.json`, or `.cube` plus `index.jsonl`) |

What is held now:

- The ATF caption reference table and renderer are retired. Obtain the HTML asset version from Lab. Existing baked output keeps playback compatibility.
- `presets/luts/` holds two 3D LUTs, generated in-house. `packages/render-cut/src/plan.mjs` resolves `output.look.lut` in `edit.json` (a name that contains no separator) to `presets/luts/<id>/<id>.cube`.

### Why they moved

Both originally lived under `catalog/`, and the files contradicted the `catalog/` contract, which is an index of where to fetch and holds no file when `remote: true`. Captions were a different form with no `meta.json`. LUTs bundled real files and were given a `meta.json` that did not fit this contract. `validate-asset.mjs` produced 8 failures per entry. `category: "lut"` was outside the enum, `knobs` was an array of strings, `license.spdx` was null, and `remote: false` still had a `source`, among others. The LUT `meta.json` was replaced by `presets/luts/index.jsonl` as part of the move.

### How to judge a new table

Decide the place by whether a person chooses and copies, or whether code looks the item up by id. The first is `assets/` or `catalog/`. The second is `presets/`. When adding the second here, correspond 1:1 with the path of the code that resolves it, and write that reference in the table's INDEX.md.

## Registering assets you already have (2026-09-22)

`akari-assets add --plan` and `--apply` copy the user's raw files into the library location. Record the origin in the existing tags of meta.json. Do not grow the schema.

| Machine tag | Meaning |
| --- | --- |
| `origin:own` and `origin:site` | A local import, and an import from a site |
| `site:<id>` | A site identifier |
| `folder:<name>` | The folder name that was passed as the import source |
| `license:subscription` | Came from a subscription |
| `pack:<id>` | An asset set. packs.json directly under the library location has the same shape as catalog/packs.json |

A listing splits these into `machineTags` and does not leave them in `tags` for display and search. The origin is decided in this order. A catalog listing (lab), an explicit origin tag (site or own), a source.url from an AKARI distributor (lab), some other source.url (site), and anything else (own). An AKARI distributor is detected by parsing the URL. The host is github.com and the first path segment is AkariLabs, or the host is akari.video or a subdomain of it. During the migration, the previous official host and its subdomains are also accepted. A broken URL counts as site. `CREDIT.txt` in the asset directory is one line of credit text. When that text is present, set `license.attribution_required: true`. When a source is present, set that attribution_required to true as well.

The import default is `license.scope: "private-owned"`, `spdx: "LicenseRef-user-owned"`, `ai_training_allowed: false`, and `price: 0`. Those values store the file as an asset the user already holds. They do not certify the copyright ownership, the commercial permission, or the redistribution right of the asset itself. A site origin keeps the distribution page and the original terms in the source block.

A local import places preview.png in every category. Audio uses an ffmpeg waveform. Video uses the first frame. When ffmpeg is missing or fails, use a deterministic placeholder PNG generated with Node's built-in zlib. A PNG image is a copy of the original image. Other images, font, and scene3d use the placeholder. A still generates a fragment.html that references the image with a relative path. A scene3d generates a fragment.html with a `data-akari-3d-scene` declaration that references the model. Register only when the whole asset, including these files, passes `validate-asset` with exit 0. On a non-zero exit, record the asset in failures and do not keep it. `title` is the original file name with the extension removed.
