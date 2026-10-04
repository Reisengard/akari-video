**English** | [Japanese](./contract-2026-09-25-motion-layers-v0.ja.md)

# How motion stacks v0

## 1. Time and storage

Evaluation time `t` is seconds in the output video. An element and its parent canvas each subtract their own `at`. At save time, `keyframes[].t` is frames from that element's start. A draw path names seconds or frames when it evaluates. `motion.in/out.duration` and `motion.loop.period` are frames, converted to seconds with the output fps. Playback and playhead moves do not change `edit.json`.

## 2. Composite

The order is the static value or the interpolated keyframe value, then the element's own entrance, emphasis, and exit, then parent-canvas motion from the inside outward. Each axis interpolates on its own. An axis with no points uses the static value. Before the first point and after the last point, the endpoint value holds.

| Value | Base | Own motion | Parent canvas |
|---|---|---|---|
| Position X and Y | Interpolated value or static value on that axis | Add an offset in output px | After the child is evaluated, apply the parent's scale and rotation, then add the parent's position |
| Scale | Interpolated value or static value | Multiply by a factor | Multiply by a factor |
| Rotation | Interpolated value or static value, in degrees | Add an angle | Add an angle |
| Opacity | Interpolated value or static value | Multiply by a factor | Multiply by a factor, then clamp the result to 0 to 1 |
| Visible crop | Static crop | Wipe's visible range | Composite the parent after the child's position is evaluated |

The transform is a column vector. With the element center as the origin, the order is **scale, then rotation, then translation**. Parent position and rotation are in output-canvas coordinates. Child position is in the parent's local coordinates. Several parents apply from the parent nearest the child outward. The parent's static transform is not baked first and then given motion on top.

## 3. Edit operations

Draw motion is an input method. It simplifies the dragged path and saves the result as the element's X and Y keyframes. It does not add a separate motion layer. When X and Y points already exist, the time range that will be replaced is shown before the save. One finished stroke is one undo step.

A direct drag uses the displayed position as its reference. It undoes parent translation, inverse rotation, and inverse scale, then undoes the element's own position offset, and writes the base position. The evaluate function and the inverse function do not change the declaration.

## 4. Values a preset changes

`in` is the start. `out` is the end. `loop` repeats while the element is visible. An exit evaluates the entrance progress backward from the end. `amount` sets that kind's distance, factor, angle, or strength. `ease` changes progress inside the interval.

| Stage | Kind | Position (add) | Scale (multiply) | Rotation (add) | Opacity and visible window |
|---|---|---|---|---|---|
| Entrance and exit | Fade `fade` | none | none | none | Multiply opacity from 0 to 1 |
| Entrance and exit | Four-way slide `slide-*` | 40 px by default | none | none | none |
| Entrance and exit | Scale `scale` | none | 0.8 to 1 by default | none | none |
| Entrance and exit | Wipe `wipe` | none | none | none | The remaining window moves from 0 to the whole frame |
| Entrance and exit | Pop `pop` | none | 0.25 to 1 by default | none | Multiply opacity from 0 to 1 |
| Entrance and exit | Zoom `zoom` | none | 1.55 to 1 by default | none | Multiply opacity from 0 to 1 |
| Entrance and exit | Twirl `twirl` | none | 0.35 to 1 | -200 to 0 degrees by default | Multiply opacity from 0 to 1 |
| Emphasis | Pulse `pulse` | none | A sine-wave factor | none | none |
| Emphasis | Float `float` | A sine-wave offset on Y | none | none | none |
| Emphasis | Spin `spin` | none | none | The angle of one turn | none |
| Emphasis | Blink `blink` | none | none | none | Multiply by 1 and 0.25 by default |
| Emphasis | Jiggle `jiggle` | A short sine-wave offset on X | none | A short sine-wave angle | none |

## 5. Parent and child clocks, and the inverse

A child's entrance advances from the child's `at`. A canvas entrance advances from the canvas `at`. A nested child's saved `at` is frames relative to the parent directly above it. At evaluation, ancestor times are added to make an output time. Example at 30 fps: the canvas starts at output 2 seconds, and the child starts 1 second after that. At output 3.5 seconds the child clock is 0.5 seconds and the canvas clock is 1.5 seconds. Canvas emphasis continues after the child's entrance has finished.

Let `V` be the visible position, `P` the parent position, `S` the parent's uniform scale, `R(θ)` the parent rotation, and `Δ` the element's own position offset. With one parent, the base position to write is **`B = R(-θ) × (V - P) / S - Δ`**. With several parents, invert from the outside in, then subtract the element's own `Δ` last. During a drag, follow `V`. Write `B` only when the drag is committed. A parent whose scale is 0 cannot be inverted, so the write is refused.

## 6. Path to points

Draw motion shows the path line on Preview. Ramer-Douglas-Peucker simplification by output-px distance keeps at most 32 points, stored as X and Y keyframes. The screen default is the speed method, where time follows how long the stroke took. A pure function can also space points evenly. The start is the playhead minus the element start, in frames. The end stays inside the element duration.

When X and Y points already exist, that time range is shown before drawing, and the range marked for replacement updates while drawing. On commit, only X and Y inside the drawn range are replaced. Position points outside the range, and other channels such as rotation and opacity, stay. One stroke is one undo step. Captions are out of scope.

## 7. Read-only playback and every draw path

Play, stop, and playhead moves are read-only. Writes happen only when a person changes a setting, commits a direct drag, or commits a path. The shell Preview, the web Preview, frame-engine video and stills, the render-cut HTML sheet, and the gpu-export DOM and sheet all call the same `evaluateItemMotion(item, t, parentChain)`. Each path passes `motionSource`, `motionParents` ordered from the near parent outward, the keyframe time unit, and the output fps. No path keeps a second composite formula.
