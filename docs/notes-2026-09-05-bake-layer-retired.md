**English** | [Japanese](./notes-2026-09-05-bake-layer-retired.ja.md)

# Retirement of bake-layer and ATF caption rendering

Updated: 2026-09-05

## 1. Place

This note records the removal, from what we ship, of the tool set that bakes an ATF caption template in a headless browser. The change does not make an existing `edit.json` unreadable. `kind:"telop"` stays in the schema. **An item that already has `baked` still plays.** The only path that is gone is the path that bakes a new ATF.

There are two reasons.

- Real production had already moved toward overlay HTML. The cost of keeping the ATF runtime, the whole vendor set, and 36 `template.json` files did not match that use. Make the HTML footage that Lab distributes the one source for on-screen text effects.
- `puppeteer` was bundled into the packaged build so the bake could run. Bundling a browser binary hits the distribution size, `postinstall` approval through `allowScripts` and CI `approve-scripts`, and platform verification. Retirement removes all three at once.

## 2. What was removed

| Target | What |
|---|---|
| `packages/bake-layer/` | The whole package. The ATF runtime under `vendor/telop/`, the codemod and port scripts, and the tests. |
| `packages/template-render/` | The whole package. It depended on `puppeteer-core`, but the only caller was that package's own tests, so it was already unused. |
| `presets/telop/` | 36 ATF `template.json` files, plus `index.jsonl` and `INDEX.md`. |
| `apps/shell/package.json` | `bake-layer` and `presets/telop` from `build.extraResources`, and `puppeteer@25.1.0` from `allowScripts`. |
| `bundled-cli-npm-entries.mjs` | `puppeteer` and `esbuild` removed from `BUNDLED_CLI_NPM_ENTRIES`. What remains there is `@webav/mp4box.js` only. |
| `.github/workflows/{release,windows-build}.yml` | `puppeteer` removed from `approve-scripts`. |
| `akari-preview` in the shell | The bake-layer spawn inside `rasterizeTelopPreview`, the entry lookup, `runProcess`, and `nodeCliCommand`. |
| `render-cut` | `BAKE_LAYER_ENTRY`, generation of the caption raster command in `plan.commands.telops`, and the input listing of `presets/telop/**/template.json`. |
| `akari-project` | The `telop` kind on the footage shelf. **The `textstyle`, `textanim`, and `lut` shelves stay as they are.** |
| `scripts/ci/run-unit-tests.mjs` | `template-render` removed from the `pure` lane, and `bake-layer` removed from the `media` lane. |

**What stayed.** Do not remove the staging into `resources/cli-node-modules`. `@webav/mp4box.js` is required by a runtime import in `gpu-export`. At v0.1.25 a missing bundle made packaged `--engine gpu` fail, and that failure is on record. The entry list only dropped `puppeteer` and `esbuild`. Keep `esbuild` itself. The Theia build in `apps/shell`, `bundle-frame-engine.mjs`, the drift check, and each package's build script use it, so leave `allowScripts` and CI `approve-scripts` in place for it. The line is that `esbuild` is for build time and is not a runtime import of the CLI.

## 3. How `kind:"telop"` is treated, for compatibility

`itemSourceTelopV2` in `packages/schemas/edit.schema.json` is **unchanged**. The branch is whether `baked` is present.

| Layer | No `baked`, not yet baked | Has `baked` |
|---|---|---|
| schema | Passes. The structure is unchanged. | Passes |
| `edit-lint` | **Error `telop.retired`** | Passes |
| `render-cut` | Even if `--force` skips lint, `renderItemDeclaration` throws an explicit error. The message starts with `telop.retired: <id>:`. It does not draw an empty frame and stay quiet. | Copies onto a `kind:"baked"` layer, as before |
| Preview, the shell | The existing placeholder shows a retired card, with `retiredTelop: true` and `data-akari-deferred-state="retired"`. It does not send a raster request. | Plays the `.preview.webm` sidecar, as before |
| Timeline and inspector | The item can still be shown and selected. Recognition is unchanged. | Same as the cell to the left |

`edit-lint` reports check `telop.retired`. The message says that ATF caption rendering is retired, tells you to replace the item with the HTML footage captions that Lab distributes, and says an item that already has `baked` still plays. The wording in the program is the Japanese string. This note states what that string says.

The RPC boundary `rasterizeTelopPreview` stays for old clients and throws `telop.retired:`. A call does not start a draw process.

## 4. The replacement, the HTML footage build

On-screen text effects that correspond to the 36 ATF templates is prepared **as HTML footage in the internal repo and distributed through the Lab path**. This repo is the public repo. It distributes references only and does not hold the binaries, so a reference table like `presets/telop/` does not come back. Check the license of a piece of footage in that footage's `meta.json`. Check the license of a font used for rendering in `catalog/font/<id>/meta.json`. See [skills/edit-plan/expression-selection.md](../skills/edit-plan/expression-selection.md).

## 5. Out of scope

- **`puppeteer-core` in developer tools.** `packages/akari-tools`, the helpers for analyze-footage and critique-cut, the `kaisetsu-short` example, and the overlay-runtime test harness are outside this retirement. They run on a developer's machine. They are not the shipping build, not `extraResources`, and not the packaged app. They do not hit the bundled-browser problem.
- **The bake rail itself.** The composite path that stacks an alpha video onto `layers[]`, and picture-in-picture as `kind:"video"`, stay. What retired is only the side that bakes ATF into `baked`.
- **`textstyle`, `textanim`, `luts`, and `word-book`.** The other reference tables under `presets/` are unchanged.

## 6. Where a historical reference remains

Comments that point at a removed implementation **as history** stay. That includes where an encode setup came from. Examples are the alpha ProRes setup in `packages/akari-tools/src/eye-bar/bar-asset.mjs`, and the note of removed entries and why they were removed in `apps/shell/resources/scripts/bundled-cli-npm-entries.mjs`. This retirement does not exist to erase the decision record. Those comments link here so a live reference is not confused with a historical one.

Do **not** rewrite `akari:presets/telop/...` references that remain in observation records under `apps/shell/extensions/akari-annotations/evidence/`. Evidence is immutable primary information. It keeps the fact that the path observed at the time was that path.

"Convert to captions" was removed as a GUI action on 2026-09-21. The `kind:"telop"` container, and playback of `baked`, stay for compatibility.
