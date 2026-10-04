**English** | [Japanese](./contract-2026-09-03-preview-playback-rate-v1.ja.md)

---
lifecycle: accepted
created: 2026-09-03
updated: 2026-09-03
---

# Preview playback rate and pitch hold v1

## 1. UI and state

The right side of the Preview transport is pen, then rate, then zoom, then fullscreen. The rate control shows the current value as `0.5×`, not an icon. The popup offers seven values: `0.5`, `0.75`, `1`, `1.25`, `1.5`, `2`, and `3`. The range is 0.5 to 3 inclusive. There is no slider and no keyboard shortcut.

The source of truth for speed is the webview `previewRate`. A changed value is kept only on that host Preview widget. It is restored across inspector incremental updates and webview rebuilds. It is not saved to disk, Theia preferences, or edit.json. A new Preview opened after the widget closes starts at 1×. Raw footage Preview uses the same UI and the same speed.

## 2. What `rate` means

`previewRate` is output-timeline seconds divided by wall-clock seconds. `playbackTick.rate`, and the `value` of a review-session `reviewTransport` event with `type: "rate"`, both send this number. A legacy cut's declared `segment.speed` maps footage seconds to output seconds. It is not sent on a review rate event. The old segment-speed change event is removed.

The frame-engine clock multiplies elapsed wall time by `previewRate`. A legacy video element plays at `segment.speed × previewRate`. Gaps and stills multiply wall-clock time by `previewRate`. A freeze's wall-clock hold divides the declared seconds by `previewRate`. A speed change drops a new anchor at the current position and does not jump the playhead.

## 3. Audio and pitch hold

On the frame-engine path, every source sums into the `PreviewAudioSupply` master gain. Source schedule time and the AudioContext clock both advance by `previewRate`. The legacy path reschedules previewAudio BGM, SFX, and Narration by the same factor. A legacy video element, including dialogue, sets `preservesPitch = true`.

At 1× the master gain connects straight to the destination. Any other rate uses the shared `preview-audio-worklet.js` and the `akari-pitch-shift` processor. Audio played at speed `r` gets a pitch correction of ratio `1 / r`. Before the worklet is ready, speed applies alone. After it is ready, the node is inserted on the path. If the worklet fails to load, or AudioWorklet is missing, playback does not stop. One warning line is reported and the path falls back to uncorrected speed.

frame-engine `debug()` returns `rate`, `pitchPreserved`, and `stretcher`. `stretcher` is `"worklet"` or `"none"`. `pitchPreserved` is true only at 1×, or when the worklet is actually on the path. `attachAnalyser()` connects one AnalyserNode at the master-bus exit and returns it as the acceptance tap.

## 4. Non-goals

This feature is Preview only. It does not change Export speed or Export audio processing, and it does not change edit.json. Persisting speed in preferences, a keyboard shortcut, and a speed slider are out of this contract.
