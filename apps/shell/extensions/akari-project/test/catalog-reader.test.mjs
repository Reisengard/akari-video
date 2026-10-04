import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CATALOG_AUDIO_BGM_CATEGORY,
    CATALOG_AUDIO_SFX_CATEGORY,
    CATALOG_CATEGORIES,
    classifyCatalogAudioItem,
    deriveCatalogCategoryChips,
    deriveCatalogFilteredEmptyKind,
    filterCatalogItems,
    normalizeCatalogViewMode,
    parseCatalogItemMeta
} from '../lib/common/catalog-reader.js';

// meta.json 寛容リーダー単体テスト（task.md L0: 必須3フィールドのみ / 欠落 / 壊れJSON の3様態）
// + 検索・カテゴリフィルタの純関数。

test('parseCatalogItemMeta: reads the minimal ID, category, title shape', () => {
    const raw = JSON.stringify({ id: 'vintage-camera', category: '3d', title: 'Vintage camera' });
    const parsed = parseCatalogItemMeta(raw);
    assert.deepEqual(parsed, {
        id: 'vintage-camera',
        category: '3d',
        title: 'Vintage camera',
        description: undefined,
        tags: undefined,
        when_to_use: undefined,
        license: undefined,
        source: undefined,
        remote: undefined
    });
});

test('parseCatalogItemMeta: missing category returns undefined', () => {
    const raw = JSON.stringify({ id: 'x', title: 'no category' });
    assert.equal(parseCatalogItemMeta(raw), undefined);
});

test('parseCatalogItemMeta: empty required fields return undefined', () => {
    const raw = JSON.stringify({ id: '', category: '3d', title: 'x' });
    assert.equal(parseCatalogItemMeta(raw), undefined);
});

test('parseCatalogItemMeta: malformed JSON returns undefined', () => {
    assert.equal(parseCatalogItemMeta('{ broken json ,,,'), undefined);
});

test('parseCatalogItemMeta: non-object JSON returns undefined', () => {
    assert.equal(parseCatalogItemMeta('[1, 2, 3]'), undefined);
    assert.equal(parseCatalogItemMeta('"just a string"'), undefined);
});

test('parseCatalogItemMeta: ignores unknown fields and reads known fields', () => {
    const raw = JSON.stringify({
        id: 'vintage-camera',
        category: '3d',
        title: 'Vintage camera 3D model',
        description: 'Camera model with a leather strap',
        tags: ['product-demo', 'vintage', 'camera'],
        when_to_use: 'Retro scene',
        license: { spdx: 'CC0-1.0', scope: 'commercial-ok' },
        source: { url: 'https://polyhaven.com/a/Camera_01', preview_url: 'https://cdn.polyhaven.com/x.png' },
        knobs: [{ cssVar: '--rotate-y' }],
        ai_usage: 'Description'
    });
    const parsed = parseCatalogItemMeta(raw);
    assert.equal(parsed.description, 'Camera model with a leather strap');
    assert.deepEqual(parsed.tags, ['product-demo', 'vintage', 'camera']);
    assert.equal(parsed.when_to_use, 'Retro scene');
    assert.deepEqual(parsed.license, { spdx: 'CC0-1.0', scope: 'commercial-ok' });
    assert.deepEqual(parsed.source, { url: 'https://polyhaven.com/a/Camera_01', preview_url: 'https://cdn.polyhaven.com/x.png', acquisition: undefined });
});

test('parseCatalogItemMeta: missing license and source remain undefined', () => {
    const raw = JSON.stringify({ id: 'x', category: 'audio', title: 'y', license: {}, source: {} });
    const parsed = parseCatalogItemMeta(raw);
    assert.equal(parsed.license, undefined);
    assert.equal(parsed.source, undefined);
});

// remote / license.scope / source.acquisition — 分類バッジ導出（distribution）が要る新フィールド
// （task.md §1）。実データ確認済み: catalog/font/851-chikara-dzuyoku（free）・
// catalog/font/vdl-v7-mincho（paid）・catalog/font/ab-kirigirisu（subscription）。

test('parseCatalogItemMeta: reads remote true', () => {
    const raw = JSON.stringify({ id: '851-chikara-dzuyoku', category: 'font', title: '851 Chikara Dzuyoku', remote: true });
    assert.equal(parseCatalogItemMeta(raw).remote, true);
});

test('parseCatalogItemMeta: reads remote false', () => {
    const raw = JSON.stringify({ id: 'x', category: 'font', title: 'y', remote: false });
    assert.equal(parseCatalogItemMeta(raw).remote, false);
});

test('parseCatalogItemMeta: non-boolean remote is ignored', () => {
    const raw = JSON.stringify({ id: 'x', category: 'font', title: 'y', remote: 'yes' });
    assert.equal(parseCatalogItemMeta(raw).remote, undefined);
});

test('parseCatalogItemMeta: missing remote returns undefined', () => {
    const raw = JSON.stringify({ id: 'x', category: 'font', title: 'y' });
    assert.equal(parseCatalogItemMeta(raw).remote, undefined);
});

test('parseCatalogItemMeta: reads license.scope alongside spdx', () => {
    const raw = JSON.stringify({
        id: 'vdl-v7-mincho', category: 'font', title: 'VDL V7 Mincho',
        license: { spdx: 'LicenseRef-proprietary', scope: 'paid-license-required' }
    });
    const parsed = parseCatalogItemMeta(raw);
    assert.deepEqual(parsed.license, { spdx: 'LicenseRef-proprietary', scope: 'paid-license-required' });
});

test('parseCatalogItemMeta: reads license.scope without spdx', () => {
    const raw = JSON.stringify({ id: 'x', category: 'font', title: 'y', license: { scope: 'commercial-ok' } });
    const parsed = parseCatalogItemMeta(raw);
    assert.deepEqual(parsed.license, { spdx: undefined, scope: 'commercial-ok' });
});

test('parseCatalogItemMeta: reads source.acquisition alongside URL and preview URL', () => {
    const raw = JSON.stringify({
        id: 'ab-kirigirisu', category: 'font', title: 'AB Kirisame',
        source: { url: 'https://fonts.adobe.com/fonts/ab-kirigirisu', acquisition: 'login' }
    });
    const parsed = parseCatalogItemMeta(raw);
    assert.equal(parsed.source.acquisition, 'login');
    assert.equal(parsed.source.url, 'https://fonts.adobe.com/fonts/ab-kirigirisu');
});

test('parseCatalogItemMeta: reads source.acquisition without URLs', () => {
    const raw = JSON.stringify({ id: 'x', category: 'font', title: 'y', source: { acquisition: 'direct' } });
    const parsed = parseCatalogItemMeta(raw);
    assert.deepEqual(parsed.source, { url: undefined, preview_url: undefined, acquisition: 'direct' });
});

const CATEGORY_ITEMS = [
    { id: 'vintage-camera', category: '3d', title: 'Vintage camera 3D model', tags: ['vintage', 'camera'], description: 'Retro camera' },
    { id: 'modern-smartphone', category: '3d', title: 'Modern smartphone', tags: ['product-demo'] },
    { id: 'corporate-upbeat-bgm', category: 'audio', title: 'Corporate BGM', tags: ['bgm'], description: 'upbeat corporate track' },
    { id: 'camera-shutter', category: 'audio', title: 'Camera shutter', tags: ['sfx', 'camera'] }
];

test('filterCatalogItems: category=all passes every item', () => {
    assert.equal(filterCatalogItems(CATEGORY_ITEMS, '', 'all').length, 4);
});

test('filterCatalogItems: filters by category chip', () => {
    const result = filterCatalogItems(CATEGORY_ITEMS, '', '3d');
    assert.equal(result.length, 2);
    assert.ok(result.every(item => item.category === '3d'));
});

test('classifyCatalogAudioItem: classifies only sfx as audio clips and bgm / jingle / untagged as BGM', () => {
    assert.equal(classifyCatalogAudioItem({ tags: ['sfx', 'camera'] }), 'sfx');
    assert.equal(classifyCatalogAudioItem({ tags: ['bgm', 'upbeat'] }), 'bgm');
    assert.equal(classifyCatalogAudioItem({ tags: ['jingle'] }), 'bgm');
    assert.equal(classifyCatalogAudioItem({}), 'bgm');
});

test('filterCatalogItems: BGM / audio clip chips split audio by tags', () => {
    assert.deepEqual(
        filterCatalogItems(CATEGORY_ITEMS, '', CATALOG_AUDIO_BGM_CATEGORY).map(item => item.id),
        ['corporate-upbeat-bgm']
    );
    assert.deepEqual(
        filterCatalogItems(CATEGORY_ITEMS, '', CATALOG_AUDIO_SFX_CATEGORY).map(item => item.id),
        ['camera-shutter']
    );
});

test('filterCatalogItems: searches titles', () => {
    const result = filterCatalogItems(CATEGORY_ITEMS, 'Smartphone', 'all');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'modern-smartphone');
});

test('filterCatalogItems: searches descriptions too', () => {
    const result = filterCatalogItems(CATEGORY_ITEMS, 'corporate', 'all');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'corporate-upbeat-bgm');
});

test('filterCatalogItems: searches tags too', () => {
    const result = filterCatalogItems(CATEGORY_ITEMS, 'vintage', 'all');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'vintage-camera');
});

test('filterCatalogItems: filters by both search term and category', () => {
    const result = filterCatalogItems(CATEGORY_ITEMS, 'product-demo', '3d');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'modern-smartphone');
});

test('filterCatalogItems: no matches returns 0 items without exceptions', () => {
    assert.equal(filterCatalogItems(CATEGORY_ITEMS, 'no-such-term', 'all').length, 0);
});

test('deriveCatalogCategoryChips: splits audio into BGM → audio clips and always shows zero counts', () => {
    const chips = deriveCatalogCategoryChips([
        { category: 'audio', tags: ['bgm'] },
        { category: 'audio', tags: ['sfx'] },
        { category: 'audio', tags: ['jingle'] },
        { category: 'audio' },
        { category: 'scene3d' }
    ]);
    assert.deepEqual(chips.map(chip => chip.category), [
        'overlay', 'still', 'scene3d', CATALOG_AUDIO_BGM_CATEGORY, CATALOG_AUDIO_SFX_CATEGORY, 'broll', 'font'
    ]);
    assert.deepEqual(chips.map(chip => chip.label), ['Overlay', 'Still image', '3D', 'BGM', 'Audio clip', 'B-roll', 'Fonts']);
    assert.deepEqual(chips.map(chip => chip.count), [0, 0, 1, 3, 1, 0, 0]);
});

test('deriveCatalogCategoryChips: appends unknown categories without removing existing items', () => {
    const chips = deriveCatalogCategoryChips([
        { category: 'zeta' },
        { category: 'audio' },
        { category: 'avatars' },
        { category: 'zeta' }
    ]);
    assert.deepEqual(chips.slice(0, 7).map(chip => chip.category), [
        'overlay', 'still', 'scene3d', CATALOG_AUDIO_BGM_CATEGORY, CATALOG_AUDIO_SFX_CATEGORY, 'broll', 'font'
    ]);
    assert.deepEqual(chips.slice(7), [
        { category: 'avatars', label: 'avatars', count: 1 },
        { category: 'zeta', label: 'zeta', count: 2 }
    ]);
});

test('textstyle is a known catalog folder but has no general catalog chip', () => {
    assert.ok(CATALOG_CATEGORIES.includes('textstyle'));
    assert.ok(!deriveCatalogCategoryChips([{ category: 'textstyle' }]).some(chip => chip.category === 'textstyle'));
});

test('deriveCatalogFilteredEmptyKind: distinguishes empty categories from empty searches', () => {
    assert.equal(deriveCatalogFilteredEmptyKind(CATEGORY_ITEMS, 'font'), 'category-empty');
    assert.equal(deriveCatalogFilteredEmptyKind(CATEGORY_ITEMS, CATALOG_AUDIO_BGM_CATEGORY), 'no-match');
    assert.equal(deriveCatalogFilteredEmptyKind(CATEGORY_ITEMS, CATALOG_AUDIO_SFX_CATEGORY), 'no-match');
    assert.equal(deriveCatalogFilteredEmptyKind(CATEGORY_ITEMS, 'all'), 'no-match');
});

test('normalizeCatalogViewMode: restores only list and defaults missing or unknown values to grid', () => {
    assert.equal(normalizeCatalogViewMode('list'), 'list');
    assert.equal(normalizeCatalogViewMode('grid'), 'grid');
    assert.equal(normalizeCatalogViewMode('tiles'), 'grid');
    assert.equal(normalizeCatalogViewMode(undefined), 'grid');
});
