**English** | [Japanese](./contract-2026-08-02-creator-root-v1.ja.md)

# creator-root-v1 (workspace) contract

The library lives in the workspace `library/` by default. When there is no workspace, use the previous `~/.akari/assets/`. Confirm the real location on the first line of `akari-assets list` (or `akari assets list`). `<library location>` below means that reported place. Audio goes in `audio/` under it.

- Date: 2026-08-02
- Status: **v1 draft. Needs owner review.** The design direction was approved by the owner on 2026-08-02. The decision basis and the source research stay in a private internal record.
- Depends on `contract-2026-07-25-project-structure-v0.md` (the placement rules **inside** a project. This contract defines the **layer above** that, and does not touch the inside of a project), `contract-2026-07-25-memory-connection-v0.md` (§7 answers the deferred ruling in §2 of that contract), and `contract-2026-07-17-data-contract-versioning.md` (the canonical three principles of versioning).
- Scope: the layer above a project (one video). Structure, ownership, birth (the first-run flow), portability, per-OS placement, and intake of an existing project for the **workspace (CreatorRoot)**.
- Out of scope: the contents of the channel-design interview (the process that generates design.md), the call shape from an external agent (door), and extension to a text outlet. Each of those is a future separate contract (§10).

## 0. Place in the system

Add exactly one layer above a project, the **workspace**. The workspace is **one visible folder** that holds all of one creator's data: projects, footage, settings, and memory. It is separate from the app itself and from machine settings. An update may replace the whole app. The workspace **must never be destroyed**.

## 1. Terms (fixed)

| Term | Meaning |
|---|---|
| **Workspace** (UI term) = **CreatorRoot** (design term) | The root folder that holds all of one creator's data. One creator means one workspace. |
| Orphan project | A project born outside a workspace. **The invariant is that new ones are not created** (§6). |
| Adoption | Move an existing orphan project into the workspace `videos/` and take it in (§8). |
| Trial mode | Run a project alone, with no workspace. Behavior is guaranteed, but features that assume a root are off (§9). |

## 2. Three places. Separate the app from the data

AKARI Video may occupy only the following **three** places on a machine.

| Place | macOS | Windows | Who touches it | On update |
|---|---|---|---|---|
| The app itself (engine and bundled files) | `/Applications/` and the same family | `%LOCALAPPDATA%\Programs\` and the same family | Nobody edits it | Replace the whole thing |
| Machine state and settings | Inside `~/.akari/` (`AKARI_HOME` may override it). `credentials.env` lives here too | Same, rooted at `%USERPROFILE%` | The app only | Keep |
| **Workspace** | Default `~/Akari/` (revised 2026-08-08. The old default was `~/AkariVideo/`. See §11) | Default `%USERPROFILE%\Akari\` | A person and an agent, under the ownership in §4 | **Do not destroy it** (migration only) |

- Line machine state up under `~/.akari/` (update cache, connection markers, the portable Node runtime, `credentials.env`, and the rest). Do not add a new hidden place.
- Rule: machine state does **not hold the user's contents** (works, footage, memory). The exception of the old audio library was recovered by the migration on 2026-09-21. Footage moved to the workspace `library/`, and `library-location.json` in machine settings pins the location. A machine with no workspace, and a sync folder, are not moved.
- **Secrets (API keys and tokens) live only in machine settings.** The workspace is visible, backed up, and a sync target, so do not mix secrets into it.
- Three Windows implementation notes. (a) Do not put the default workspace under Documents. OneDrive Known Folder Move would pull video footage in. The default is directly under home in order to avoid that. (b) `.akari/` is visible in Explorer even as a dot name, so set the hidden attribute. (c) The 260-character path limit. Keep project names and channel names short. Do not assume long paths.
- Keep an install path for the app that does not need administrator rights (the existing install.sh and the bundled shell).

## 3. Canonical workspace layout (`creator-root/v1`)

```
<workspace>/
├── akari.md                       # Constitution (rules and preferences). First run generates a stub.
├── CLAUDE.md                      # Bridge. Points at akari.md and design.md. First run generates a stub.
├── AGENTS.md                      # Bridge. Points at akari.md and design.md. First run generates a stub.
├── channels/
│   └── <channel>/
│       ├── .akari/memory/word-book.json # Optional. Channel word book (word book v0 contract).
│       ├── design.md              # Channel design doc (optional. The generation process is out of scope).
│       └── videos/
│           └── <project>/         # A video project. The inside stays project-structure-v0.
├── library/                       # Footage shared by the workspace (not tied to one project).
├── inbox/                         # The person's drop inlet (untrimmed shots and notes).
└── .akari/
    ├── root.json                  # Workspace manifest (version, channel list, creation date).
    ├── connections.json           # Workspace defaults for provider, model, and cost-approval policy.
    ├── memory/                    # Style learning and memory (the default memory-connection target in §7, plus word-book.json).
    └── cache/                     # Regenerable files.
```

- `CLAUDE.md` and `AGENTS.md` are not the Schema layer. They are bridge documents only. They do not copy the contents of `akari.md`.
- `root.json` requires the key `{"schema": "creator-root/v1", ...}`. **The file's presence means that folder is a workspace.** It is both the marker and the manifest.
- A layout change follows the three versioning principles and ships as `creator-root/v2`. If a workspace is newer than the version the app supports, the app **refuses to read it and does not destroy it**. Do not pretend at forward compatibility.
- When no channel has been designed yet, generate one default name automatically (for example `my-channel/`). The factory runs on defaults even if design.md is empty.

## 4. Four ownership layers (who may write)

| Layer | Artifact | Drafts | Confirms | Rule |
|---|---|---|---|---|
| Schema | `akari.md`, `design.md` | The agent (drafted in dialogue) | **Human approval** | Do not rewrite without approval |
| Wiki | Plans, reports, indexes | The agent | The agent | May maintain and update |
| Raw | `inbox/`, and `assets/` inside a project | A person | A person | **The app and the agent do not write** (a copy through the import UI is allowed) |
| Generated | All of `.akari/` | The machine | The machine | Keep it regenerable. Do not assume a hand edit |

## 5. Birth. The first-run flow

**The app creates the workspace.** Do not build a flow where the user digs the folder by hand.

1. **Connection.** Log in to the LLM, or set a key. The save location is machine settings. Use through an external agent (door, a future contract) may skip this step.
2. **Place.** Ask only one question: "Where should the workspace be created?" The default is `~/Akari/` (revised 2026-08-08. See §11).
3. **Generate.** Generate the layout in §3. `akari.md` is a stub. There is no design.md. **Video making can start at the moment generation finishes.** Do not insert an extra step such as an interview.

- Steps 2 and 3 are one step in the experience (confirm, then generate). The whole three steps take a few minutes. The only input is confirming the place.
- If an existing workspace is found (`root.json` detected), skip generation and open it. If several are found, ask the person to choose, and record the last opened workspace in machine settings.

## 6. Invariants (hold no matter how the implementation changes)

1. **Do not create an orphan project.** When the app or a skill creates a new project, the destination is always `channels/<channel>/videos/` of the open workspace.
2. **Raw is unchanged.** The app and the agent do not write into `inbox/` or into `assets/` inside a project.
3. **No secrets mixed in.** Do not write credentials into any file in the workspace.
4. **Portability.** A workspace is self-contained as one folder. Move or copy the whole folder and it opens on another machine. Do not write an absolute path that points outside the workspace as the canonical value inside a workspace file. If such a path is written, treat it as Generated-layer cache, so deleting it still allows regeneration. The exception is the external-connection declaration in §7. That is an explicit declaration of an external reference, not cache.
5. **An update does not destroy it.** An app update writes nothing into the workspace except a migration. A migration runs only explicitly, after reading the version in `root.json`.

## 7. Answer to the deferred ruling in memory-connection v0

`contract-2026-07-25-memory-connection-v0.md` §2 deferred the base directory for a persistent place outside a project (`~/.akari-video/` or `~/.akari/`). This contract rules as follows, and **replaces** that deferred item in §2 of that contract.

- **Do not put the user's contents** (the memory and style-learning artifacts) **in a hidden directory**. The default place is the workspace `.akari/memory/`.
- The answer to "which base directory" is **neither**. The base for user contents is the workspace. The hidden side (`~/.akari/`, the existing place for machine state) holds machine state only. Do not create `~/.akari-video/`.
- The connection-declaration mechanism (`connections.json`) is unchanged. A declaration that points at an external path, such as one's own wiki, is still allowed. **Only the default** changes, from "an external path" to "this workspace's `.akari/memory/`".

## 8. Adoption. Taking in an existing project

- A project is self-contained under project-structure-v0, so intake is **a folder move only, with no conversion**. The default is a move, not a copy. Do not leave the original in place.
- At intake the app may do only three things. (a) Move into the destination `channels/<channel>/videos/`. (b) Update the project list in `root.json`. (c) A damage check (confirm the project marker, the same criterion as the launcher's scaffolded check). It does not touch files inside the project.
- The intake flow must be possible from both CLI and GUI. The implementation shape is out of scope.

## 9. Trial mode (running with no workspace)

- Running a project alone, with no workspace, **still has its behavior guaranteed**. That covers an existing user, a temporary use, and verification.
- Features that assume a workspace may be off. That includes a cross-project dashboard, the default save for style learning, and the workspace library. In trial mode the app **may offer** to create a workspace. It does not force it.
- A project created in trial mode must still be adoptable later (§8).

## 10. Out of scope (future separate contracts)

- Turning the channel-design interview (the process that generates and updates design.md) into a product feature.
- The call shape from an external agent (door): a CLI, headless, or one-turn execution mouth.
- Extension to a text outlet (`persona/`, `outlets/`. A candidate for creator-root/v2).
- An equivalent Windows installer.
- Detail of the workspace dashboard UI (handled on the implementation-contract side of the home flow).

## 11. Revision history

- **2026-08-08 (task workspace-default-akari).** §2 and §5 change the default path of a new workspace from `~/AkariVideo/` (Windows: `%USERPROFILE%\AkariVideo\`) to `~/Akari/` (Windows: `%USERPROFILE%\Akari\`). Reason: match the naming ruling. The umbrella is AkariLabs, the product is AKARI plus a capability, and the home of the data is `~/Akari`. A workspace is identified by the presence of `root.json` plus the `~/.akari/creator-root.json` pointer, not by the folder name, so an existing `~/AkariVideo` workspace keeps working with no change. §3 and §6 item 1 stay invariants.
