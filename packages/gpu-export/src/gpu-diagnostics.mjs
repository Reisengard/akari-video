// ハードウェア H.264 エンコーダが使えなかったときの日本語 1 行（gpu 契約 §8.1 / osr 契約 §11.7 裁定 10）。
// 「どの GPU に載ったか・なぜ切り替えなかったか・次に何をするか」を 1 行・改行なしで伝え、末尾に元の英語エラーを添える。
// render-cut は `render-cut execution error: <この 1 行>` を stderr の最終行に出すので、shell のバナーはそのまま拾える。

export const HARDWARE_ENCODER_UNSUPPORTED_MARKER = "WebCodecs H.264 config is unsupported";
export const GPU_DIAGNOSTICS_MARKER = "AKARI_GPU_DIAGNOSTICS:";
const UNKNOWN_GPU = "Unknown GPU";

export function describeHardwareEncoderFailure({ adapters = null, renderer = null, gpuPreference = null, cause = null } = {}) {
  const rendererName = rendererString(renderer);
  const preference = gpuPreference && typeof gpuPreference === "object" ? gpuPreference : {};
  let body;
  if (!adapters || typeof adapters !== "object") {
    // f. devices が取れなかった: renderer 文字列だけで e 相当
    body = `This GPU (${rendererName ?? UNKNOWN_GPU}) has no hardware H.264 encoder. Rerun with --engine osr (GPU info was not available)`;
  } else if (!adapters.hybrid) {
    // e. hybrid でない
    body = `This GPU (${adapters.active_device ?? rendererName ?? UNKNOWN_GPU}) has no hardware H.264 encoder. Rerun with --engine osr`;
  } else if (adapters.active_is_high_performance) {
    // d. dGPU に載ったのに unsupported
    body = `The high-performance GPU (${adapters.active_device ?? rendererName ?? UNKNOWN_GPU}) is active, but its hardware H.264 encoder does not respond. Update the GPU driver, or rerun with --engine osr`;
  } else {
    const activeDevice = adapters.active_device ?? rendererName ?? UNKNOWN_GPU;
    const prefix = `The hardware H.264 encoder is unavailable. The export process is running on the integrated GPU (${activeDevice}). `;
    if (preference.reason === "user-preference-respected") {
      // a. 利用者が省電力に固定している
      body = `${prefix}Windows Graphics settings pin this app to power saving, so AKARI did not switch automatically. Switch it to high performance, or rerun with AKARI_EXPORT_GPU_PREFERENCE=force (render-cut --gpu-preference force)`;
    } else if (preference.reason === "policy-off") {
      // b. 自動切替が off
      body = `${prefix}Automatic switch to the high-performance GPU (${adapters.high_performance_device ?? UNKNOWN_GPU}) is off. Rerun with AKARI_EXPORT_GPU_PREFERENCE=auto`;
    } else if (preference.applied === true) {
      // c. 書いたのに iGPU
      body = `${prefix}AKARI wrote the GPU setting (${preference.executable ?? "executable"}) but Windows did not apply it. Set this executable to high performance in Windows Graphics settings`;
    } else {
      // 判定表に無い理由（soft / already-high-performance / registry 不可 等）でも次の一手は同じ
      const reason = preference.reason ? ` (${preference.reason})` : "";
      body = `${prefix}AKARI did not switch automatically${reason}. Set this executable${preference.executable ? ` (${preference.executable})` : ""} to high performance in Windows Graphics settings`;
    }
  }
  const causeLine = firstLine(cause);
  return singleLine(causeLine ? `${body} (cause: ${causeLine})` : body);
}

// run.json の error（stack 文字列）から元の英語エラー 1 行を取り出す（`Error: ` 接頭辞と診断 marker は外す）。
export function firstLine(text) {
  if (typeof text !== "string") return null;
  const line = stripGpuDiagnosticsMarker(text).split(/\r?\n/u, 1)[0].replace(/^Error:\s*/u, "").trim();
  return line === "" ? null : line;
}

// renderer 側は executeJavaScript の reject で main へ渡るとき Error の付随プロパティが落ちる（captionMeasureDiffs と同じ経路）ため、
// メッセージ末尾に marker + encodeURIComponent(JSON) を添える。main はプロパティ → marker の順で拾い、記録からは marker を外す。
export function extractGpuDiagnostics(error) {
  if (error?.gpuDiagnostics && typeof error.gpuDiagnostics === "object") return normalizeGpuDiagnostics(error.gpuDiagnostics);
  const message = String(error?.stack ?? error?.message ?? error ?? "");
  const start = message.indexOf(GPU_DIAGNOSTICS_MARKER);
  if (start < 0) return null;
  const encoded = message.slice(start + GPU_DIAGNOSTICS_MARKER.length).split(/\s/u, 1)[0];
  try { return normalizeGpuDiagnostics(JSON.parse(decodeURIComponent(encoded))); }
  catch { return null; }
}

export function stripGpuDiagnosticsMarker(text) {
  return String(text ?? "").replace(new RegExp(`\\s*${GPU_DIAGNOSTICS_MARKER}\\S*`, "gu"), "");
}

function normalizeGpuDiagnostics(value) {
  const renderer = value?.renderer && typeof value.renderer === "object"
    && typeof value.renderer.vendor === "string" && typeof value.renderer.renderer === "string"
    ? { vendor: value.renderer.vendor, renderer: value.renderer.renderer }
    : null;
  const support = value?.encoder_support && typeof value.encoder_support === "object"
    && typeof value.encoder_support["prefer-hardware"] === "boolean" && typeof value.encoder_support["prefer-software"] === "boolean"
    ? { "prefer-hardware": value.encoder_support["prefer-hardware"], "prefer-software": value.encoder_support["prefer-software"] }
    : null;
  return { renderer, encoder_support: support };
}

function rendererString(renderer) {
  if (typeof renderer === "string") return renderer.trim() === "" ? null : renderer.trim();
  if (renderer && typeof renderer === "object" && typeof renderer.renderer === "string" && renderer.renderer.trim() !== "") {
    return renderer.renderer.trim();
  }
  return null;
}

function singleLine(text) {
  return String(text).replace(/\s*[\r\n]+\s*/gu, " ").trim();
}
