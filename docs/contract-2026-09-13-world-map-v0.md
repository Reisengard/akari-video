**English** | [Japanese](./contract-2026-09-13-world-map-v0.ja.md)

# World map v0

## 1. File and schema

The world map lives at the project's `planning/world-map.json`. The Map UI is shown only when this file exists. Public v0 is `schemaVersion: 3`. Later changes are additive only. An old `schemaVersion: 2` file can be normalized to v3 on the CLI read path.

The shared root is `kind`, `worlds[]`, `zones[]`, `cameraStops[]`, `edges[]`, and `retainedNodes[]`. `kind` is `flat` or `spatial`. A flat world has `flat.bounds` and `flat.pattern`. A spatial world has `spatial.c`. A zone is a place inside a world. A cameraStop is a dwell window and a camera position. An edge declares a move or a switch between consecutive stops.

The machine checks these invariants.

1. There is at least one world, and each world has at least two zones.
2. The zone id set and the cameraStop id set match. Stops are in ascending `at`, each has `at < leave`, and the windows do not overlap.
3. The edge count is one less than the stop count. Order, `from`, `to`, `t0`, and `t1` match the stop list.
4. An edge type is `move`, `portal`, or `cut`. A non-move edge requires `via`, `transition`, and an in-range `switchTime`.
5. An edge that crosses worlds has a non-empty `carry`, and that value is a subset of `retainedNodes`.
6. A transition kind is `none`, `dive`, `mist`, `occluder`, `fade`, or `push`. `spatial` forbids `push`.
7. A cut's measured `cover` is at most 0.4 seconds. An unmeasured `null` is a warning in a normal check and an error in a strict check. A portal's cover has no upper bound.
8. A palette entry is 6-digit hex. Flat bounds and the spatial floor size are finite and positive.
9. Consecutive stops inside one world use `move`.

## 2. Camera function

`camera(t)` is a pure function whose only input is the world map. Inside a stop window it returns the declared value. On a move it interpolates between the two stops. On a portal or a cut, time before `switchTime` approaches through `via`, time after it leaves through `via`, and the world switches at the switch instant. The same input time always returns the same value.

## 3. Drawing

A flat world is one Overlay fragment. The canvas layer draws the background, the grid, the far scenery, portals, and cut covers. The DOM sheet layer holds footage and text. Each world is a direct `.akari-world-sheet[data-world]`. A zone is its child `.akari-world-zone[data-zone]`. The sheet itself has left and top 0. A zone's px are world coordinates that do not subtract the bounds origin. The sheet transform is not fixed at authoring time. The runtime sets it from `camera(t)`. Mixed DOM and canvas output uses the rasterize path.

A footage clock starts at `at + delay` on the stop with the same zone id. `delay` is seconds, defaults to 0, and is at least 0. Before arrival the clock stays at 0 seconds.

A zone that contains footage with `role: "background"` is not culled. When `role` is omitted, `vars` keys `world-width` and `world-height` (a `--` prefix is also accepted) still treat the zone as background.

A spatial world is baked deterministically by `akari world build` into `assets/world/world.glb` and a three fragment at `overlays/world.html`. The GLB has `worlds[].spatial.floor`, `background`, `haze`, markers for `zones[].c`, and `TourCamera` and `Tour` clips sampled from `camera(t)` at 60 Hz. The three declaration has `model`, `camera.fromModel: "TourCamera"`, and `animationClip: "Tour"`. It has `fog` and `background` only when the first world has `palette.haze` and `palette.background`. Screen-space 3D props and Captions are separate Overlay items.

## 4. CLI

- `akari world check [--strict] [--migrate] [--json]` checks the schema and the invariants, and can normalize v2 to v3.
- `check --migrate` drops a `cover` that is a label string or `null`, and a `pattern` outside the v3 vocabulary. It normalizes them to finite placeholders and notes that the original value still needs a measurement.
- `akari world build` writes, for flat, the declaration, the sheet, the zones, and resolved footage fragments to `overlays/world.html`. For spatial it writes the world GLB and the three fragment. Both upsert the edit.json `world` item with a stable id. If edit.json is not version 2, the command stops without changes. Run `akari migrate <project-root>` first.
- `akari world preview [--measure]` writes PNG frames and `camera-proof.json` for representative stop and edge times, on the rasterize path, for both flat and spatial. With measure, it samples non-move edges at 30 Hz for a full-cover interval whose per-pixel RGB standard deviation is at most 2, and it writes back only the matching `transition.cover`.
- `preview --measure` does not ask about C7 on entry. After it writes the measured values, it checks every item, including C7.
- `akari world overview` embeds the real `overlays/world.html` fragment in a srcdoc iframe at the same time, and lays out every world in one view that fits them. It has a pink capture frame, the camera path, scene jumps, scale pans, camera follow, and the newest MP4 from `.akari/out` in the right column. Before build it falls back to the floor only. It makes no external requests, it can be opened directly as `file://`, and `--json` returns the output path.
- `akari world move-stop <project-root> --stop <id> --c x,y[,scale] [--json]` updates only a flat stop's coordinates. It does not reformat the original text or change other fields. It writes nothing when the point is outside bounds, the world is spatial, or an invariant would break.

HTML and images from the same input must be deterministic. Footage ids are resolved by the asset resolver. An unresolved id is a failure.

Flat and spatial share this order, run against the project root.

```sh
akari world check . --migrate
akari world build .
akari world preview .
akari world preview . --measure
akari world overview .
```

## 5. Map UI

- Marker detection is centralized on the `akari-shell-strip` ContextKey `akari.worldMap`.
- The Map tab in main is `akari-world-view`. It shows the same HTML that `akari world overview --json` generated, in a webview. There is one draw implementation.
- The timeline world band and the Map inspector are `akari-annotations`.

The Map UI provides a 2D overhead view, the world band, a capture frame that follows the play time, and details for the selected stop or edge. In v1, only a flat stop's coordinates can be written back to `world-map.json` with an Option-drag. The only writer is `akari world move-stop`. It does not write when the point is outside bounds, the world is spatial, or an invariant would break. `world-map.json` sits outside edit.json history, so undo and redo are not supported.

## 6. Production flow

The free built-in skill `akari:design-world` (`skills/design-world/SKILL.md`) owns the path from brief to template to script to `world-map.json` to `akari world`.

A plan and a storyboard declare chapters as worlds. A motion span is processed as `world-map.json`, then `akari world build`, then the Overlay, then Export. The join to live-action spans is limited to portals and cutaway chapters.

## 7. Later additions

Placing generated video on a world zone or edge, syncing a world camera with another Overlay's 3D in world coordinates, and culling a much larger world are outside v0. They are added as backward-compatible extensions.
