import assert from "node:assert/strict";
import test from "node:test";

import { summarizeGpuAdapters } from "../../osr-export/src/gpu-adapters.mjs";
import {
  describeHardwareEncoderFailure,
  extractGpuDiagnostics,
  firstLine,
  GPU_DIAGNOSTICS_MARKER,
  HARDWARE_ENCODER_UNSUPPORTED_MARKER,
  stripGpuDiagnosticsMarker,
} from "../src/gpu-diagnostics.mjs";

const CAUSE = "WebCodecs H.264 config is unsupported: prefer-hardware (avc1.640033 3840x2160@30fps 45000000bps) renderer=ANGLE (Intel, Intel(R) UHD Graphics (0x0000A7A8) Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.101.5972)";
const RUN_ERROR = `Error: ${CAUSE}\n    at window.__akariGpuRun (http://127.0.0.1:1234/page-runtime.js:1700:15)`;
const RENDERER = { vendor: "Google Inc. (Intel)", renderer: "ANGLE (Intel, Intel(R) UHD Graphics (0x0000A7A8) Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.101.5972)" };
const EXE = "D:\\AKARI\\Programs\\@akari-videoshell\\AKARI Video.exe";
const IGPU_ACTIVE = summarizeGpuAdapters([
  { active: true, deviceString: "Intel(R) UHD Graphics", gpuPreference: 2, vendorId: 32902, deviceId: 42920 },
  { active: false, deviceString: "NVIDIA GeForce RTX 5060 Laptop GPU", gpuPreference: 3, vendorId: 4318, deviceId: 11545 },
  { active: false, deviceString: "Microsoft Basic Render Driver", gpuPreference: 0, vendorId: 5140, deviceId: 140 },
]);
const DGPU_ACTIVE = summarizeGpuAdapters([
  { active: true, deviceString: "NVIDIA GeForce RTX 5060 Laptop GPU", gpuPreference: 2, vendorId: 4318, deviceId: 11545 },
  { active: false, deviceString: "Intel(R) UHD Graphics", gpuPreference: 0, vendorId: 32902, deviceId: 42920 },
]);
const SINGLE = summarizeGpuAdapters([
  { active: true, deviceString: "Intel(R) Iris(R) Xe Graphics", gpuPreference: 2, vendorId: 32902, deviceId: 1 },
  { active: false, deviceString: "Microsoft Basic Render Driver", gpuPreference: 0, vendorId: 5140, deviceId: 140 },
]);

function assertOneLine(message) {
  assert.equal(typeof message, "string");
  assert.doesNotMatch(message, /[\r\n]/u);
  assert.match(message, / \(cause: WebCodecs H\.264 config is unsupported: prefer-hardware \(avc1\.640033 3840x2160@30fps 45000000bps\) renderer=ANGLE \(Intel, .*\)\)$/u);
}

test("a. hybrid・iGPU・user-preference-respected: 省電力固定の説明と force の案内", () => {
  const message = describeHardwareEncoderFailure({
    adapters: IGPU_ACTIVE, renderer: RENDERER, cause: firstLine(RUN_ERROR),
    gpuPreference: { applied: false, reason: "user-preference-respected", previous: "GpuPreference=1;", executable: EXE },
  });
  assertOneLine(message);
  assert.equal(message, `The hardware H.264 encoder is unavailable. The export process is running on the integrated GPU (Intel(R) UHD Graphics). Windows Graphics settings pin this app to power saving, so AKARI did not switch automatically. Switch it to high performance, or rerun with AKARI_EXPORT_GPU_PREFERENCE=force (render-cut --gpu-preference force) (cause: ${CAUSE})`);
});

test("b. hybrid・iGPU・policy-off: 高パフォーマンス GPU 名と auto の案内", () => {
  const message = describeHardwareEncoderFailure({
    adapters: IGPU_ACTIVE, renderer: RENDERER, cause: firstLine(RUN_ERROR),
    gpuPreference: { applied: false, reason: "policy-off", policy: "off" },
  });
  assertOneLine(message);
  assert.equal(message, `The hardware H.264 encoder is unavailable. The export process is running on the integrated GPU (Intel(R) UHD Graphics). Automatic switch to the high-performance GPU (NVIDIA GeForce RTX 5060 Laptop GPU) is off. Rerun with AKARI_EXPORT_GPU_PREFERENCE=auto (cause: ${CAUSE})`);
});

test("c. hybrid・iGPU・applied: 書いた実行ファイルを示して設定アプリを案内", () => {
  const message = describeHardwareEncoderFailure({
    adapters: IGPU_ACTIVE, renderer: RENDERER, cause: firstLine(RUN_ERROR),
    gpuPreference: { applied: true, reason: "unset", executable: EXE, restored: true },
  });
  assertOneLine(message);
  assert.equal(message, `The hardware H.264 encoder is unavailable. The export process is running on the integrated GPU (Intel(R) UHD Graphics). AKARI wrote the GPU setting (${EXE}) but Windows did not apply it. Set this executable to high performance in Windows Graphics settings (cause: ${CAUSE})`);
});

test("d. dGPU に載ったのに unsupported: ドライバ更新か --engine osr", () => {
  const message = describeHardwareEncoderFailure({
    adapters: DGPU_ACTIVE, renderer: { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 Laptop GPU (0x00002D19) Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.16.1656)" },
    gpuPreference: { applied: true, reason: "unset", executable: EXE, restored: true }, cause: firstLine(RUN_ERROR),
  });
  assertOneLine(message);
  assert.equal(message, `The high-performance GPU (NVIDIA GeForce RTX 5060 Laptop GPU) is active, but its hardware H.264 encoder does not respond. Update the GPU driver, or rerun with --engine osr (cause: ${CAUSE})`);
});

test("e. hybrid でない: この GPU にはエンコーダが無い", () => {
  const message = describeHardwareEncoderFailure({ adapters: SINGLE, renderer: RENDERER, gpuPreference: { reason: "unset", applied: true }, cause: firstLine(RUN_ERROR) });
  assertOneLine(message);
  assert.equal(message, `This GPU (Intel(R) Iris(R) Xe Graphics) has no hardware H.264 encoder. Rerun with --engine osr (cause: ${CAUSE})`);
  // 他 OS（platform skip）でも同じ文面。active_device が無ければ renderer 文字列
  const noDeviceString = describeHardwareEncoderFailure({ adapters: { ...SINGLE, active_device: null }, renderer: RENDERER, gpuPreference: { reason: "platform" }, cause: CAUSE });
  assert.match(noDeviceString, /^This GPU \(ANGLE \(Intel, /u);
});

test("f. devices が null: renderer 文字列だけで e 相当 + GPU 情報未取得の注記", () => {
  const message = describeHardwareEncoderFailure({ adapters: null, renderer: RENDERER, gpuPreference: { reason: "unset", applied: true }, cause: firstLine(RUN_ERROR) });
  assertOneLine(message);
  assert.equal(message, `This GPU (${RENDERER.renderer}) has no hardware H.264 encoder. Rerun with --engine osr (GPU info was not available) (cause: ${CAUSE})`);
  // renderer も無いときは「不明な GPU」。原因が無ければ末尾の括弧も付けない
  assert.equal(describeHardwareEncoderFailure({}), "This GPU (Unknown GPU) has no hardware H.264 encoder. Rerun with --engine osr (GPU info was not available)");
});

test("判定表に無い理由（already-high-performance 等）で iGPU のままなら設定アプリを案内する", () => {
  const message = describeHardwareEncoderFailure({
    adapters: IGPU_ACTIVE, renderer: RENDERER, cause: "boom\nsecond line",
    gpuPreference: { applied: false, reason: "already-high-performance", executable: EXE },
  });
  assert.doesNotMatch(message, /[\r\n]/u);
  assert.equal(message, `The hardware H.264 encoder is unavailable. The export process is running on the integrated GPU (Intel(R) UHD Graphics). AKARI did not switch automatically (already-high-performance). Set this executable (${EXE}) to high performance in Windows Graphics settings (cause: boom)`);
});

test("renderer 側の診断は error のプロパティ → message 末尾の marker の順で拾い、記録からは marker を外す", () => {
  const diagnostics = { renderer: RENDERER, encoder_support: { "prefer-hardware": false, "prefer-software": true } };
  const encoded = `${GPU_DIAGNOSTICS_MARKER}${encodeURIComponent(JSON.stringify(diagnostics))}`;
  const viaMarker = new Error(`${CAUSE} ${encoded}`);
  assert.deepEqual(extractGpuDiagnostics(viaMarker), diagnostics);
  const viaProperty = new Error("WebCodecs H.264 config is unsupported: prefer-hardware");
  viaProperty.gpuDiagnostics = { renderer: RENDERER, encoder_support: { "prefer-hardware": false, "prefer-software": true }, extra: 1 };
  assert.deepEqual(extractGpuDiagnostics(viaProperty), diagnostics);
  assert.equal(extractGpuDiagnostics(new Error("renderer process gone: crashed")), null);
  assert.equal(extractGpuDiagnostics(new Error(`x ${GPU_DIAGNOSTICS_MARKER}%7Bbroken`)), null);
  assert.equal(stripGpuDiagnosticsMarker(`Error: ${CAUSE} ${encoded}\n    at run (page-runtime.js:1)`), `Error: ${CAUSE}\n    at run (page-runtime.js:1)`);
  assert.equal(firstLine(`Error: ${CAUSE} ${encoded}\n    at run`), CAUSE);
  assert.equal(firstLine(null), null);
  assert.equal(HARDWARE_ENCODER_UNSUPPORTED_MARKER, "WebCodecs H.264 config is unsupported");
});
