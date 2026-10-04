import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ARTIFACT_OPEN_GATE_TIMEOUT_MS,
    RENDER_STATE_RELATIVE_PATH,
    normalizeArtifactPath,
    parseRenderStateFacts,
    shouldHoldArtifactOpen
} from '../lib/common/artifact-open-gate.js';

const hold = (renderState, artifactRelativePath = 'exports/final-4.mp4', waitedMs = 0) =>
    shouldHoldArtifactOpen({ renderState, artifactRelativePath, waitedMs });

test('RENDER_STATE_RELATIVE_PATH points to render-cut state', () => {
    assert.equal(RENDER_STATE_RELATIVE_PATH, '.akari/render.json');
});

test('parseRenderStateFacts extracts only phase and plan.output', () => {
    const facts = parseRenderStateFacts(JSON.stringify({
        version: 1,
        phase: 'planned',
        plan: { output: 'exports/final-4.mp4', preset: { fps: 30 } }
    }));
    assert.deepEqual(facts, { phase: 'planned', output: 'exports/final-4.mp4' });
});

test('parseRenderStateFacts returns undefined for unreadable input, failing open', () => {
    assert.equal(parseRenderStateFacts(undefined), undefined);
    assert.equal(parseRenderStateFacts(''), undefined);
    assert.equal(parseRenderStateFacts('   '), undefined);
    assert.equal(parseRenderStateFacts('{ truncated'), undefined);
    assert.equal(parseRenderStateFacts('[]'), undefined);
    assert.equal(parseRenderStateFacts('null'), undefined);
    // 形は JSON でも中身が欠けていれば各項目は undefined（= 完了扱い）。
    assert.deepEqual(parseRenderStateFacts('{}'), { phase: undefined, output: undefined });
    assert.deepEqual(parseRenderStateFacts('{"phase":1,"plan":{"output":2}}'), { phase: undefined, output: undefined });
});

test('normalizeArtifactPath normalizes separators and leading ./', () => {
    assert.equal(normalizeArtifactPath('exports/final-4.mp4'), 'exports/final-4.mp4');
    assert.equal(normalizeArtifactPath('./exports/final-4.mp4'), 'exports/final-4.mp4');
    assert.equal(normalizeArtifactPath('exports\\final-4.mp4'), 'exports/final-4.mp4');
    assert.equal(normalizeArtifactPath('exports/frames/'), 'exports/frames');
    assert.equal(normalizeArtifactPath(undefined), undefined);
    assert.equal(normalizeArtifactPath(''), undefined);
});

test('shouldHoldArtifactOpen waits while the same artifact is rendering', () => {
    // render-cut は実行開始時に phase:"planned" + plan.output を書き、rename はその後に来る。
    assert.equal(hold({ phase: 'planned', output: 'exports/final-4.mp4' }), true);
    assert.equal(hold({ phase: 'rendered', output: 'exports/final-4.mp4' }), true);
    assert.equal(hold({ phase: 'filter_report', output: 'exports/final-4.mp4' }), true);
});

test('shouldHoldArtifactOpen opens after completion or failure', () => {
    assert.equal(hold({ phase: 'verified', output: 'exports/final-4.mp4' }), false);
    assert.equal(hold({ phase: 'error', output: 'exports/final-4.mp4' }), false);
});

test('shouldHoldArtifactOpen fails open when state cannot be determined', () => {
    // render.json が無い / 壊れている
    assert.equal(hold(undefined), false);
    // 未知の phase・phase 欠落
    assert.equal(hold({ phase: 'unknown-future-phase', output: 'exports/final-4.mp4' }), false);
    assert.equal(hold({ output: 'exports/final-4.mp4' }), false);
    // plan.output が無い
    assert.equal(hold({ phase: 'planned' }), false);
});

test('shouldHoldArtifactOpen does not wait for a different artifact', () => {
    // 直前の書き出しの render.json が残っているだけ、という状況で手で置いた mp4 を止めない。
    assert.equal(hold({ phase: 'planned', output: 'exports/final-3.mp4' }), false);
    assert.equal(hold({ phase: 'planned', output: 'exports/final-4.mp4' }, 'exports/hand-drop.mp4'), false);
});

test('shouldHoldArtifactOpen recognizes equivalent path spellings', () => {
    assert.equal(hold({ phase: 'planned', output: './exports/final-4.mp4' }), true);
    assert.equal(hold({ phase: 'planned', output: 'exports\\final-4.mp4' }), true);
});

test('shouldHoldArtifactOpen opens after timeout in case a run crashed after rename', () => {
    const running = { phase: 'planned', output: 'exports/final-4.mp4' };
    assert.equal(hold(running, 'exports/final-4.mp4', ARTIFACT_OPEN_GATE_TIMEOUT_MS - 1), true);
    assert.equal(hold(running, 'exports/final-4.mp4', ARTIFACT_OPEN_GATE_TIMEOUT_MS), false);
    assert.equal(hold(running, 'exports/final-4.mp4', ARTIFACT_OPEN_GATE_TIMEOUT_MS + 1), false);
});
