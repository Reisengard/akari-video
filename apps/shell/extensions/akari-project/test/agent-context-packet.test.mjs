import test from 'node:test';
import assert from 'node:assert/strict';
import { composeAgentContextPacket, composeMaterialAskAgentPrompt, composeOutputAskAgentPrompt } from '../lib/common/agent-context-packet.js';

// composer 単体テスト（task.md L0: 要素の有無 4 パターン — 分析済み/未分析 × 入力の改行畳み込み）。

test('composeMaterialAskAgentPrompt: analyzed input without line breaks — includes all five elements', () => {
    const packet = composeMaterialAskAgentPrompt(
        {
            relativePath: 'assets/clip.mp4',
            analyzed: true,
            durationSeconds: 6,
            analysisRelativePath: '.akari/sidecars/assets/clip.mp4.analysis/analysis.json'
        },
        'Summarize this footage'
    );
    assert.equal(
        packet,
        '【Footage】assets/clip.mp4（Duration 0:06 · Analyzed · analysis: .akari/sidecars/assets/clip.mp4.analysis/analysis.json）: Summarize this footage'
    );
    assert.equal(/[\r\n]/.test(packet), false, 'Packet must be a single line');
});

test('composeMaterialAskAgentPrompt: analyzed input with line breaks — collapsed to spaces', () => {
    const packet = composeMaterialAskAgentPrompt(
        {
            relativePath: 'assets/clip.mp4',
            analyzed: true,
            durationSeconds: 66,
            analysisRelativePath: '.akari/sidecars/assets/clip.mp4.analysis/analysis.json'
        },
        'Line 1\nLine 2\r\nLine 3'
    );
    assert.equal(
        packet,
        '【Footage】assets/clip.mp4（Duration 1:06 · Analyzed · analysis: .akari/sidecars/assets/clip.mp4.analysis/analysis.json）: Line 1 Line 2 Line 3'
    );
    assert.equal(/[\r\n]/.test(packet), false, 'Packet must be a single line');
});

test('composeMaterialAskAgentPrompt: unanalyzed input without line breaks — duration unknown/unanalyzed, no analysis element', () => {
    const packet = composeMaterialAskAgentPrompt(
        { relativePath: 'assets/raw.mov', analyzed: false },
        'Analyze this'
    );
    assert.equal(packet, '【Footage】assets/raw.mov（Duration unknown · Not analyzed）: Analyze this');
    assert.equal(packet.includes('analysis:'), false, 'Unanalyzed footage must not include an analysis path element');
});

test('composeMaterialAskAgentPrompt: unanalyzed input with line breaks — collapsed to spaces, no analysis element', () => {
    const packet = composeMaterialAskAgentPrompt(
        { relativePath: 'assets/raw.mov', analyzed: false },
        'What\nshould I do?'
    );
    assert.equal(packet, '【Footage】assets/raw.mov（Duration unknown · Not analyzed）: What should I do?');
    assert.equal(packet.includes('analysis:'), false, 'Unanalyzed footage must not include an analysis path element');
    assert.equal(/[\r\n]/.test(packet), false, 'Packet must be a single line');
});

test('composeAgentContextPacket: zero fields throws', () => {
    assert.throws(() => composeAgentContextPacket('Footage', [], 'Request'));
});

test('composeAgentContextPacket: generic signature (target type + field dictionary + request) supports target types other than footage', () => {
    const packet = composeAgentContextPacket(
        'Plan',
        [{ value: 'planning/plan.json#shot-3' }, { label: 'Status', value: 'draft' }],
        'Shorten the duration'
    );
    assert.equal(packet, '【Plan】planning/plan.json#shot-3（Status draft）: Shorten the duration');
});

// できたもの（export 行）版 composer（task 2026-08-09-material-context-menu-mvp 指示8）。

test('composeOutputAskAgentPrompt: includes relativePath', () => {
    const packet = composeOutputAskAgentPrompt({ relativePath: 'exports/cut-01.mp4' }, 'Fix the typo in the text overlay');
    assert.equal(packet.includes('exports/cut-01.mp4'), true);
    assert.equal(packet, '【Exported output】exports/cut-01.mp4: Fix the typo in the text overlay');
});

test('composeOutputAskAgentPrompt: requests with line breaks collapse to a single line', () => {
    const packet = composeOutputAskAgentPrompt({ relativePath: 'exports/cut-01.mp4' }, 'Line 1\nLine 2');
    assert.equal(packet, '【Exported output】exports/cut-01.mp4: Line 1 Line 2');
    assert.equal(/[\r\n]/.test(packet), false, 'Packet must be a single line');
});
