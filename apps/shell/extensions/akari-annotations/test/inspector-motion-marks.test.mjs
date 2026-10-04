import assert from 'node:assert/strict';
import test from 'node:test';
import { itemMotionMarks } from '../lib/browser/inspector/motion-marks.js';

test('軸ごとの点・プリセット・親キャンバスの印を重ねる', () => {
  const item = {
    keyframes: [{ t: 0, transform: { x: 10 }, opacity: 0.5 }],
    motion: { in: { preset: 'fade', duration: 12 } }, canvasMotion: true
  };
  assert.deepEqual(itemMotionMarks(item, 'transform.x'), ['Keyframe', 'In/out', 'Canvas']);
  assert.deepEqual(itemMotionMarks(item, 'transform.y'), ['In/out', 'Canvas']);
  assert.deepEqual(itemMotionMarks(item, 'opacity'), ['Keyframe', 'In/out', 'Canvas']);
});
