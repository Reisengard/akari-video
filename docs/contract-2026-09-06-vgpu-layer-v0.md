**English** | [Japanese](./contract-2026-09-06-vgpu-layer-v0.ja.md)

---
lifecycle: accepted
date: 2026-09-06
---

# vGPU layer v0

## 1. Scope

`window.akari.vgpuRuntime` draws a fullscreen WebGPU fragment pass declared on `data-akari-vgpu-scene`, at a time passed in from outside. vgpu 0.4.0 is vendored. The runtime does not fetch a dependency. Place it on the same Overlay sheet as Three.js. On GPU Export, register the canvas with SpriteCompositor. Call `updateSprite` immediately after `render` on every frame. The WebGPU canvas presentation is temporary, so do not transfer the previous canvas without drawing. Do not add a pixel readback to the CPU on this path. This does not guarantee zero-copy inside the browser.

## 2. Declaration schema

Put exactly one script of the following form in the fragment. The canvas is optional. When it is omitted, the runtime creates it. The example below and the pass rules in sections 2 and 3 are for `pure`. Extra fields and pass rules for `stateful` are in section 7.

```html
<canvas></canvas>
<script type="application/json" data-akari-vgpu-scene>
{
  "version": 0,
  "mode": "pure",
  "alphaMode": "premultiplied",
  "seed": 0,
  "uniforms": { "speed": 1 },
  "passes": [{
    "id": "main",
    "wgsl": "struct Params { speed: f32 }; @group(0) @binding(1) var<uniform> params: Params; @fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f { let uv = akari_uv(p); return vec4f(uv, 0.5 + 0.5 * sin(akari.time * params.speed), 1.0); }",
    "inputs": [],
    "scale": 1
  }]
}
</script>
```

| Field | Constraint and default |
|---|---|
| `version` | Required. The number `0` only. |
| `mode` | Required. `pure` or `stateful` (section 7). |
| `alphaMode` | `premultiplied` when omitted. Any other value is rejected. Shader output RGB is also premultiplied by alpha. |
| `seed` | Any finite number. `0` when omitted. |
| `uniforms` | An optional plain object. Each value is a finite number, or an array of 2 to 4 finite numbers. `{}` when omitted. |
| `passes` | Required. An array of at least one. |
| `passes[].id` | Required. Matches `^[A-Za-z0-9_-]+$`. Unique. |
| `passes[].wgsl` | Required. A WGSL string that is not only whitespace. |
| `passes[].inputs` | An array of earlier pass ids, at most 8. `[]` when omitted. No self reference and no forward reference. |
| `passes[].scale` | A positive finite number. `1` when omitted. Ignored on the final pass. |
| `passes[].format` | `pure` only. `"rgba8unorm"` or `"rgba16float"`. `"rgba8unorm"` when omitted. Ignored on the final pass. The surface format is vgpu's default. |

`readDescriptor` throws TypeError on an unknown top-level key, an unknown pass key, invalid JSON, or an invalid value. Keys of `uniforms` correspond to members of the WGSL `Params` struct. The fragment itself declares `@group(0) @binding(1) var<uniform> params: Params;`. Types are `f32`, `vec2f`, `vec3f`, and `vec4f`. Do not set params on a pass that has no params declaration. An undeclared name, an unbound resource, or a WGSL compile error fails through vgpu's validation.

`pure` is an authoring contract that the output is a pure function of the given time, seed, and uniforms. A seek can jump to any time, and there is no feedback from the previous draw. It does not statically prove that arbitrary WGSL is mathematically pure. Do not give the fragment a clock that advances time, or a random source.

## 3. Fixed prelude and passes

Prepend the following to the source of each pass.

```wgsl
struct AkariUniforms { time: f32, aspect: f32, width: f32, height: f32, seed: f32, pad: vec3f };
@group(0) @binding(0) var<uniform> akari: AkariUniforms;
fn akari_uv(pos: vec4f) -> vec2f { return pos.xy / vec2f(akari.pad.x, akari.pad.y); }
```

A pass that has inputs continues with one texture declaration per input, then the shared sampler declaration. The fragment does not declare those again.

```wgsl
@group(1) @binding(0) var input_0: texture_2d<f32>;
// input_1 through input_7 are declared at binding 1 through 7, only for the count that is needed
@group(1) @binding(8) var input_sampler: sampler;
```

Draw passes in array order, serially, inside one `frame(gpu, f => ...)`. Only the last pass draws to the surface. Earlier passes draw to an offscreen target at `scale` times the size. Pass the referenced target's `color` to `input_i`. After a resize, rebind the new texture. Do not use `effect.draw(surface)`. In 0.4.0 the surface is drawn with the `pass` of `frame`.

`akari.width` and `akari.height` are always the container's real size at 1x, and `aspect = width / height`. `pad` keeps its reserved shape and carries real values. x and y are the real width and height of that pass's draw buffer. z is previewScale. On the final pass, x and y are the canvas's real size. On an intermediate pass, they are the target's real size after also multiplying by pass.scale. This is a ruling note that keeps the fixed struct and normalizes `@builtin(position)` pixel coordinates without depending on resolution. A fragment uses `akari_uv(position)`, or the top-left-origin `@location(0) uv` that vgpu's vertex stage supplies. Do not use `position.xy / vec2f(akari.width, akari.height)`. The composition changes when the scale is reduced.

An `rgba16float` intermediate target can pass linear HDR values above 1 through to the next pass unchanged. `rgba8unorm` saturates to [0, 1].

## 4. API, resolution, and controls

- `probe()` calls `init()` once per page and returns the same Promise. It draws 2 frames on a temporary 64 by 64 surface, and waits for GPU queue completion and validation completion. It watches for device lost from immediately after init, and destroys the temporary surface. The success value is `{ ok: true, adapter: { vendor, architecture }, ms }`. A string that could not be read is empty.
- `render(container, localTimeSeconds, { previewScale })` draws synchronously. The only source of time is the argument. When not yet initialized, it starts probe and returns while still loading. An Export host must await probe first. A synchronous draw error throws `VGPU-RENDER:`, and that container is a no-op afterward. An Export host also checks inspect's error, and does not treat an empty layer as success.
- `inspect(container)` returns `{ status, adapter, passes, previewScale, drawCount, deviceLost }`. status is `idle` (no declaration), `loading`, `ready`, or `error`. passes is the number of passes built.
- `dispose(container)` destroys the surface, the targets, and a canvas the runtime created. The shared device stays.
- `readDescriptor(container)` returns null when there is no declaration, and throws TypeError when the declaration is invalid.

previewScale is a multiplier per side. Unspecified is `1`. Recommended values are `1`, `0.5`, and `0.25`, and the implementation accepts a finite number `0 < s <= 1`. A value outside that range warns once and becomes `1`. The preview-server default is `0.5`. The zoom popup's 3 choices (1, 0.5, 0.25) can be selected by hand and are saved in `akari-preview-settings.vgpuPreviewScale`. A value outside that range is 0.5. Export omits previewScale and is always `1`. stateful passes the fps in section 7.
Fix the canvas CSS at absolute, inset 0, width and height 100%, display block. Only the internal pixels shrink. Position, size, time, and controls do not change. Round the draw size, with a minimum of 1 px. If the container size is 0, use the previous size. If there is no previous size, do not draw. The GPU composite side passes the container's resolved placement transform to the sprite, and keeps the Preview position and scale.

When `--vgpu-<key>` is present in the container's CSS, it beats uniforms. Read a number, or a vector separated by whitespace or commas, and adopt it only when every component is a finite number and the count matches the declaration. A mismatch warns once per key and uses the declared value. It can be set directly from the existing `vars`.

## 5. Eligibility and receipt

Place the vgpu decision after `item-keyframes` and before the three-only decision. The detection condition is `vgpu-runtime`, then `three-or-canvas-runtime` when a canvas is present.

| Class | Reason |
|---|---|
| `vgpu` | `vgpu-scene-canvas-direct`. A pure declaration is valid, and the other conditions come only from the canvas. |
| `vgpu` | `vgpu-scene-stateful-direct`. A stateful declaration is valid, and the other conditions come only from the canvas. |
| `degraded` | `vgpu-stateful-unsupported`. Lifted in v1 (section 7). The vocabulary stays for compatibility, and the implementation no longer emits it. |
| `degraded` | `vgpu-invalid-declaration`. Bad JSON, version, mode, or schema. |
| `degraded` | `vgpu-condition:<conditions joined by commas>`. Includes another dynamic condition or an external reference. |

When a 3D declaration is also present, prefer `vgpu-condition:three-or-canvas-runtime(data-akari-3d-scene)`. Then judge other conditions, then declaration validation. JSON accepts exactly one declaration. `forceDegraded` does not change the vgpu class of pure or stateful. A vgpu that became degraded is still a DOM-force target as `forced-dom:<original reason>`, under the existing rule, and eligible stays false.

Add `summary.vgpu` only when the count is at least 1. `spriteManifest.vgpu` is always an array. Each element is `{ id, start, duration, index, z }`. Create the Overlay sheet only when either three or vgpu is present. Add receipt `gpu.vgpu` only when the run has vgpu, in the following shape.

```json
{ "overlays": 2, "adapter": { "vendor": "apple", "architecture": "metal-3" },
  "previewScale": null, "deviceLost": false, "probeMs": 12.5, "stateful": 0, "replaySteps": 0 }
```

Normalize overlays to a finite non-negative integer, adapter to strings, previewScale to a number or null, deviceLost to boolean, and probeMs to a finite non-negative number or null. summary and receipt are conditional so that existing fixtures and receipts that do not use vgpu stay byte-equal and deep-equal. An Overlay sheet with no vgpu inserts no new script and no seek statement.

## 6. Fail loud, and the limits of v0

- `rgba32float` for `passes[].format` is not supported, because it depends on the `float32-filterable` feature.

- Missing WebGPU, a null adapter, or a failed init or test draw rejects probe with `VGPU-UNAVAILABLE:`.
- render after device lost throws `VGPU-DEVICE-LOST:`. There is no recovery and no switch to another device.
- A failure that contains `VGPU-` does not fall back to OSR, even on `auto`. It propagates as-is.
- Preview catches the failure, shows `[data-akari-vgpu-fallback]` (optional, the fragment's default is display none), and emits console.warn once. Other previews continue.

The CLI `--engine legacy` is already removed and is rejected in argument handling. Do not change that CLI error. A direct API call `renderProject(..., { engine: 'legacy' })` returns `vgpu overlays require --engine gpu` at the moment a vgpu declaration is detected. This differs from the original ruling, "reject legacy after engine resolution", because the CLI cannot reach that branch.

stateful and fixed-step replay are implemented in section 7 (v1). For texture-kind state, see the limits in section 7. OSR goes through the same sheet and is outside the v0 parity gate. Windows, Linux, and other GPUs are unverified. Two runs on the same machine with a full-frame SHA match are checked on a real GPU. Floating-point agreement across machines is not guaranteed. Do not adopt SwiftShader as a WebGPU substitute.

## 7. stateful (v1)

### 7.1. Declaration

`mode: "stateful"` declares an effect that has compute passes and ping-pong state. The declaration `version` stays `0`. The only allowed top-level keys are `version`, `mode`, `alphaMode`, `seed`, `maxReplaySteps`, `uniforms`, `state`, and `passes`. Allowed keys for `pure` stay as in section 2. Do not add `state` or `maxReplaySteps` there.

| Field | Constraint and default |
|---|---|
| `version` | Required. The number `0` only. |
| `mode` | Required in this section. `"stateful"`. |
| `alphaMode` | `"premultiplied"` when omitted. Other values are rejected. Output RGB is premultiplied by alpha. |
| `seed` | A finite number. `0` when omitted. |
| `maxReplaySteps` | Required. An integer of at least 1. |
| `uniforms` | A plain object. Each value is a finite number, or an array of 2 to 4 finite numbers. `{}` when omitted. |
| `state` | Required. An array of 1 to 8. Resource rules are in the next table. |
| `passes` | Required. An array of at least one. Zero or more `init`, then zero or more `compute`, then exactly one `fragment` at the end. |

`state[].id` is a string matching `^[A-Za-z_][A-Za-z0-9_]*$`, unique within state. Allowed keys and constraints per `kind` are below. Both kinds are validated at declaration time, and running a texture kind is rejected by the limit in 7.6.

| `state[].kind` | Allowed keys | Constraint |
|---|---|---|
| `"buffer"` | `id, kind, bytes` | `bytes` is a positive integer, a multiple of 4, at most 67108864. |
| `"texture"` | `id, kind, format, size` | `format` is only `rgba16float`, `rgba8unorm`, `r32float`, `rg32float`, or `rgba32float`. `size` is `[w, h]`. Each element is a positive integer of at most 4096. |

A pass allows only `id`, `kind`, `wgsl`, `reads`, `writes`, and `dispatch`. A `fragment` does not allow the `dispatch` key itself. `inputs` and `scale` are unknown keys on a stateful pass.

| Field | Constraint and default |
|---|---|
| `id` | Required string. Matches `^[A-Za-z0-9_-]+$`. Unique within passes. |
| `kind` | Required. One of `init`, `compute`, or `fragment`. |
| `wgsl` | Required. A WGSL string that is not only whitespace. |
| `reads` / `writes` | `[]` when omitted. Each element is a string id that exists in `state[]`. Duplicates inside one list are rejected. |
| `dispatch` | Required for `init` and `compute`. `[x, y, z]`, and all 3 elements are integers of at least 1. |

`init` cannot read state (`reads` is omitted or `[]` only). `writes` is required and has at least one. Place every `init` before `compute`. A `compute` pass may have empty `reads` and empty `writes`. A `fragment` `writes` is omitted or `[]` only. The display pass cannot write state. The same state may be named in both `reads` and `writes` of a compute pass.

An unknown key, an invalid value, invalid JSON, or a mismatched declaration count is a TypeError from `readDescriptor`, and eligibility is `degraded` / `vgpu-invalid-declaration`. The browser's `validateVgpuStatefulDescriptor` and the eligibility-side check use the same rules, and fill the defaults above for `alphaMode`, `seed`, `uniforms`, and each pass's `reads` and `writes`. WGSL compile errors and binding errors at run time are detected by vgpu, separate from declaration-schema validation.

An example declaration with one buffer state. One `init`, one `compute`, and one `fragment`. Do not repeat, inside `wgsl`, the prelude the runtime adds.

```json
{
  "version": 0,
  "mode": "stateful",
  "alphaMode": "premultiplied",
  "seed": 1234,
  "maxReplaySteps": 1800,
  "uniforms": { "stir": 1 },
  "state": [{ "id": "signal", "kind": "buffer", "bytes": 4 }],
  "passes": [
    {
      "id": "init",
      "kind": "init",
      "writes": ["signal"],
      "dispatch": [1, 1, 1],
      "wgsl": "@compute @workgroup_size(1) fn main() { signal_out[0] = 0.5 + 0.5 * sin(akari.seed); }"
    },
    {
      "id": "advance",
      "kind": "compute",
      "reads": ["signal"],
      "writes": ["signal"],
      "dispatch": [1, 1, 1],
      "wgsl": "struct Params { stir: f32 }; @group(0) @binding(1) var<uniform> params: Params; @compute @workgroup_size(1) fn main() { signal_out[0] = signal_in[0] * exp(-akari_state.dt) + (0.5 + 0.5 * sin(akari.time)) * params.stir * akari_state.dt; }"
    },
    {
      "id": "display",
      "kind": "fragment",
      "reads": ["signal"],
      "wgsl": "@fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f { let uv = akari_uv(p); let alpha = clamp(signal_in[0], 0.0, 1.0); return vec4f(vec3f(uv, 1.0) * alpha, alpha); }"
    }
  ]
}
```

### 7.2. Bindings and resolution

The runtime prepends the 3 lines from section 3 and the `AkariState` declaration to every pass.

```wgsl
struct AkariUniforms { time: f32, aspect: f32, width: f32, height: f32, seed: f32, pad: vec3f };
@group(0) @binding(0) var<uniform> akari: AkariUniforms;
fn akari_uv(pos: vec4f) -> vec2f { return pos.xy / vec2f(akari.pad.x, akari.pad.y); }
struct AkariState { step: f32, dt: f32, pad: vec2f };
@group(0) @binding(2) var<uniform> akari_state: AkariState;
```

Then it declares, in group 1, only the state that appears in that pass's `reads` and `writes`. If `i` is the index in `state[]`, a read is binding `2i` and a write is binding `2i+1`. Do not pack unused numbers. Leave the gaps. Replace `<id>` and `<format>` in the table below with the declared values.

| Kind and use | group / binding | Variable declaration |
|---|---|---|
| buffer, `reads` | `1 / 2i` | `var<storage, read> <id>_in: array<f32>;` |
| buffer, `writes` | `1 / 2i+1` | `var<storage, read_write> <id>_out: array<f32>;` |
| texture, `reads` | `1 / 2i` | `var <id>_in: texture_2d<f32>;` |
| texture, `writes` | `1 / 2i+1` | `var <id>_out: texture_storage_2d<format, write>;` |

For example, add the following to the `advance` pass above. Bind ping-pong `read` to `signal_in`, and the other buffer `write` to `signal_out`.

```wgsl
@group(1) @binding(0) var<storage, read> signal_in: array<f32>;
@group(1) @binding(1) var<storage, read_write> signal_out: array<f32>;
```

Add the following sampler declaration at the end only on a pass that `reads` a texture-kind state. The current version rejects texture state when the instance is created, so this binding is not reached.

```wgsl
@group(2) @binding(0) var state_sampler: sampler;
```

`params` is the same as section 2. The fragment itself declares the uniform at `@group(0) @binding(1)`. The runtime sets the declaration's uniforms and the resolved CSS `--vgpu-*` values only on a pass where it detected a params declaration.

`akari.width` and `akari.height` are the container's real size at 1x, `aspect = width / height`, and `seed` is the declared value. Split `akari.pad` by pass kind as follows.

| Pass | `akari.pad` |
|---|---|
| `fragment` (display) | `[draw buffer width, draw buffer height, previewScale]` |
| `init` / `compute` | `[container real width, container real height, 1]` |

previewScale affects only the display pass's draw buffer. state `bytes` and `size` stay at the declared values. init and compute input bindings are also independent of previewScale, so the same input produces the same simulation state at half resolution and at 1x. `akari_state.pad` is always `[0, 0]`.

### 7.3. fps, fixed step, and reset

`fps` on `render(container, t, { fps })` is required for stateful. If it is not a finite positive number, throw `TypeError('vgpu fps is required for stateful scenes')`. `pure` still does not need fps. Export passes `config.fps` (equal to `edit.output.fps`). The Overlay sheet passes `edit.output.fps`. Preview passes the timeline fps. `t` is a finite local number of seconds from the Overlay start.

`dt = 1 / fps`, and `targetStep = Math.max(0, Math.round(t * fps))`. Each container holds `currentStep` (initial value `-1`). If target is greater than current, advance by the difference. On a backward seek where target is less than current, or when not yet initialized, run the internal `reset()` and then advance. Redrawing the same step does not advance compute. It redraws only the display pass.

reset writes 0 to both halves of the ping-pong of every buffer state, and runs each `init` pass once in declaration order. It passes `akari.time = 0` and `akari_state = { step: 0, dt, pad: [0, 0] }` to init, swaps that pass's `writes` state immediately after the pass, and finally sets `currentStep = 0`. Because both halves are 0, the parity of swaps before the reset does not affect the result. If init is omitted, the zero fill is the initial state.

One step runs every `compute` pass in declaration order. The transition from step `n` to `n+1` passes `akari.time = n * dt` and `akari_state = { step: n, dt, pad: [0, 0] }`. Bind the reads and writes buffers on each pass, `dispatch(x, y, z)`, and swap that pass's writes in declaration order immediately afterward. After every compute pass, set `currentStep = n+1`.

Finally draw `fragment` once, with `akari.time = t` and `akari_state = { step: currentStep, dt, pad: [0, 0] }`. Bind the latest reads and present to the surface with `frame(gpu, f => f.pass(output, effect))`. Do not use wall clock, rAF, pointer, or `Math.random` as an input to state. A moving input is the declared uniforms, or a function of `akari.time` inside WGSL. Under the same declaration, fps, seed, and uniforms, a direct seek and a forward play reproduce the same picture at the same time. L1 acceptance measures full-pixel agreement of direct seek against forward play, and of a backward seek against a fresh instance.

### 7.4. Replay limit and failure

After reset, with `currentStep` as the base, if the number of steps one `render()` would advance, `steps = targetStep - currentStep`, exceeds `maxReplaySteps`, throw the following Error. The reset itself is not included in this limit.

```text
VGPU-REPLAY-LIMIT: <steps> steps exceeds maxReplaySteps <n>
```

The container becomes failed. `inspect().status` is `error`, and the optional `[data-akari-vgpu-fallback]` is shown. Preview catches it and warns. Export propagates the error and fails, as in section 6. Do not quietly approximate a huge seek that exceeds the limit, and do not treat a mid-way state as a finished frame.

### 7.5. inspect and receipt

`inspect(container)` keeps the keys in section 4 and adds `stateful` (true for a stateful instance, otherwise false), `step` (`currentStep`, or null when uninitialized or pure), and `replaySteps` (the cumulative count of state transitions, 0 for pure). Receipt `gpu.vgpu` does not change the meaning of existing keys. It adds only the next 2 keys.

| Key | Meaning |
|---|---|
| `stateful` | The count of stateful Overlays. |
| `replaySteps` | The total number of state transitions each instance ran. |

`replaySteps` counts reset (producing step 0) as 1, then 1 per later advance. Displaying the same step does not increase it. A reset and re-advance from a backward seek add to the cumulative total. A normal forward Export is then 1 step per frame, so a 3.0 s clip at 30 fps (90 frames) with one stateful Overlay is `stateful = 1` and `replaySteps = 90`. Drawing the same step 0 at mount and on the first frame does not count reset twice. Apply the existing non-negative number normalization and `Math.floor` to both keys. A missing or invalid value becomes 0.

### 7.6. Limits

`kind: "texture"` state does not run on vgpu 0.4.0. The declaration is valid, so eligibility is `vgpu` / `vgpu-scene-stateful-direct`, but including even one fails loud with `VGPU-STATE-TEXTURE-UNSUPPORTED` when the instance is created. The container becomes failed and shows the fallback, and Export fails too. The basis is the following implementation in vgpu 0.4.0.

- `normalizeResource` in `dist/set-resources.js` always throws on `case "storageTexture"`, and unconditionally rejects a storage-texture binding in `set()`.
- The texture usage of the offscreen target that `pingPong()` creates in `dist/target-offscreen.js` is only `render_attachment`, `texture_binding`, and `copy_src`. It does not include `storage_binding`.

The v1 implementation target is `kind: "buffer"`. Unlock the texture kind when vgpu provides a storage-texture binding. Floating-point agreement across machines is not guaranteed. The determinism gate is two runs agreeing on the same machine. Recovery from device lost, a variable step, and saving or restoring state are out of scope. A seek past `maxReplaySteps` always fails as the error in 7.4.
