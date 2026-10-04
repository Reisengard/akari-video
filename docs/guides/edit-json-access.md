**English** | [Japanese](./edit-json-access.ja.md)

# How the agent reads edit.json

## Rules for AI access (contract §5.2)

1. **Do not Read edit.json / captions.json / motion/*.json in full**. Run `grep -n '"id": "<id>"'` → Read only the matching line → Edit. To see the tree structure, read only the outer structure with a command such as `grep -n '"kind": "group"\|"items": \['`
2. Write through either (a) the edit-store script API (§6), or (b) a direct Edit of the matching line followed by save-time lint (run the write-gate equivalent through the CLI). **The lint gate must run in either case**
3. For a bulk operation (such as “shift captions after 1:00 by 0.5 seconds”), **the AI writes a script** (importing the API from §6). Do not prepare bulk-operation commands in advance
4. When writing motion, use L0 presets / the L2 animator by default (only a few values are needed). Hand-authored L1 keyframes are mainly created by a human in focus mode
5. **Do not create CLI commands for observation or surgery (`akari edit tree` / `move` / `group` …)** (owner decision, 2026-08-30. The file is the API)

## Prerequisite

`edit.json`, `captions.json`, and `motion/*.json` are saved with edit-store's canonical
serialization (contract §5.1: one record per line, beginning with `"id"`). An older file that is
not canonical becomes canonical on its next save.

## Read

Find an item with `grep -n '"id": "<id>"' edit.json`, then Read only the matching line. Read the
tree's outer structure with `grep -n '"kind": "group"\|"items": \[' edit.json`. For a caption,
use `grep -n '"id": "c-0042"' captions.json`.

## Write

- For a point change, Edit the matching line, then run `edit-lint <project>` as the save-time lint
  equivalent.
- For a bulk change, write an `@akari-video/edit-store` script that follows
  `openProject → modify → save()`. See the [README examples (Japanese)](../../packages/edit-store/README.md#%E4%BE%8B),
  [shift-captions-after.mjs](../../packages/edit-store/examples/shift-captions-after.mjs),
  [speed-up-group.mjs](../../packages/edit-store/examples/speed-up-group.mjs), and the read-only
  [tree-summary.mjs](../../packages/edit-store/examples/tree-summary.mjs).

## Inspect

Do not create a command such as `akari edit tree`. To inspect the tree with counts collapsed, run
`node packages/edit-store/examples/tree-summary.mjs <project>`.

## Keep containers small

Keep HTML split into fragments and motion split by group. Keep `captions.json` as one file. If a
container exceeds 1 MB, reconsider splitting it.

## Canonical wording (contract §5.2)

The rules below are the English wording of contract §5.2. The Japanese page keeps the contract text.

1. **Do not Read edit.json, captions.json, or motion/*.json in full.** Run `grep -n '"id": "<id>"'`, then Read only the matching line, then Edit. To see the tree, read only the outer frame, for example `grep -n '"kind": "group"\|"items": \['`.
2. Write through the edit-store script API in §6. Or Edit the matching line, then run save-time lint in the CLI. That lint is the write-gate equivalent. **Either path runs the lint gate.**
3. For a bulk change, such as a 0.5 second shift of captions after 1:00, **the AI writes a script** that imports the §6 API. Do not add bulk commands in advance.
4. When you write motion, use an L0 preset or the L2 animator. A few values are enough. A person in focus mode writes L1 keyframes by hand.
5. **Do not add CLI commands that inspect or edit the tree.** That includes `akari edit tree`, `move`, and `group`. The owner decided this on 2026-08-30. The file is the API.
