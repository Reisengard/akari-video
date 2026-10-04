import test from 'node:test';
import assert from 'node:assert/strict';
import { computeExportChipState } from '../lib/common/export-chip-state.js';

function snapshot(phase, options = {}) {
    return {
        status: { phase, ...options.status },
        outputName: options.outputName ?? 'final.mp4',
        setupRequested: options.setupRequested
    };
}

test('dialogVisible hides every phase', () => {
    for (const phase of ['idle', 'linting', 'lint-failed', 'rendering', 'done', 'cancelled', 'failed']) {
        assert.deepEqual(computeExportChipState(snapshot(phase), true, false), { kind: 'hidden' });
    }
});

test('Rendering stage, percent, and remaining time map to running', () => {
    assert.deepEqual(computeExportChipState(snapshot('rendering', {
        status: { progressStage: 'render', progressPercent: 41.6, progressRemainingMs: 23_000 }
    }), false, false), {
        kind: 'running',
        stageLabel: 'Rendering and encoding video',
        percent: 42,
        remainingMs: 23_000,
        outputName: 'final.mp4'
    });
});

test('Running clamps percent to 0–100 and uses phase text when stage is unknown', () => {
    assert.equal(computeExportChipState(snapshot('linting', {
        status: { progressPercent: -10 }
    }), false, false).stageLabel, 'Checking lint');
    assert.equal(computeExportChipState(snapshot('linting', {
        status: { progressPercent: -10 }
    }), false, false).percent, 0);
    assert.equal(computeExportChipState(snapshot('rendering', {
        status: { progressPercent: 120 }
    }), false, false).percent, 100);
});

test('Done produces finished with the output name', () => {
    assert.deepEqual(computeExportChipState(snapshot('done'), false, false), {
        kind: 'finished',
        outcome: 'done',
        line: 'Export complete · final.mp4',
        outputName: 'final.mp4'
    });
});

test('Cancelled and idle are hidden', () => {
    assert.deepEqual(computeExportChipState(snapshot('cancelled'), false, false), { kind: 'hidden' });
    assert.deepEqual(computeExportChipState(snapshot('idle'), false, false), { kind: 'hidden' });
});

test('Dismissed hides finished without affecting running', () => {
    assert.deepEqual(computeExportChipState(snapshot('done'), false, true), { kind: 'hidden' });
    assert.equal(computeExportChipState(snapshot('rendering'), false, true).kind, 'running');
});

test('Failed and lint-failed use the defined English messages', () => {
    assert.equal(computeExportChipState(snapshot('failed'), false, false).line, 'Export failed');
    assert.equal(computeExportChipState(snapshot('lint-failed'), false, false).line, 'Stopped by lint errors');
});

test('setupRequested hides terminal states', () => {
    for (const phase of ['done', 'failed', 'lint-failed']) {
        assert.deepEqual(computeExportChipState(snapshot(phase, { setupRequested: true }), false, false), { kind: 'hidden' });
    }
});
