import test from 'node:test';
import assert from 'node:assert/strict';
import { selectResolverPlannedMediaName, toResolverAssetCatalogViewItem } from '../lib/common/asset-catalog-view.js';
import { plannedLibraryAssetMedia } from '../lib/common/library-asset-placement.js';

const files = (...names) => names.map(name => ({ name, key: `k/${name}` }));

for (const [label, category, list, expected] of [
    ['still with one image', 'still', files('meta.json', 'bg.png', 'preview.png'), 'bg.png'],
    ['still with two images', 'still', files('one.png', 'two.jpg'), undefined],
    ['still with preview.png only', 'still', files('meta.json', 'preview.png'), undefined],
    ['broll with one video', 'broll', files('clip.mp4', 'preview.png', 'meta.json'), 'clip.mp4'],
    ['broll with no videos', 'broll', files('meta.json', 'preview.png'), undefined],
    ['audio with one audio file', 'audio', files('se.wav', 'meta.json'), 'se.wav'],
    ['overlay is unsupported', 'overlay', files('still.png', 'fragment.html'), undefined],
    ['missing files[] (paid)', 'still', undefined, undefined],
    ['name contains directory', 'still', files('sub/bg.png'), undefined],
    ['empty name', 'still', [{ key: 'k' }], undefined]
]) {
    test(`selectResolverPlannedMediaName: ${label}`, () => {
        assert.equal(selectResolverPlannedMediaName({ category, files: list }), expected);
    });
}

test('toResolverAssetCatalogViewItem includes plannedMediaName', () => {
    const item = toResolverAssetCatalogViewItem({
        id: 'bg-000001', category: 'still', title: 'Morning meadow', files: files('meta.json', 'bg.png', 'preview.png')
    }, undefined, undefined);
    assert.equal(item.plannedMediaName, 'bg.png');
    const unknown = toResolverAssetCatalogViewItem({
        id: 'bg-000002', category: 'still', title: '2 images', files: files('one.png', 'two.png')
    }, undefined, undefined);
    assert.equal('plannedMediaName' in unknown, false);
});

const base = { origin: 'resolver', category: 'still', state: 'available', id: 'bg-000001', price: 0 };

test('plannedLibraryAssetMedia: builds destination from plannedMediaName', () => {
    assert.deepEqual(plannedLibraryAssetMedia({ ...base, plannedMediaName: 'bg.png' }),
        { relativePath: 'assets/still/bg-000001/bg.png', kind: 'image', mediaName: 'bg.png' });
});

test('plannedLibraryAssetMedia: downloaded assets use mediaFile', () => {
    assert.deepEqual(plannedLibraryAssetMedia({ ...base, state: 'cached', mediaFile: 'photo.jpg' }),
        { relativePath: 'assets/still/bg-000001/photo.jpg', kind: 'image', mediaName: 'photo.jpg' });
});

test('plannedLibraryAssetMedia: broll and audio kinds', () => {
    assert.equal(plannedLibraryAssetMedia({ ...base, category: 'broll', plannedMediaName: 'clip.mp4' }).kind, 'video');
    assert.equal(plannedLibraryAssetMedia({ ...base, category: 'audio', plannedMediaName: 'se.wav' }).kind, 'audio');
});

for (const [label, item] of [
    ['missing name', { ...base }],
    ['mismatched kind (html)', { ...base, plannedMediaName: 'fragment.html' }],
    ['mismatched kind (audio in image category)', { ...base, plannedMediaName: 'se.wav' }],
    ['preview.png', { ...base, plannedMediaName: 'preview.png' }],
    ['hidden file', { ...base, plannedMediaName: '.bg.png' }],
    ['directory in name', { ...base, plannedMediaName: 'a/bg.png' }],
    ['directory in ID', { ...base, id: 'a/b', plannedMediaName: 'bg.png' }],
    ['ID is ..', { ...base, id: '..', plannedMediaName: 'bg.png' }],
    ['unpurchased (locked)', { ...base, state: 'locked', plannedMediaName: 'bg.png' }],
    ['Paid', { ...base, price: 500, plannedMediaName: 'bg.png' }],
    ['storage (own)', { ...base, sourceKind: 'own', plannedMediaName: 'bg.png' }],
    ['storage (site)', { ...base, sourceKind: 'site', plannedMediaName: 'bg.png' }],
    ['local source', { ...base, origin: 'local', plannedMediaName: 'bg.png' }],
    ['unplaceable category', { ...base, category: 'overlay', plannedMediaName: 'bg.png' }]
]) {
    test(`plannedLibraryAssetMedia: ${label} is not applied`, () => {
        assert.equal(plannedLibraryAssetMedia(item), undefined);
    });
}
