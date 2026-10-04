import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRenderProgress, RENDER_PROGRESS_UNKNOWN_LABEL } from '../lib/common/render-progress.js';

// 実物（内部 dogfood-v2 実走の render.json）の verify/artifacts 形と、
// L1 で使う自作フィクスチャ（開始/50%/失敗/壊れたJSON/未知形）の両方を寛容リーダーで読めることを確認する。

test('parseRenderProgress malformed null/string/array falls back to unknown', () => {
    for (const raw of [null, undefined, 'not json shape', 42, []]) {
        const result = parseRenderProgress(raw);
        assert.equal(result.kind, 'unknown');
        assert.equal(result.label, RENDER_PROGRESS_UNKNOWN_LABEL);
    }
});

test('parseRenderProgress unknown shape without version/phase/plan falls back to unknown', () => {
    const result = parseRenderProgress({ someOtherTool: true, nested: { a: 1 } });
    assert.equal(result.kind, 'unknown');
    assert.equal(result.label, RENDER_PROGRESS_UNKNOWN_LABEL);
});

test('parseRenderProgress initial phase produces in-progress with phase in label', () => {
    const result = parseRenderProgress({ version: 1, phase: 'planning' });
    assert.equal(result.kind, 'in-progress');
    assert.equal(result.label, 'Exporting (planning)');
    assert.ok(result.percent > 0 && result.percent < 100);
});

test('parseRenderProgress unknown phase remains in-progress without throwing', () => {
    const result = parseRenderProgress({ version: 1, phase: 'some-future-stage-name' });
    assert.equal(result.kind, 'in-progress');
    assert.equal(result.label, 'Exporting (some-future-stage-name)');
    assert.equal(typeof result.percent, 'number');
});

test('parseRenderProgress: verify.verdict=pass + artifacts[0].path → done + artifactPath', () => {
    const result = parseRenderProgress({
        version: 1,
        phase: 'verified',
        artifacts: [{ path: 'exports/final.mp4', sha256: 'abc' }],
        verify: { verdict: 'pass', findings: [] }
    });
    assert.equal(result.kind, 'done');
    assert.equal(result.percent, 100);
    assert.equal(result.artifactPath, 'exports/final.mp4');
});

test('parseRenderProgress verify.verdict=fail produces failed with error text', () => {
    const result = parseRenderProgress({
        version: 1,
        phase: 'failed',
        verify: {
            verdict: 'fail',
            findings: [
                { severity: 'info', check: 'x', message: 'Ignored' },
                { severity: 'error', check: 'verify.duration', message: 'duration mismatch' }
            ]
        }
    });
    assert.equal(result.kind, 'failed');
    assert.equal(result.label, 'Export failed: duration mismatch');
});

test('parseRenderProgress failed verification without error findings uses generic failure', () => {
    const result = parseRenderProgress({ version: 1, verify: { verdict: 'fail', findings: [] } });
    assert.equal(result.kind, 'failed');
    assert.equal(result.label, 'Export failed');
});

test('parseRenderProgress passed verification without artifacts falls back to in-progress', () => {
    const result = parseRenderProgress({ version: 1, phase: 'verifying', verify: { verdict: 'pass' }, artifacts: [] });
    assert.equal(result.kind, 'in-progress');
});

test('parseRenderProgress reads the real dogfood-v2 receipt shape as done', () => {
    const result = parseRenderProgress({
        version: 1,
        phase: 'verified',
        inputs: {},
        warnings: [],
        validation: { lint: { verdict: 'pass' } },
        plan: { output: 'final-v2.2.mp4' },
        provenance: {},
        artifacts: [{ path: 'final-v2.2.mp4', sha256: 'x', ffprobe: { duration_seconds: 157.23 } }],
        verify: {
            verdict: 'pass',
            findings: [{ severity: 'info', check: 'verify.duration', message: 'ok' }],
            measured: { duration_seconds: 157.23 }
        }
    });
    assert.equal(result.kind, 'done');
    assert.equal(result.artifactPath, 'final-v2.2.mp4');
});

test('parseRenderProgress extracts GPU for the completion label', () => {
    const result = parseRenderProgress({
        version: 1,
        phase: 'verified',
        provenance: { engine_requested: 'auto', engine: 'gpu' },
        artifacts: [{ path: 'exports/final.mp4' }],
        verify: { verdict: 'pass' }
    });
    assert.equal(result.label, 'Export complete (GPU)');
    assert.deepEqual(result.engine, { name: 'gpu' });
});

test('parseRenderProgress extracts OSR and fallback reason', () => {
    const result = parseRenderProgress({
        version: 1,
        phase: 'verified',
        provenance: {
            engine_requested: 'auto',
            engine: 'osr',
            engine_fallback: { from: 'gpu', reason: 'GPU Electron launcher unavailable' }
        },
        artifacts: [{ path: 'exports/final.mp4' }],
        verify: { verdict: 'pass' }
    });
    assert.equal(result.label, 'Export complete (OSR — GPU launcher unavailable: GPU Electron launcher unavailable)');
    assert.deepEqual(result.engine, { name: 'osr', fallbackReason: 'GPU Electron launcher unavailable' });
});

test('parseRenderProgress displays one OSR ineligible item as id: reason', () => {
    const warning = 'GPU export is ineligible; using OSR: overlay:hero:embedded-context';
    const result = parseRenderProgress({
        version: 1,
        phase: 'verified',
        provenance: { engine_requested: 'auto', engine: 'osr' },
        warnings: [warning],
        artifacts: [{ path: 'exports/final.mp4' }],
        verify: { verdict: 'pass' }
    });
    assert.equal(result.label, 'Export complete (OSR — GPU ineligible: hero: embedded-context)');
    assert.deepEqual(result.engine, { name: 'osr', ineligible: ['overlay:hero:embedded-context'] });
});

test('parseRenderProgress displays first OSR ineligible item and remaining count', () => {
    const warning = 'GPU export is ineligible; using OSR: overlay:hero:embedded-context; caption:cap-1:unsupported-css; layer:logo:dynamic-filter';
    const result = parseRenderProgress({
        version: 1,
        phase: 'verified',
        provenance: { engine_requested: 'auto', engine: 'osr' },
        warnings: [warning],
        artifacts: [{ path: 'exports/final.mp4' }],
        verify: { verdict: 'pass' }
    });
    assert.equal(result.label, 'Export complete (OSR — GPU ineligible: hero: embedded-context, plus 2 items)');
    assert.equal(result.engine.ineligible.length, 3);
});

test('parseRenderProgress supports legacy receipts', () => {
    const result = parseRenderProgress({
        version: 1,
        phase: 'verified',
        provenance: { engine_requested: 'auto', engine: 'legacy' },
        artifacts: [{ path: 'exports/final.mp4' }],
        verify: { verdict: 'pass' }
    });
    assert.equal(result.label, 'Export complete (legacy)');
    assert.deepEqual(result.engine, { name: 'legacy' });
});

test('parseRenderProgress preserves undefined engine without provenance', () => {
    const result = parseRenderProgress({
        version: 1,
        phase: 'verified',
        artifacts: [{ path: 'exports/final.mp4' }],
        verify: { verdict: 'pass' }
    });
    assert.equal(result.label, 'Export complete');
    assert.equal(result.engine, undefined);
});

test('parseRenderProgress shows GPU export during planning', () => {
    const result = parseRenderProgress({
        version: 1,
        phase: 'planning',
        provenance: { engine_requested: 'auto', engine: 'gpu' }
    });
    assert.equal(result.label, 'Exporting (planning) (exporting with GPU)');
    assert.deepEqual(result.engine, { name: 'gpu' });
});
