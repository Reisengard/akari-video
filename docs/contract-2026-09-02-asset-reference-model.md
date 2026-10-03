**English** | [Japanese](./contract-2026-09-02-asset-reference-model.ja.md)

# Footage reference model v0

The ledger and resolve rules for a shared-library reference.

The library location defaults to `library/` in the workspace. When there is no workspace, the old `~/.akari/assets/` is used. The first line of `akari-assets list` (or `akari assets list`) shows the location actually in use. `<library location>` below means that displayed path. Audio files live under `audio/` there.

- Status: implemented. The machine layer landed on 2026-09-02. Shell UI adoption landed on 2026-09-22 in `task/2026-09-21-library-reference-in-shell`. That covers a reference default on the import flow, a Reference badge on the project face, the Preview and timeline path, and Bundle footage.
- Decided: 2026-09-02
- Implementation: `packages/asset-resolver` (ledger and materialize), `packages/render-cut` and `packages/edit-lint` (resolve)

## 1. Purpose

Copying catalog footage into every project downloads and duplicates the same footage, and the project grows. The file itself lives once in a **per-machine shared library** at `<library location>/<category>/<id>/`. A project can record **only a reference**.

## 2. Design

- **edit.json does not change.** Referenced footage is still declared as the project-relative path `assets/<category>/<id>/<file>`. The reference ledger explains that the file is not inside the project.
- The reference ledger is the project's `.akari/asset-references.json`.

  ```json
  { "version": 0, "references": [ { "id": "<footage id>", "category": "<category>" } ] }
  ```

  `references` are stable-sorted by category, then id, with no duplicates. A reader is tolerant. A missing or broken file is treated as empty. A write is an atomic tmp plus rename. `version` is the ledger's own schema version. It is unrelated to the edit.json version.
- **Resolve rule.** When the declared project-relative path has the shape `assets/<category>/<id>/<rest>`, the project file does not exist, and the ledger has `{category, id}`, resolve falls back through `resolveAssetLibraryRoots().read` in order (the new location, then the old location). The resolved file must be a regular file that passes lexical and realpath containment in that root. An escape such as `..` is refused, fail closed.
- render-cut records a resolved input in the render inputs with `scope: "library"`, an additive record beside the existing `scope: "akari"`. The chosen real root is saved on `library_root` and checked again later. edit-lint does not report a reference it can resolve as missing. A ledger entry whose file is absent is reported missing as "shared library reference, not fetched".
- The source of truth for library-reference resolve is `packages/creator-root/src/library-reference.mjs`. render-cut and edit-lint re-export that module from each `src/library-reference.mjs`.

## 3. CLI

```sh
# Fetch in reference mode. Record the ledger and do not copy. The default is still a copy.
akari-assets fetch <id> --project <dir> --reference

# Bundle footage. Materialize references for hand-off or archive.
akari-assets bundle --project <dir> [--dry-run]
```

`bundle` materializes each ledger reference from the cache into `assets/<category>/<id>/` and removes it from the ledger. An unfetched reference is resolved (fetched). One that cannot be fetched stays on the ledger, and the command reports a partial success with a non-zero exit. The command is idempotent.

## 4. Delivery to the Export engine

The shared delivery server for OSR and GPU receives, as an allow table, every render-cut resolved input with `scope: "library"`. That includes picture, audio, stills, and footage inside an Overlay. The key is the declared path `assets/<category>/<id>/<rest>`, separated by `/`. The value is `{ absolute: <absolute path of the file>, library_root: <chosen root> }`. The delivery side does not search locations and does not resolve from the ledger again.

The ffmpeg plan receives a copy of the edit whose footage path fields are replaced with absolute paths from the same render-input resolution. That covers BGM, SFX, Narration, split audio, and layer-audio inputs, and their duration probes. Cut audio on a picture source uses the capabilities already resolved. A contact sheet reads the exported video. The original edit.json, the declared path used for delivery, and the receipt input path are not rewritten.

Handoff to another process uses `<projectRoot>/.akari/render-tmp/media-references-<render-cut PID>.json`. The table shape is `{ "token": "<token>", "references": { "<declared path>": { "absolute": "<absolute path of the file>", "library_root": "<chosen root>" } } }`. Each render-cut run generates a token with `crypto.randomBytes(32)` as a hex string, sets the same value on `AKARI_RENDER_MEDIA_REFERENCES_TOKEN`, then starts Export. The variable is inherited by the Electron child. On exit, `finally` restores the previous value, or deletes it when it was unset. The token is not written to logs, error text, or render.json.

render-cut creates the file exclusively before it starts the child, and `finally` deletes it when OSR or GPU ends, including a GPU retry that falls back to OSR, on both success and failure. Electron builds the path from the parent PID and reads the file once when the server is created. A parallel run of another CLI does not share the table. An in-process set of paths in use refuses a second run of the same project, including a nested call. An existing table for this PID that is not in the set is treated as a leftover from a crash or from PID reuse. It is deleted, then created again exclusively. The in-use record is cleared when create, Export, or cleanup fails. Tables for other PIDs are not collected.

A file table is not used at all when the environment variable is missing or empty, when the table token is not a string, when the UTF-8 byte length differs, or when `crypto.timingSafeEqual` does not match. An old form with no token, and broken JSON, are treated as an empty table. A launch that does not go through render-cut, such as a standalone CLI, therefore does not deliver an outside file from a table planted in the project. When the delivery API is given an explicit `mediaReferences` argument, that argument still wins. When the table is missing or cannot be authenticated, delivery stays inside the project.

`/media/<declared path>` is checked in this order.

1. A request whose decoded path contains a `..` segment, with either `/` or `\` separators, is 403.
2. A file inside the project wins. Both the lexical path and the realpath must stay inside the project. A symlink escape is 403. A path that is not a regular file is 404.
3. Only when the project has no file, look up an exact key in the allow table. A file that is not in the table is 404 even if it exists under the library.
4. Check lexically that the table file is inside the chosen root, then realpath both the file and the chosen root on every request and check containment again. An escape is 403. A missing file, or a non-regular file, is 404.
5. An allowed file uses the existing file delivery. A normal fetch is 200. A Range fetch is 206.

Required footage that is on the ledger but missing from the location stops with the existing render-inputs or plan-stage error. Do not wait for a 404 from the delivery page before failing.

## 5. Out of scope, for later

- ~~Shell UI adoption (a reference default on the import flow, a Reference badge on the project face, and a Preview-path fallback)~~ Adopted on 2026-09-22. See the status line. What remains is updating the badge on its own when the location changes.
- A UI for shared-cache capacity

Origin: ruling 3 of the footage-panel redesign round on 2026-09-02. The file is the shared cache, the project keeps a reference, and hand-off closes with Bundle footage.
