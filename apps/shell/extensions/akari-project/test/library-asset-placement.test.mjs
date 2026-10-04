import test from 'node:test';
import assert from 'node:assert/strict';
import { canPlaceLibraryAsset, resolveLibraryAssetMedia } from '../lib/common/library-asset-placement.js';

const files = (...names) => names.map(name => ({ name, isDirectory: false }));
for (const category of ['audio', 'broll', 'still']) {
    test(`${category}: available / cached can be placed, locked is rejected`, () => {
        for (const state of ['available', 'cached', undefined]) assert.equal(canPlaceLibraryAsset({ origin: 'resolver', category, state }), true);
        assert.equal(canPlaceLibraryAsset({ origin: 'resolver', category, state: 'locked' }), false);
    });
    test(`${category}: local rejects direct placement regardless of download state`, () => {
        for (const state of [undefined, 'available', 'cached', 'locked']) {
            assert.equal(canPlaceLibraryAsset({ origin: 'local', category, state }), false);
        }
    });
}
for (const category of ['overlay', 'scene3d', 'pack', 'font', 'preset:textstyle', 'unknown']) {
    test(`${category}: unsupported for direct placement`, () => assert.equal(canPlaceLibraryAsset({ origin: 'resolver', category }), false));
}
for (const [label, item, children, expected] of [
    ['Single audio', { category: 'audio' }, files('a.mp3'), { kind: 'audio', mediaName: 'a.mp3' }],
    ['Preview take b', { category: 'audio', mediaUrl: 'https://example.test/b.mp3?token=1' }, files('a.mp3', 'b.mp3'), { kind: 'audio', mediaName: 'b.mp3' }],
    ['file URL and encoding', { category: 'audio', mediaUrl: 'file:///cache/take%20b.mp3' }, files('a.mp3', 'take b.mp3'), { kind: 'audio', mediaName: 'take b.mp3' }],
    ['Missing preview name', { category: 'audio', mediaUrl: 'https://example.test/c.mp3' }, files('a.mp3', 'b.mp3'), { kind: 'other' }],
    ['Invalid preview URL', { category: 'audio', mediaUrl: '%' }, files('a.mp3', 'b.mp3'), { kind: 'other' }],
    ['Missing preview URL', { category: 'audio' }, files('a.mp3', 'b.mp3'), { kind: 'other' }],
    ['Pack with meta', { category: 'audio', mediaUrl: 'https://example.test/b.mp3' }, files('meta.json', 'a.mp3', 'b.mp3'), { kind: 'other' }],
    ['Does not select a same-named directory', { category: 'audio', mediaUrl: 'https://example.test/b.mp3' }, [...files('a.mp3', 'c.mp3'), { name: 'b.mp3', isDirectory: true }], { kind: 'other' }],
    ['Mixed video and audio', { category: 'broll' }, files('clip.mp4', 'voice.wav', 'still.png', 'meta.json'), { kind: 'video', mediaName: 'clip.mp4' }],
    ['Image containing HTML', { category: 'still' }, files('still.png', 'fragment.html'), { kind: 'image', mediaName: 'still.png' }],
    ['Image', { category: 'still' }, files('still.png', 'preview.png'), { kind: 'image', mediaName: 'still.png' }],
]) {
    test(`Primary media: ${label}`, () => assert.deepEqual(resolveLibraryAssetMedia(item, children), expected));
}


test('placement routes: copies only own/site storage; Lab, index, and missing storage use the existing route', async () => {
    const { localLibraryAssetPlacementSource } = await import('../lib/common/library-asset-placement.js');
    const item = { origin: 'resolver', category: 'audio', id: 'sample', libraryDir: '/library/audio/sample' };
    for (const sourceKind of ['own', 'site']) {
        assert.deepEqual(localLibraryAssetPlacementSource({ ...item, sourceKind }),
            { category: 'audio', id: 'sample', libraryDir: '/library/audio/sample' });
        assert.equal(localLibraryAssetPlacementSource({ ...item, sourceKind, libraryDir: undefined }), undefined);
    }
    for (const extra of [{ sourceKind: 'lab' }, { sourceKind: undefined }, { origin: 'local', sourceKind: 'site' }]) {
        assert.equal(localLibraryAssetPlacementSource({ ...item, ...extra }), undefined);
    }
});
