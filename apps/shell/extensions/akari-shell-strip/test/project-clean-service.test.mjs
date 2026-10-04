import { strict as assert } from 'node:assert';
import test from 'node:test';

import { AkariProjectCleanServiceImpl, parseInspection } from '../lib/node/akari-project-clean-service.js';

// 分類の正典は akari clean（clean-manifest.mjs）側。ここで検査するのは
// 「CLI の出力を取り違えないこと」と「読めなかったのに 0 件と嘘をつかないこと」。

const SAMPLE = JSON.stringify({
    disposable: [
        { path: '.akari/render-tmp/run-1', class: 'disposable', reason: 'Export temporary workspace', files: 49, bytes: 31424345 },
        { path: '.akari/cache/thumbnails', class: 'disposable', reason: 'Regenerable cache', files: 2, bytes: 1168 }
    ],
    keep: [{ path: 'edit.json', class: 'keep', reason: 'Canonical edit content', files: 1, bytes: 10 }],
    undecided: [
        { path: '.akari/render-tmp/run-2', class: 'undecided', reason: 'May be running', files: 3, bytes: 2048, held_reason: 'May be running' },
        { path: 'source.mp4', class: 'undecided', reason: 'No classification in declarations', files: 1, bytes: 500 }
    ],
    totals: {}
});

test('parseInspection reads disposable, undecided, and total bytes', () => {
    const inspection = parseInspection(`${SAMPLE}\n`);
    assert.equal(inspection.disposable.length, 2);
    assert.equal(inspection.disposableBytes, 31424345 + 1168);
    assert.equal(inspection.undecided.length, 2);
    assert.equal(inspection.undecidedBytes, 2048 + 500);
    assert.equal(inspection.disposable[0].path, '.akari/render-tmp/run-1');
});

test('parseInspection maps held_reason to heldReason for display', () => {
    const inspection = parseInspection(SAMPLE);
    const held = inspection.undecided.filter(entry => entry.heldReason);
    assert.equal(held.length, 1);
    assert.equal(held[0].heldReason, 'May be running');
});

test('parseInspection selects the final JSON line after warning output', () => {
    const inspection = parseInspection(`provenance warning: something\n${SAMPLE}\n`);
    assert.equal(inspection.disposable.length, 2);
});

test('parseInspection returns undefined for malformed output rather than claiming zero items', () => {
    assert.equal(parseInspection(''), undefined);
    assert.equal(parseInspection('not json'), undefined);
    assert.equal(parseInspection('{ broken'), undefined);
    assert.equal(parseInspection(JSON.stringify({ keep: [] })), undefined);
});

/** CLI を起動しないスタブ。渡された引数だけを記録する。 */
function stubbedService(results) {
    class StubService extends AkariProjectCleanServiceImpl {
        constructor() {
            super();
            this.calls = [];
        }
        async findCleanCli() { return '/cli/akari.mjs'; }
        async spawnNodeScript(scriptPath, args) {
            this.calls.push(args);
            return results.shift();
        }
        fsPath() { return '/project'; }
    }
    return new StubService();
}

test('inspect uses --json --dry-run without deleting', async () => {
    const service = stubbedService([{ exitCode: 0, stdout: SAMPLE, stderr: '' }]);
    const result = await service.inspect('file:///project');
    assert.equal(result.ok, true);
    assert.equal(result.inspection.disposable.length, 2);
    assert.deepEqual(service.calls, [['clean', '/project', '--json', '--dry-run']]);
});

test('inspect returns a reason when CLI is missing', async () => {
    class NoCli extends AkariProjectCleanServiceImpl {
        async findCleanCli() { return undefined; }
        fsPath() { return '/project'; }
    }
    const result = await new NoCli().inspect('file:///project');
    assert.equal(result.ok, false);
    assert.match(result.reason, /CLI not found/u);
});

test('inspect uses the stderr tail as the reason on CLI failure', async () => {
    const service = stubbedService([{ exitCode: 2, stdout: '', stderr: 'edit.json not found: /project\n' }]);
    const result = await service.inspect('file:///project');
    assert.equal(result.ok, false);
    assert.match(result.reason, /edit\.json not found/u);
});

test('inspect does not report ok for unreadable output even with exit 0', async () => {
    const service = stubbedService([{ exitCode: 0, stdout: 'garbage', stderr: '' }]);
    const result = await service.inspect('file:///project');
    assert.equal(result.ok, false);
    assert.match(result.reason, /Could not read/u);
});

test('clean uses --json --yes and returns deleted count and bytes', async () => {
    const service = stubbedService([{ exitCode: 0, stdout: SAMPLE, stderr: '' }]);
    const result = await service.clean('file:///project');
    assert.deepEqual(service.calls, [['clean', '/project', '--json', '--yes']]);
    assert.equal(result.cleaned, true);
    assert.equal(result.count, 2);
    assert.equal(result.bytes, 31424345 + 1168);
});

test('clean does not report cleaned on partial failure', async () => {
    const service = stubbedService([{
        exitCode: 1,
        stdout: SAMPLE,
        stderr: 'Deletion failed: .akari/cache (EBUSY)\nSome items could not be deleted.\n'
    }]);
    const result = await service.clean('file:///project');
    assert.equal(result.cleaned, false);
    assert.match(result.reason, /Deletion failed/u);
});
