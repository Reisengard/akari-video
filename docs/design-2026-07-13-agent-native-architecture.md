**English** | [Japanese](./design-2026-07-13-agent-native-architecture.ja.md)

# Agent-native architecture for the new AKARI Video implementation

- Date: 2026-07-13
- Status: approved. The owner has reviewed it.

## 1. Vision

**Hand over a video and it comes back edited. A person opens it, checks it, and makes only the small fixes.**

- The agent does the editing. Claude is one such agent. The app is not where editing happens. It is where a person checks the edit and fixes it.
- The agent **writes the save data directly**. That data is edit.json plus HTML fragments. A stack of MCP tool calls is slow and breaks easily, so it is not the main path. MCP shrinks to reads and to running work.
- Expression does not ship as presets. That includes captions, shapes, and 3D. **The AI draws them freely in HTML, CSS, and Three.js.** The intake is wide. The engine only composites.

## 2. The experiment this rests on. Step 1, 2026-07-13

The run below finished on a 62-minute unedited recording, without the app.

1. Local whisper.cpp transcription. 180 seconds became 61 segments.
2. Claude wrote the cut decisions directly as edit.json. It removed setup, trouble, and fillers. 165 seconds became 108 seconds, a 34 percent reduction, in 8 keep-ranges.
3. Claude wrote 32 captions and the chapter caption cards as **one HTML sheet**. One screenshot in a headless browser, then ffmpeg `colorkey`, crop, and overlay.
4. Claude itself looked at the verification frames and checked quality.

Note. The ffmpeg build in use had neither libass nor drawtext, so text had to be drawn in HTML. That constraint is what proved the setup in which all text drawing is HTML.

## 3. Competitors

Analysis of competitors, and of how this product differs, lives in private internal research. This repo does not hold that analysis. This design was approved on that premise.

## 4. Architecture. A three-layer sandwich, plus the Hand

```
┌────────────────────────────────────────────────────────────────┐
│ Transparent WKWebView, the expression plane                    │
│   HTML, CSS, SVG, and Three.js                                 │
│   Captions, shapes, and 3D. The AI writes them.                │
│   Selection handles and the edit UI live here too.             │
│   Time sync uses the Web Animations API.                       │
├────────────────────────────────────────────────────────────────┤
│ AVPlayerLayer, the native picture plane                        │
│   AVMutableComposition                                         │
│   Gapless playback of the cut list                             │
│   Sample-accurate sync and 4K hardware decode                  │
├────────────────────────────────────────────────────────────────┤
│ Hand, the CLI                                                  │
│   ffmpeg, whisper.cpp, HyperFrames, Akari Cloud API            │
│   Cuts, proxies, encode, and export                            │
└────────────────────────────────────────────────────────────────┘
```

### Why this split

- **Picture is native.** A `currentTime` jump on `<video>` hitches at a cut boundary. AVMutableComposition is gapless, sample-accurate, and hardware decoded. The old implementation fought this area with manual WebCodecs decode. Leave it to the OS.
- **Expression is the web.** HTML, CSS, and Three.js dominate by the volume of LLM training data, which is why presets are unnecessary. The browser compositor is already built for DOM compositing, so an overlay costs almost nothing.
- **Why the old implementation could not do this.** The old design composited on a canvas, and that canvas was the one source of truth for both preview and export, so the code had to read picture pixels. An opaque AVPlayerLayer could not be used. This design guarantees what you see is what you get by sending the same HTML through export. JavaScript no longer has to touch picture pixels, so a native picture plane is possible.

### How preview and export divide the work

| | Preview | Export |
|---|---|---|
| Picture | AVMutableComposition playback | ffmpeg cuts and encodes from the original |
| Expression | A live DOM. Immediate, and a person can touch it. | HyperFrames captures every frame. The capture is deterministic. |
| Accuracy | Approximate. A few tens of milliseconds is acceptable. | Exact to the frame |

## 5. Editing model. A person does not edit the HTML

Editing has three intakes.

1. **Timing and placement**, about 9 in 10 of the adjustments. `data-start` and `data-duration`, plus the root transform. The timeline UI and a drag finish the job. The person does not open the inside of the HTML.
2. **Declared knobs.** By convention, the AI writes each adjustable value as a CSS variable. The viewer finds those variables and builds a slider or a color picker. Text is a double-click, then contenteditable.
3. **A large change to the look.** Natural language in, then the AI rewrites the HTML.

The write-back rule. A person's action always lands in data. That data is edit.json, a data attribute, or a CSS variable. The AI respects that data with read, modify, and write. The person and the AI do not collide on the same save data.

A framework that tries to live entirely in code stops at a props editor, because its idea is to put both placement and animation into code. There is no map back from pixels to that code. This design keeps placement and timing as structure outside the code, which is what makes direct manipulation work.

## 6. Technical stack

| Layer | Technology | Note |
|---|---|---|
| Shell | Tauri v2, Rust | Window, file system, and process launch |
| Picture plane | Swift or Objective-C, plus AVFoundation, through an FFI bridge or objc2 | Insert a sublayer under the transparent WebView through `ns_window()`. This is the only substantial native work. |
| Expression plane | HTML, CSS, and SVG, plus WAAPI. 3D is Three.js plus glTF. | A video texture is a VideoTexture of the proxy. |
| Save data | edit.json plus overlay HTML fragments | The source of truth the agent edits directly |
| Hand | ffmpeg, whisper.cpp, the HyperFrames CLI, and the Akari Cloud API | All of these are local CLIs. Only generation uses the cloud. |

### Performance rules

- Decode only what is on screen. That is the clip under the playhead. More than one track does not mean decode them at the same time.
- Proxy first. At import, generate 720p in the background. Preview always uses the proxy. Export uses the original.
- Overlay convention. Center the motion on transform and opacity. Do not use blur or `backdrop-filter` on 4K.

### Portability

Hide the picture plane behind a thin interface. The interface is load, play, pause, seek, and a notification of `currentTime`. Windows comes later. v1 is a WebView `<video>` fallback, and export quality stays the same. v2 is Media Foundation. For now, macOS only.

## 7. MVP milestones

- **M0.** Sandwich proof of concept. Tauri v2, a transparent WebView, and AVPlayerLayer, with DOM on top of one video.
- **M1.** edit.json cuts play with no gap through AVMutableComposition.
- **M2.** Overlay runtime. Sync from data attributes, seek, and CSS variables.
- **M3.** Interaction layer. Selection, drag, and contenteditable write back into the data.
- **M4.** Export pipeline. HyperFrames plus ffmpeg.

Out of scope until after the drawing base. Transcription integrated into the app, style learning, generation, Windows, and integration of the shell and Pool.

## 8. References

- Step 1 experiment artifacts. The edit JSON, and a video cut together as a draft. Those are session artifacts.
- Research report. Managed in private internal research. This repo does not hold it.
- HyperFrames: https://github.com/heygen-com/hyperframes
