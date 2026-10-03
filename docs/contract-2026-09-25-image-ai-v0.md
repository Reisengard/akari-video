**English** | [Japanese](./contract-2026-09-25-image-ai-v0.ja.md)

# Image AI v0

## Settings and secrets

- Image AI in Settings is one service and one key. The prototype default service is `fal`. One call site, `imageAi.provider`, can be swapped.
- The dedicated key is `AKARI_IMAGE_AI_FAL_KEY`. When the Narration `FAL_KEY` is already registered, the user can choose Use the same key. That choice is stored as `AKARI_IMAGE_AI_USE_NARRATION_KEY=1`. Saving a dedicated key clears the shared choice.
- Both keys use the existing `credentials.env` save path. Only the node side reads a key. The key is not passed to the renderer, `edit.json`, provenance files, or logs.
- Check connection sends a real GET to a read-only fal API and decides from the HTTP response. A non-empty key alone is not success.

## Call site and models

`ImageAiService` exposes `upscale(input)` and `generateBackground(input, mask?)`. Provider code stays behind `ImageAiProvider`. v0 ships one provider, fal.

| Tool | fal model id | Input | Status |
|---|---|---|---|
| Upscale | `fal-ai/clarity-upscaler` | `image_url`, `upscale_factor: 2` | Available |
| Generate background | `fal-ai/flux-pro/v1/fill` | `image_url`, `prompt`, `mask_url` | Call site only. The screen says Soon |

The [official API reference](https://fal.ai/models/fal-ai/clarity-upscaler/api) for the upscale model gives the id, the inputs, data URIs, and the queue API above. The listed price on the [official model page](https://fal.ai/models/fal-ai/clarity-upscaler) is $0.03/MP. The on-screen estimate uses a 2× scale, which makes the output pixel count 4× the input. Background generation follows the mask-required [official API reference](https://fal.ai/models/fal-ai/flux-pro/v1/fill/api). Prices can change, so the screen labels the figure as an estimate.

## Upscale states

1. The user selects a photo item and opens Upscale. The node side reads the target id, the source footage SHA-256, the target declaration's version, and the image byte size and dimensions. It also looks for saved alternatives in `assets/generated/*.meta.json`.
2. Before send, the screen shows image dimensions, file size, the destination, and the price estimate. Send stays disabled when the key or the image dimensions cannot be checked. When the key is missing, the screen shows Open settings.
3. An explicit action sends the job to the fal queue. The user can cancel while it runs. Cancel stops the local wait. When the queue returns a cancel endpoint, cancel also calls that endpoint. Cancel does not promise a refund after processing has started.
4. A successful result is saved at `assets/generated/<sha256>.<ext>`. The sibling `<sha256>.<ext>.meta.json` records provider, model, `item_id`, operation kind, input SHA-256, the edit version limited to the target, parameters, and created time. Files are not overwritten. The result's temporary URL is not saved.
5. The result is offered on the selected item as an alternative. After a reload, a saved alternative is offered again when `item_id`, the current footage input SHA-256, and the target-only edit version still match. An existing alternative is not sent again. Use this alternative adopts it. `source` is replaced only at adopt time. The original footage remains. One undo restores this edit.

The edit version hashes only the target item's `id` and `source`, plus the referenced `sources` row. An unrelated edit, such as moving another clip, does not block adoption. Before adoption, the target id, the original footage hash, and this limited version are checked again. An alternative that went stale because the target was replaced or deleted is not applied on its own. On failure, the screen shows billing uncertainty where it is known, a retry, and Open settings when the key is invalid.

The saved image format and the edit declaration do not depend on the service. The service name remains only on the provenance `provider`. On-device image edits do not require this key.
