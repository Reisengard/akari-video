import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { toResolverAssetCatalogViewItem, groupCatalogItemsByPack } from '../lib/common/asset-catalog-view.js';
import { filterLibraryCatalogItems, libraryItemSource, countLibraryCategory, recentLibraryEntries } from '../lib/common/library-source-view.js';
import { LIBRARY_GROUPS } from '../lib/common/library-home-view.js';
import { resolveResolverCatalogUrls } from '../lib/node/resolver-preview-url.js';
import { canPlaceLibraryAsset } from '../lib/common/library-asset-placement.js';

const raw = (id, extra = {}) => ({ id, category: 'audio', title: `Footage ${id}`, tags: [], sourceKind: 'own',
    state: 'cached', libraryDir: `/tmp/library/audio/${id}`, mediaFile: 'Audio #1.wav', addedAt: '2026-09-21T00:00:00Z', ...extra });
const view = (id, extra = {}) => toResolverAssetCatalogViewItem(raw(id, extra), undefined);
const category = key => LIBRARY_GROUPS.flatMap(group => group.categories).find(row => row.key === key);
const presets = { textstyle: [{ id: 'a' }], textanim: [{ id: 'b' }], lut: [{ id: 'c' }] };

test('copies resolver sourceKind and storage info without reclassifying from other clues', () => {
    for (const sourceKind of ['own', 'site', 'lab']) {
        const input = raw('one', { sourceKind, folder: 'Travel', machineTags: ['origin:own'] });
        const item = toResolverAssetCatalogViewItem(input, undefined);
        for (const key of ['sourceKind', 'folder', 'libraryDir', 'addedAt', 'mediaFile']) assert.equal(item[key], input[key]);
        assert.equal(libraryItemSource(item), sourceKind);
    }
    assert.equal(libraryItemSource({ origin: 'resolver', tags: ['origin:own'] }), undefined);
    assert.equal(libraryItemSource({ origin: 'local' }), 'site');
});

test('excludes machine tags from display and search while retaining pack membership use', () => {
    const machineTags = ['origin:site', 'site:sample', 'folder:Travel', 'license:subscription', 'pack:sample'];
    const item = view('one', { tags: ['Bright'], machineTags });
    assert.deepEqual(item.tags, ['Bright']);
    for (const query of machineTags) assert.equal(filterLibraryCatalogItems([item], 'all', query, 'all').length, 0);
    assert.equal(filterLibraryCatalogItems([item], 'all', 'Bright', 'all').length, 1);
    assert.equal(groupCatalogItemsByPack([item], [{ id: 'sample' }]).groups[0].items.length, 1);
});

test('applies the same source to counts and category results; external indexes count as site', () => {
    const items = [view('own', { tags: ['sfx'] }), view('site', { sourceKind: 'site' }), view('lab', { sourceKind: 'lab' }),
        { ...view('index'), origin: 'local', libraryDir: undefined }];
    const expected = { all: [3, 1], own: [0, 1], site: [2, 0], lab: [1, 0] };
    for (const [source, [bgm, sfx]] of Object.entries(expected)) {
        for (const [key, count] of [['bgm', bgm], ['sfx', sfx]]) {
            const definition = category(key);
            assert.equal(countLibraryCategory(definition, source, items, presets, 12, []), count);
            assert.equal(filterLibraryCatalogItems(items, source, '', definition.chipKey).length, count);
        }
        for (const key of ['textstyle', 'textanim', 'lut', 'transition']) {
            assert.equal(countLibraryCategory(category(key), source, items, presets, 12, []),
                source === 'all' || source === 'lab' ? (key === 'transition' ? 12 : 1) : 0);
        }
    }
});

test('recent strip sorts newest first, groups by folder, limits to eight, and preserves input', () => {
    const items = Array.from({ length: 12 }, (_, i) => view(`n${i}`, { addedAt: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00Z` }));
    items.push(view('folder-a', { folder: 'Travel', tags: ['sfx'] }), view('folder-b', { folder: 'Travel' }), view('folder-c', { folder: 'Travel' }));
    const before = JSON.stringify(items);
    const entries = recentLibraryEntries(items, 'all');
    assert.equal(entries.length, 8);
    assert.deepEqual(entries[0], { key: 'folder:Travel', label: 'Travel', folder: 'Travel', category: 'sfx', itemKey: 'audio/folder-a', count: 3 });
    assert.equal(entries[1].itemKey, 'audio/n11');
    assert.equal(entries[7].itemKey, 'audio/n5');
    assert.equal(JSON.stringify(items), before);
    assert.equal(filterLibraryCatalogItems(items, 'own', '', 'audio:bgm', 'Travel').length, 2);
});

test('strip includes own/site and used Lab; hides empty, unused Lab, undownloaded, and invalid dates', () => {
    assert.deepEqual(recentLibraryEntries([], 'all'), []);
    const items = [view('own'), view('site', { sourceKind: 'site' }), view('lab', { sourceKind: 'lab' }),
        view('invalid', { addedAt: 'invalid' }), view('remote', { libraryDir: undefined }),
        { ...view('index'), origin: 'local' }];
    assert.equal(recentLibraryEntries(items, 'all').length, 2);
    assert.equal(recentLibraryEntries(items, 'own').length, 1);
    assert.equal(recentLibraryEntries(items, 'site').length, 1);
    assert.deepEqual(recentLibraryEntries(items, 'lab'), []);
    const usedLab = { ...view('used-lab', { sourceKind: 'lab' }), usageCount: 2 };
    assert.deepEqual(recentLibraryEntries([usedLab], 'lab').map(entry => entry.itemKey), [usedLab.key]);
});

test('storage primary media and thumbnails use file URIs; encodes spaces, non-ASCII characters, and #', () => {
    const item = raw('one', { libraryDir: '/tmp/café storage/audio/one', preview: 'preview.png' });
    const urls = resolveResolverCatalogUrls(item, 'https://example.test/catalog/');
    assert.equal(urls.mediaUrl, pathToFileURL(`${item.libraryDir}/${item.mediaFile}`).href);
    assert.equal(urls.previewUrl, pathToFileURL(`${item.libraryDir}/preview.png`).href);
    assert.equal(canPlaceLibraryAsset(toResolverAssetCatalogViewItem(item, urls.previewUrl, urls.mediaUrl)), true);
    assert.equal(resolveResolverCatalogUrls({ ...item, mediaFile: null, preview: null }, 'https://example.test/').mediaUrl, undefined);
    assert.equal(resolveResolverCatalogUrls({ category: 'audio', files: [{ name: 'x.mp3', key: 'x.mp3' }] }, 'https://example.test/').mediaUrl, 'https://example.test/x.mp3');
});

test('downloaded Lab relative thumbnail keys and multiple preview takes preserve catalog base', () => {
    const item = raw('lab', { sourceKind: 'lab', preview: 'audio/lab/v1/preview.png', mediaFile: null,
        files: [{ name: 'take-a.mp3', key: 'audio/lab/v1/take-a.mp3' }, { name: 'take-b.mp3', key: 'audio/lab/v1/take-b.mp3' }] });
    assert.deepEqual(resolveResolverCatalogUrls(item, 'https://example.test/'), {
        previewUrl: 'https://example.test/audio/lab/v1/preview.png', mediaUrl: 'https://example.test/audio/lab/v1/take-a.mp3'
    });
    assert.equal(resolveResolverCatalogUrls(raw('offline'), null).mediaUrl, pathToFileURL('/tmp/library/audio/offline/Audio #1.wav').href);
});
