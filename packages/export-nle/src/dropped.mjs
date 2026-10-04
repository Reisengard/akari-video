// 交換形式に移せないフィールドの棚卸し。黙って落とさない（no silent caps）。
// entry: { field, reason, hint } — report と CLI 出力の両方で使う。

export function collectBaseDropped(model) {
  const dropped = [...(model.unsupportedItems ?? [])];
  const push = (field, reason, hint) => dropped.push({ field, reason, hint });

  if (model.bgm?.ducking) {
    push(
      "audio.bgm.ducking",
      "sidechain ducking runs at render time and has no exchange-format equivalent",
      "Set ducking on the BGM track by hand in the destination (Premiere: Essential Sound / Resolve: Fairlight)",
    );
  }
  if (model.master) {
    push(
      "audio.master",
      "loudnorm / denoise run at render time and do not transfer to an exchange format",
      "Use the destination loudness normalization (about -14 LUFS)",
    );
  }
  if (model.output?.look?.lut) {
    push(
      "output.look",
      "LUT application has no interop form in an exchange format",
      `Apply the .cube from presets/luts by hand in the destination (lut: ${model.output.look.lut})`,
    );
  }
  for (const source of model.sources) {
    if (source.chroma_key) {
      push(
        `sources[${source.id}].chroma_key`,
        "chroma-key parameters (similarity/blend) use ffmpeg vocabulary and are not compatible with an NLE",
        "Set the destination keyer by hand, or bake the alpha and then import",
      );
    }
  }
  for (const layer of model.layers) {
    if (layer.chroma_key) {
      push(
        `items[${layer.id}].chroma_key`,
        "a layer chroma key does not transfer to an exchange format",
        "Set the destination keyer by hand",
      );
    }
  }
  if (model.direction) {
    push(
      "direction",
      "effect declarations (preset/intensity) are AKARI-specific and have no exchange-format equivalent",
      "Refer to a rendered output, or rebuild the effect in the destination",
    );
  }
  return dropped;
}
