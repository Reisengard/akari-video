import test from 'node:test';
import assert from 'node:assert/strict';
import { rankRecentLibraryItems } from '../lib/common/library-source-view.js';
import { libraryCardContextMenuItems, libraryRemovalWarning } from '../lib/common/library-card-context-menu-items.js';

const item = (id, fields = {}) => ({ key: `audio/${id}`, id, category: 'audio', origin: 'resolver',
    sourceKind: 'lab', state: 'available', title: id, tags: [], ...fields });

test('ordering decision table: meaning, ★, use, count, recency, own/site, downloaded, undownloaded, ties', () => {
    const rows = [
        item('z-remote'), item('lab-cached', { state: 'cached' }),
        item('site', { sourceKind: 'site' }), item('own', { sourceKind: 'own' }),
        item('used-old', { usageCount: 2, lastUsedAt: '2026-01-01T00:00:00Z' }),
        item('used-new', { usageCount: 2, lastUsedAt: '2026-09-01T00:00:00Z' }),
        item('used-more', { usageCount: 3 }), item('favorite', { favorite: true }),
        item('a-remote')
    ];
    assert.deepEqual(rankRecentLibraryItems(rows).map(row => row.id),
        ['favorite', 'used-more', 'used-new', 'used-old', 'own', 'site', 'lab-cached', 'a-remote', 'z-remote']);
    assert.equal(rankRecentLibraryItems(rows, row => row.id === 'z-remote' ? 1 : 0)[0].id, 'z-remote');
    assert.deepEqual(rankRecentLibraryItems([item('site-one', { sourceKind: 'site', usageCount: 1 }),
        item('lab-two', { usageCount: 2 })]).map(row => row.id), ['lab-two', 'site-one']);
    assert.deepEqual(rows.map(row => row.id).slice(0, 2), ['z-remote', 'lab-cached']);
});

test('removal warning shows up to three using projects; only own/site cannot be downloaded again', () => {
    const projects = ['/tmp/P1', '/tmp/P2', '/tmp/P3', '/tmp/P4'];
    for (const sourceKind of ['own', 'site', 'lab']) {
        const warning = libraryRemovalWarning(item('tone', { sourceKind }), projects);
        assert.match(warning, /Used by 4 projects/);
        for (const name of ['P1', 'P2', 'P3']) assert.match(warning, new RegExp(name));
        assert.doesNotMatch(warning, /P4/);
        assert.equal(warning.includes('It cannot be downloaded again'), sourceKind !== 'lab');
    }
    assert.match(libraryRemovalWarning(item('tone'), []), /No projects use this asset/);
    assert.deepEqual(libraryCardContextMenuItems(item('none')), []);
    assert.deepEqual(libraryCardContextMenuItems(item('own', { libraryDir: '/tmp/library/audio/own' })).map(row => row.id), ['reveal', 'remove-library']);
});
