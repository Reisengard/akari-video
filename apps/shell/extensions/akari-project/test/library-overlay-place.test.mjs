import assert from 'node:assert/strict';
import test from 'node:test';
import { canPlaceOverlay, libraryDragKind } from '../lib/common/library-asset-placement.js';
import { libraryCardMenuEntries } from '../lib/common/library-card-menu.js';

test('separates Overlay and 3D drag kinds', () => {
    assert.equal(libraryDragKind({ category: 'overlay' }), 'overlay');
    assert.equal(libraryDragKind({ category: 'scene3d' }), 'scene3d');
    assert.equal(libraryDragKind({ category: 'still' }), 'asset');
});

test('Overlay action cards have a placement entry', () => {
    const item = { origin: 'resolver', category: 'overlay', state: 'cached', key: 'overlay/lower-third-clean',
        id: 'lower-third-clean', title: 'Clean lower third', tags: [] };
    assert.equal(canPlaceOverlay(item), true);
    assert.equal(libraryCardMenuEntries({ kind: 'asset', item }, false).some(entry => entry.id === 'place'), true);
    assert.equal(canPlaceOverlay({ ...item, state: 'locked' }), false);
});
