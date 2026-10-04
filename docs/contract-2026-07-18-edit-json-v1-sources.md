**English** | [日本語](./contract-2026-07-18-edit-json-v1-sources.ja.md)

# edit.json v1 multi-source contract

- Date: 2026-07-18
- Status: implementation contract
- Scope: `sources[]` and `cuts[].src` in `edit.json`, and sidecars that anchor a time in source seconds

## 0. How version is used

**A file that uses `sources[]` is `version: 1`.** `cuts[]` changes meaning. It stops being the keep-ranges of one footage item and becomes a clip list that names the footage. That is a structural change. Rejecting an unsupported version in the open is safer than letting an old consumer silently assemble a different picture.

The single `source` form at `version: 0` stays legal permanently. A reader supports both v0 and v1. A writer that handles only one source may stay on v0. `source` and `sources[]` are exclusive. Having both is invalid.

## 1. v1 schema

```jsonc
{
  "version": 1,
  "output": { "width": 1920, "height": 1080, "fps": 30 },
  "sources": [
    { "id": "s1", "path": "assets/intro.mp4", "proxy": null },
    { "id": "s2", "path": "assets/main.mov", "proxy": "cache/main-720p.mp4" }
  ],
  "cuts": [
    { "src": "s1", "in": 0.0, "out": 4.2 },
    { "src": "s2", "in": 12.0, "out": 45.5 },
    { "src": "s1", "in": 60.0, "out": 65.0 }
  ]
}
```

### Field rules

| Field | Rule |
|---|---|
| `sources[].id` | A non-empty string, unique in the file. Prefer the sequence `s1`, `s2`, and so on. |
| `sources[].path` | A path relative to the directory that contains edit.json, or an absolute path. |
| `sources[].proxy` | `null`, or a proxy path for that source. |
| `cuts[].src` | Required on v1. It references a `sources[].id`. |
| `cuts[].in`, `cuts[].out` | Seconds in the referenced source. `0 <= in < out`. |

`sources[].proxy` is produced to the preview-proxy format. That format is section 5.5 of `contract-2026-08-02-preview-parity.md` (Japanese).

In the v2 preview, `sources[].proxy` is an optional optimization. When it is declared, the preview uses it by default, and startup is faster. When it is not declared, `VideoDecoder.isConfigSupported` checks what the host can decode, and the preview reads the original directly. When the host cannot handle the original, preview-server generates a proxy to the same format.

References use a stable `id`, not a path. Replacing footage, or changing a path, then does not break a cut or a sidecar reference. JSON Schema is a tolerant reader for future optional fields. It checks the types of known fields, the required shape of each version, and the exclusion between `source` and `sources[]`.

## 2. How the timeline is derived

The output timeline is `cuts[]` joined in array order with no gaps. v1 allows the same `src` to appear again, and it allows any order. Inside one `src`, v1 does not require `in` to ascend, and it does not require cuts to be disjoint.

An empty or missing `cuts` on v1 means an empty timeline. The existing v0 meaning, where an empty or missing `cuts` means the whole footage item, does not change. A gap entry for black or for a pause is reserved for a later extension. v1 does not define it.

## 3. Coordinates and a one-to-many projection

A source-second anchor becomes the pair `(src, source seconds)` once there is more than one source. The same source range can appear more than once on the timeline, so the map from source seconds to timeline seconds is one-to-many.

**Persist captions, annotations, and analysis results as `(src, source seconds). Do not persist the timeline seconds you got by converting them.** On each display and on each export, project onto timeline seconds from the `cuts[]` of that moment. Rearranging a cut, or reusing the same range, then cannot drift from a time that was baked in.

Overlay `start`, BGM, and sound effects stay in output-timeline coordinates, as before. They are outside this source-second rule.

## 4. What changes in sidecars

- `items[]` in `captions.json` may have `src`. The value references a `sources[].id`. Together with `start` and `end`, it is a source coordinate.
- `annotations[]` in `review.json` may have `src`. The value references a `sources[].id`. Together with `sourceT` or `sourceRange`, it is a source coordinate.
- Omitting `src` means single-source compatibility.
- Caption overlap (`captions.overlap`) and caption order (`captions.order`) are judged per `src`.
- A row with `time_domain: "output"` is placed text. Overlap and order checks skip it (decision of 2026-09-22). It is a placed object, so any number of them may share a time.

An analysis sidecar stays one file per footage item. Its structure does not change. A reference resolves `src` to the source path.

## 5. Mechanical conversion from v0 to v1

A version bump is paired with the conversion below. The agent runs it. Show the target and the diff, get explicit approval, then run it. Silent migration is forbidden. Keep unknown fields.

1. Create `sources = [{ "id": "s1", "path": <old source.path>, "proxy": <old source.proxy> }]`.
2. Set `"src": "s1"` on every `cuts[]` element. When v0 `cuts` is empty or missing, create `[{ "src": "s1", "in": 0, "out": <footage duration> }]`.
3. Delete `source` and set `version` to `1`.

If the footage duration cannot be read and step 2 cannot build the full-length cut, stop and report that. Do not guess a conversion.

## 6. Degradation

| Situation | Behavior |
|---|---|
| v0 single `source` | Read and write it as before. |
| A v1 `cuts[].src` is not a `sources[].id` | Ignore that cut and warn. Continue with the other cuts. |
| `source` and `sources[]` are both present | Lint error. The reader prefers `sources[]` and warns. |
| `sources[].path` does not exist | Preview shows a missing-media state and warns. Export stops with an error. |
| `version` is greater than 1 | Do not guess, validate, or convert. Fall back to read-only. |

For a newer version the reader does not support, report honestly that the file uses a newer format and that the skill or the app needs an update. Do not pick out the known fields and treat the file as the old format.

## 7. Who checks what

`edit.schema.json` checks the v0 and v1 structure. `validate-edit.mjs` and edit-lint also check what JSON Schema cannot express: unique `sources[].id`, `cuts[].src` references that resolve, and `in < out`. edit-lint keeps the existing v0 checks for cut order, overlap, and footage duration. On v1 it treats array order as timeline order and does not restrict that order.
