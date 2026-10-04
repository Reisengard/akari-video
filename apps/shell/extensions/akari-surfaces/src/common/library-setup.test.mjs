import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { nextFirstRunSetupStep, shouldAutoOpenFirstRunSetup } = require('../../lib/common/first-run-onboarding.js');
const { summarizeLibraryStorage, librarySyncChoices, libraryMoveCopy } = require('../../lib/common/library-storage.js');

test('Footage setup appears between workspace and partner with back and skip', () => {
    assert.equal(nextFirstRunSetupStep('workspace', 'workspace-created'), 'library');
    assert.equal(nextFirstRunSetupStep('library', 'back'), 'workspace');
    assert.equal(nextFirstRunSetupStep('library', 'skip'), 'connection');
    assert.equal(nextFirstRunSetupStep('connection', 'back'), 'library');
    assert.equal(nextFirstRunSetupStep('library', 'next'), 'connection');
    assert.equal(shouldAutoOpenFirstRunSetup({ hasOpenProject: false, hasCreatorRootPointer: false,
        hasProjectHistory: false, markerSeen: true }), false);
});

test('Only pending sync confirmation shows the three choices', () => {
    assert.deepEqual(librarySyncChoices('pending'), ['Use this location', 'Choose another location', 'Do not move now']);
    assert.deepEqual(librarySyncChoices('done'), []);
});

for (const [state, count, bytes, expected] of [
    ['pending', 1, 4096, { transfer: true, sync: true, retained: false }],
    ['pending', 0, 0, { transfer: false, sync: true, retained: false }],
    ['declined', 1, 4096, { transfer: false, sync: false, retained: true }],
    ['declined', 0, 0, { transfer: false, sync: false, retained: true }],
    ['done', 1, 4096, { transfer: false, sync: false, retained: false }],
    ['done', 0, 0, { transfer: false, sync: false, retained: false }],
    [null, 1, 4096, { transfer: true, sync: false, retained: false }],
    [null, 0, 0, { transfer: false, sync: false, retained: false }]
]) test(`Storage guidance: ${state ?? '未決定'} · legacy assets ${count} items`, () => {
    const copy = libraryMoveCopy(state, { count, bytes }, 'OneDrive');
    assert.deepEqual({ transfer: !!copy.transfer, sync: !!copy.sync, retained: !!copy.retained }, expected);
    if (state === 'declined') {
        assert.match(copy.retained, /Keep the current location/);
        assert.doesNotMatch(JSON.stringify(copy), /移します|0\.0 MB/);
    }
    if (state === 'pending' && count > 0) assert.match(copy.sync, /OneDrive.*4 KB/);
    if (state === null && count > 0) assert.match(copy.transfer, /1 items · About 4 KB/);
});

test('Cleanup breakdown includes only downloaded Lab footage', () => {
    const items = [
        { id: 'lab', category: 'audio', title: 'Lab', sourceKind: 'lab', libraryDir: '/tmp/lab', files: [{ bytes: 7 }] },
        { id: 'site', category: 'audio', title: 'Site', sourceKind: 'site', libraryDir: '/tmp/site', files: [{ bytes: 11 }] },
        { id: 'own', category: 'still', title: 'Own', sourceKind: 'own', libraryDir: '/tmp/own', files: [{ bytes: 13 }] },
        { id: 'remote', category: 'audio', title: 'Remote', sourceKind: 'lab', files: [{ bytes: 100 }] }
    ];
    const result = summarizeLibraryStorage(items);
    assert.equal(result.totalBytes, 31);
    assert.deepEqual([result.bySource.lab.bytes, result.bySource.site.bytes, result.bySource.own.bytes], [7, 11, 13]);
    assert.deepEqual(result.cleanup.map(item => item.id), ['lab']);
    assert.equal(result.cleanupBytes, 7);
});
