import assert from 'node:assert/strict';
import test from 'node:test';
import { canvasOperationReason } from '../lib/common/canvas-operation-reason.js';

test('内部の型名と英語を表示理由へ通さない', () => {
  assert.equal(canvasOperationReason(new Error('group は重複しない 2 個以上の id を必要とします。')),
    'Select at least 2 items.');
  assert.equal(canvasOperationReason(new Error('A group needs at least two distinct ids.')), 'Select at least 2 items.');
  assert.equal(canvasOperationReason(new Error('A group can contain only items that share a place.')), 'Select items at the same level.');
  assert.equal(canvasOperationReason(new Error('A container group cannot be ungrouped.')), 'Move the parts out of the group first.');
  assert.equal(canvasOperationReason(new Error('An item cannot be placed before the canvas.')), 'Cannot be placed before the canvas start.');
  assert.equal(canvasOperationReason(new Error('Cannot move an item under itself.')), 'Cannot be placed inside itself.');
  assert.equal(canvasOperationReason(new Error('Item was not found: a')), 'Target not found. Reload and try again.');
  assert.equal(canvasOperationReason(new Error('v2.group-bake-blocked: keyframes')),
    'Cannot do this. Check the selection and time.');
});
