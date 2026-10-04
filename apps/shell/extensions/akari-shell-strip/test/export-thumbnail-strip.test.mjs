import test from 'node:test';
import assert from 'node:assert/strict';
import { currentStripIndex } from '../lib/common/export-thumbnail-protocol.js';

const strip = {
    durationSeconds: 40,
    frames: Array.from({ length: 12 }, (_, index) => ({
        outputSeconds: index === 11 ? 39.967 : index / 12 * 40,
        dataUrl: undefined
    }))
};

test('0% selects the first frame and 100% selects the last', () => {
    assert.equal(currentStripIndex(strip, 0), 0);
    assert.equal(currentStripIndex(strip, 100), 11);
});

test('Intermediate progress selects the nearest frame timestamp', () => {
    assert.equal(currentStripIndex(strip, 50), 6);
});

test('Empty or unavailable strips return -1', () => {
    assert.equal(currentStripIndex({ durationSeconds: 0, frames: [] }, 50), -1);
    assert.equal(currentStripIndex(undefined, 50), -1);
});

test('Clamp progress to 0–100', () => {
    assert.equal(currentStripIndex(strip, -20), 0);
    assert.equal(currentStripIndex(strip, 120), 11);
});
