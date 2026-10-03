**English** | [Japanese](./contract-2026-09-13-extension-kit-v0.ja.md)

# Extension kit v0

Technical contract.

## 1. Definition and layout

An extension kit is a context bundle that adds skills, templates, footage, and docs to the published AKARI Video shell. The existing `akari store install <productId>` expands into this tree.

```text
~/.akari/assets/store/<productId>/
├── manifest.json
├── skills/<skill-name>/SKILL.md
├── templates/<name>.json
├── assets/<category>/<id>/{meta.json, ...}
├── docs/*.md
├── README.md
├── LICENSE.md
└── checksums.txt
```

`productId` is the Store product id. `version` is the product's integer version. The kit license is `LicenseRef-AKARI-Assets-v0`. Each footage item's `meta.json` also has its own `license`.

## 2. `manifest.json`

A manifest with `schemaVersion: 1` is additive only. Example:

```json
{
  "schemaVersion": 1,
  "id": "world-kit",
  "kind": "kit",
  "name": "World kit",
  "version": 1,
  "requires": {
    "cli": ">=0.1.70",
    "runtimes": ["world", "three"],
    "products": ["akari-pop-motion-set"]
  },
  "skills": [{ "dir": "skills/design-world", "name": "design-world" }],
  "templates": [{ "path": "templates/paper-to-browser.json", "for": "world-map", "label": "Paper Map into the browser" }],
  "assets": [{ "category": "overlay", "id": "world-far-bands" }],
  "docs": [{ "path": "docs/world-hen.md", "label": "World chapter, excerpt" }],
  "license": "LicenseRef-AKARI-Assets-v0",
  "provenance": { "author": "AKARI Labs", "source": "example:world-kit" }
}
```

Required fields are `schemaVersion`, `id`, `kind`, `name`, `version`, `requires.cli`, and `license`. In v0, `kind` is only `kit`. `validate-kit-manifest.mjs` also checks skill files, footage metadata, and the template-use vocabulary.

## 3. Install

After the usual entitlement check, zip fetch, checksum check, and extract, `akari store install <productId>` does the following only for a product that has `manifest.json`.

1. Check the manifest and `requires`. A missing CLI or runtime fails closed. A missing dependency product is a warning plus install guidance.
2. Publish `assets[]` as relative symlinks at `~/.akari/assets/<category>/<id>`. Each item is checked with `validate-asset.mjs` before it is linked. The footage files and checksums are also registered in `~/.akari/assets/installed.json`, so a footage id can resolve.
3. Publish `skills[]` as relative symlinks at `~/.akari/kits/plugin/skills/<name>`.
4. Record id, version, install time, extract path, skills, and footage in `~/.akari/kits/installed.json`.
5. `templates[]` are not moved. The CLI lists each extract path and reads that manifest.

A product with no manifest stays a footage product, as before. When a checker or the runtime registry is not in the npm package and cannot be verified, only that check is skipped with a warning. `akari store uninstall <productId>` removes the symlinks and the ledger entry that were recorded. The extract directory stays, so the kit can be installed again.

## 4. Skill discovery

For Claude Code, `~/.akari/kits` is generated as a directory marketplace. `plugin/skills/` is the composed directory of every kit. Its namespace is `akari-kits:`, separate from the built-in `akari:`. Run this once.

```sh
claude plugin marketplace add ~/.akari/kits
claude plugin install akari-kits@akari-kits
```

When `claude` is not on PATH, add `~/.akari/kits` as a marketplace in the Claude Code plugin settings. The SessionStart hook prints this guidance as one line only when an installed kit exists and `enabledPlugins` does not contain `akari-kits@akari-kits`. It does not change settings.

Codex, Cursor, and opencode also compose kit skills into the project's `.agents/.codex/.cursor/.opencode/skills`. A name clash prefers the built-in skill. Where the plugin cannot be used, `~/.akari/kits/plugin/skills/<name>/SKILL.md` can still be read directly.

## 5. App (the extension-kit card on Home)

One extension-kit card sits beside the AKARI Store card on Home. It is hidden when the user is not connected. An installed kit lists id, version, skill names, and footage count, plus enable guidance when the kit is not enabled. A purchased kit that is not installed shows guidance for `akari store install <id>`. An unpurchased kit shows guidance to the Lab product page, including Lifetime pass coverage. The app does not run the command. It only copies text and opens an external browser.

## 6. Updates and version

A kit version is the Store's integer version. `akari store status` shows the installed id, version, skill names, and footage count. The same `akari store install` replaces the kit with a new version.
