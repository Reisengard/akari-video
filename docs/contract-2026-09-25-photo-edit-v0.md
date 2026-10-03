**English** | [Japanese](./contract-2026-09-25-photo-edit-v0.ja.md)

# Non-destructive photo edits v0

A photo edit is declared on an `edit.json` v2 media item. Strokes and the adopted mask are tied to footage coordinates after EXIF orientation is corrected and before crop.

## Stored form

- `mask` is a `sources[].id`. A still points at an 8-bit gray PNG where white is shown and black is transparent. A video points at the existing grayscale video.
- The adopted mask is written to `assets/masks/<sha256>.png` and is not overwritten. The sibling `.meta.json` records `inputSha256`, `engine`, `request`, `os`, `parameters`, `createdAt`, `width`, and `height`.
- `erase` is an ordered array of strokes. Each stroke is `{ mode: "erase" | "restore", points: [[x, y], ...], size, hardness }`. A point uses coordinates where the footage width and height are 1. `size` is the diameter as a fraction of the short side. `hardness` is 0 to 1.
- `flip` is `{ h?: boolean, v?: boolean }`. It is applied after crop, in the map from footage to the screen.
- `crop` is the existing `{x, y, w, h}` in 0 to 1 coordinates on the EXIF-corrected footage, plus optional `rotate`. `rotate` is -45 to 45 degrees of clockwise photo correction. The footage rotates around the crop window center, and the window cuts after that rotation. This is independent of placement `transform.rotate`. A pixel the window reads outside the footage is transparent. Aspect-ratio choice is edit-UI state. The saved value expands to the window's four numbers only.
- A photo `frame` is `{ stroke?: { color: "#RRGGBB", width: 0..100 }, cornerRadius?: 0..100 }`. Stroke width is px at a 1920 px output width, and it scales with output width. The stroke is drawn inside the visible edge. `cornerRadius` is a fraction of half the short side. The corner is a true circle in the size after scale. When the field is omitted, there is no stroke and no rounded corner.
- The composed raster is a cache that can be deleted. It is not the saved source of truth. Reload and Export rebuild from the PNG and the declaration.

## Process order

The order is fixed: **color, then mask, then eraser strokes, then crop, then flip, then finish**. Color applies the image-wide item `adjust` first, then stacks `regions` correction, blur, and filter in array order. The mask includes background removal and `maskFeather`. Crop includes `crop.rotate`. Finish is the photo `frame` (stroke and corner radius).

## Composite

`composeStillMask` composites each stroke in listed order with integer math. With no mask, the initial value is 255 across the frame. An erase stroke moves toward transparent. A restore stroke moves toward visible, capped by the original image alpha. Loading a mask does not convert color. The image, the mask, and the strokes are read in the same footage coordinates. Crop, including rotation, and flip run after that. Stroke and corner radius apply to the visible edge of the window after flip, and they keep mask and eraser opacity.

## Remove the background on the device

A supported Mac uses an Apple Vision foreground instance. An older macOS uses person segmentation. Inference output is saved as a settled PNG. A result is not applied when the footage hash or the item id has changed. When the helper is unavailable, the app continues and shows "Not available on this Mac". Playing a saved PNG needs neither the helper nor a network.

## Background removal and region layers

- `maskFeather?: number` is mask-edge softness in footage pixels, from 0 to 100. `composeStillMask` blurs the mask, then stacks `erase` strokes in order. The default is 0.
- `regions?: [{ id, name?, maskRef, invert?, enabled?, adjust?, filter?, blur? }]` is an ordered array on a still media item only, with at most 32 entries. `id` is unique inside the item. `name` is a non-empty display name taken from a candidate. When it is omitted, the UI shows "Region" plus a number. `maskRef` is a `sources[].id` that points at an 8-bit gray PNG with the same orientation and size as the original photo. `invert: true` uses the other side of the mask. `enabled: false` keeps the values and stops drawing. `adjust.basic` is exposure, contrast, saturation, and color temperature. `blur` is 0 to 50 pixels. `filter` is `{ lut: id, intensity?: 0..1 }`. The id and the screen name match the existing LUT shelf.
- Image-wide correction stays on that same item's `adjust`. Color and Edit photo share this image-wide value. There is no second image-wide correction. `output.look` is a separate whole-video setting, and this window does not change it. Region correction runs after the image-wide correction, in `regions` array order.
- The first use of a region preset LUT copies it to `assets/luts/photo-region/<id>.cube`. Draw treats that copy as the immutable reference. The original `presets/luts` is not changed. When the adopted mask and LUT are present, playback and Export can be rebuilt after the inference cache is deleted.

## Candidates and settled files

Vision "Auto" returns the whole foreground and one candidate per subject. "People only" returns all people and one candidate per person. A candidate display name is only a number, such as "Person 1" or "Subject 1". It is not a name guessed from the photo. Candidates live in `.akari/cache/photo-masks/<input SHA-256>/`. Only a candidate the user adopts, or the composite of the selected candidates, is settled to `assets/masks/<PNG SHA-256>.png` and the sibling `.meta.json`. Several candidates composite by the per-pixel maximum. "Not a person" settles the inverse. meta keeps the source footage hash, engine, request, OS, parameters, time, and dimensions.

Click split uses Apple's distributed SAM 2.1 tiny Core ML float16 models (image, point, and mask, about 79.7 MB total). The source is [Apple's model card](https://huggingface.co/apple/coreml-sam2.1-tiny). The license is Apache-2.0. The app does not bundle the models. On first use it fetches the three `.mlpackage` files from the model card into `~/Library/Caches/AKARI Video/photo-models/sam2.1-tiny/`, and it puts the compiled `.mlmodelc` under `compiled/` there. To place them ahead of time, keep each `.mlpackage`'s `Manifest.json`, `Data/com.apple.CoreML/model.mlmodel`, and `Data/com.apple.CoreML/weights/weight.bin` in that same layout. The helper process loads each model once with `.cpuAndGPU` only. After a photo is selected it prepares features. A click runs the point model and the mask model. The image encoder receives a PNG with EXIF orientation applied. The conversion to the 1024 input required by the image constraint, and the click position in 0 to 1 times 1024, use the same footage coordinates. The 256-pixel logits are bilinear-scaled to the original photo size, then binarized at 0. The three candidates can be chosen by area as Narrow, Middle, or Wide. Hover only displays a PNG that was already produced. On a Mac where fetch or inference is unavailable, editing continues and the UI shows "Not available on this Mac".

Returning a candidate and adopting a candidate both check item id, footage id and URI, source footage SHA-256, and the edit version. A result that arrives after a replace, a delete, or an edit in between is not written.

## Crop analysis

"Auto level" for crop takes an angle from on-device horizon detection. When none is found, the angle is 0 degrees. "Smart crop" prefers the centroid and bounding box of the foreground instance mask, or person segmentation on a Mac that does not support instances. It uses a saliency region only when that mask is unavailable. It keeps the chosen aspect ratio, grows the window until it holds most of the subject, and shifts the centroid toward a rule-of-thirds vertical line. Neither analysis saves a raster. Only the settled `crop` is written to edit.json.
