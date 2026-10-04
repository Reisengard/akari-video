import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assetDistributionBadgeText,
    assetStateBadgeText,
    assetStateBadgeTitle,
    catalogCardUiEventTarget,
    catalogItemPackIds,
    catalogPurchaseActionText,
    deriveAssetDistribution,
    deriveCatalogEmptyStateKind,
    deriveCatalogResolverNotice,
    deriveStoreLabBaseUrl,
    formatCatalogPackBreakdown,
    groupCatalogItemsByPack,
    mergeAssetCatalogViews,
    selectResolverAudioFileRef,
    storeProductUrl,
    summarizeCatalogPackDistribution,
    toResolverAssetCatalogViewItem
} from '../lib/common/asset-catalog-view.js';
import { normalizeEntitledProducts } from '../lib/node/akari-project-service.js';

// カタログ面「1 ビュー」の純関数群（マージ・resolver 生アイテムの正規化・状態バッジ文言）。
// backend の getAssetCatalogView() / loadResolverCatalogItems() が使う本体をここで単体テストする。

test('toResolverAssetCatalogViewItem: normalizes required fields (tags defaults to [], price to 0)', () => {
    const item = toResolverAssetCatalogViewItem(
        { id: 'br-typing-laptop', category: 'still', title: 'Hands typing on a laptop', state: 'available' },
        undefined
    );
    assert.deepEqual(item, {
        origin: 'resolver',
        key: 'still/br-typing-laptop',
        id: 'br-typing-laptop',
        category: 'still',
        title: 'Hands typing on a laptop',
        tags: [],
        sourceKind: undefined,
        folder: undefined,
        addedAt: undefined,
        libraryDir: undefined,
        mediaFile: undefined,
        machineTags: undefined,
        licenseSpdx: undefined,
        price: 0,
        state: 'available',
        previewUrl: undefined,
        mediaUrl: undefined,
        prompt: undefined
    });
});

test('catalogCardUiEventTarget: returns target and label for a still catalog card', () => {
    assert.deepEqual(
        catalogCardUiEventTarget({ key: 'still/br-typing-laptop', title: 'Hands typing on a laptop' }),
        { target: 'asset:still/br-typing-laptop', label: 'Hands typing on a laptop' }
    );
});

test('catalogCardUiEventTarget: returns target and label for an audio catalog card', () => {
    assert.deepEqual(
        catalogCardUiEventTarget({ key: 'audio/bgm-beatslide-124-001', title: 'Boots On Concrete' }),
        { target: 'asset:audio/bgm-beatslide-124-001', label: 'Boots On Concrete' }
    );
});

test('toResolverAssetCatalogViewItem: preserves license.spdx / provenance.prompt / previewUrl', () => {
    const item = toResolverAssetCatalogViewItem(
        {
            id: 'bg-asteroid-belt',
            category: 'still',
            title: 'Asteroid belt background',
            tags: ['background', 'space'],
            license: { spdx: 'CC0-1.0' },
            price: 0,
            state: 'cached',
            provenance: { prompt: 'A field of scattered asteroids...' }
        },
        'https://akari.video/assets/still/bg-asteroid-belt/v1/preview.png'
    );
    assert.equal(item.licenseSpdx, 'CC0-1.0');
    assert.equal(item.prompt, 'A field of scattered asteroids...');
    assert.equal(item.previewUrl, 'https://akari.video/assets/still/bg-asteroid-belt/v1/preview.png');
    assert.equal(item.mediaUrl, undefined);
    assert.deepEqual(item.tags, ['background', 'space']);
});

test('toResolverAssetCatalogViewItem: preserves mediaUrl (audio category preview URL)', () => {
    const item = toResolverAssetCatalogViewItem(
        { id: 'bgm-beatslide-124-001', category: 'audio', title: 'Boots On Concrete', price: 0, state: 'available' },
        'https://raw.githubusercontent.com/AkariLabs/akari-sounds/v0/previews/bgm-beatslide-124-001.jpeg',
        'https://github.com/AkariLabs/akari-sounds/releases/download/v0/bgm-beatslide-124-001.mp3'
    );
    assert.equal(item.mediaUrl, 'https://github.com/AkariLabs/akari-sounds/releases/download/v0/bgm-beatslide-124-001.mp3');
    // previewUrl（サムネ）と mediaUrl（試聴実体）は別フィールドのまま混ざらない。
    assert.notEqual(item.mediaUrl, item.previewUrl);
});

test('toResolverAssetCatalogViewItem: locked items preserve price', () => {
    const item = toResolverAssetCatalogViewItem(
        { id: 'phone-pro-titanium', category: 'scene3d', title: 'Smartphone 3D model', price: 1200, state: 'locked' },
        undefined
    );
    assert.equal(item.price, 1200);
    assert.equal(item.state, 'locked');
});

test('mergeAssetCatalogViews: includes both local-only and resolver-only items', () => {
    const local = [{ origin: 'local', key: 'audio/maoudamashii-se-system-category', id: 'maoudamashii-se-system-category', category: 'audio', title: 'MaouDamashii System', tags: [] }];
    const resolver = [{ origin: 'resolver', key: 'still/br-coffee-pour', id: 'br-coffee-pour', category: 'still', title: 'Pouring coffee', tags: [], price: 0, state: 'available' }];
    const merged = mergeAssetCatalogViews(local, resolver);
    assert.equal(merged.length, 2);
    assert.ok(merged.some(item => item.key === 'audio/maoudamashii-se-system-category' && item.origin === 'local'));
    assert.ok(merged.some(item => item.key === 'still/br-coffee-pour' && item.origin === 'resolver'));
});

test('mergeAssetCatalogViews: resolver wins duplicate IDs (same category/id)', () => {
    const local = [{ origin: 'local', key: 'still/br-typing-laptop', id: 'br-typing-laptop', category: 'still', title: 'Local title', tags: [] }];
    const resolver = [{ origin: 'resolver', key: 'still/br-typing-laptop', id: 'br-typing-laptop', category: 'still', title: 'Resolver title', tags: [], price: 0, state: 'cached' }];
    const merged = mergeAssetCatalogViews(local, resolver);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].origin, 'resolver');
    assert.equal(merged[0].title, 'Resolver title');
});

test('mergeAssetCatalogViews: sorted alphabetically by title', () => {
    const resolver = [
        { origin: 'resolver', key: 'still/b', id: 'b', category: 'still', title: 'Wakame', tags: [], price: 0, state: 'available' },
        { origin: 'resolver', key: 'still/a', id: 'a', category: 'still', title: 'Asahi', tags: [], price: 0, state: 'available' }
    ];
    const merged = mergeAssetCatalogViews([], resolver);
    assert.deepEqual(merged.map(item => item.id), ['a', 'b']);
});

test('mergeAssetCatalogViews: both empty returns an empty array (no exception)', () => {
    assert.deepEqual(mergeAssetCatalogViews([], []), []);
});

test('normalizeEntitledProducts: normalizes three fields and discards rows with non-string IDs', () => {
    assert.deepEqual(normalizeEntitledProducts([
        { id: 'world-kit', kind: 'kit', currentVersion: 4 },
        { id: 'legacy-kit', kind: 1, currentVersion: '3' },
        { id: 42, kind: 'kit', currentVersion: 2 }
    ]), [
        { id: 'world-kit', kind: 'kit', currentVersion: 4 },
        { id: 'legacy-kit', kind: null, currentVersion: null }
    ]);
    assert.deepEqual(normalizeEntitledProducts({}), []);
});

test('assetStateBadgeText: cached shows a check mark', () => {
    assert.equal(assetStateBadgeText({ state: 'cached' }), '✓');
});

test('assetStateBadgeText: available shows a cloud', () => {
    assert.equal(assetStateBadgeText({ state: 'available' }), '☁');
});

test('assetStateBadgeText: locked shows yen and a grouped price', () => {
    assert.equal(assetStateBadgeText({ state: 'locked', price: 1200 }), '¥1,200');
});

test('assetStateBadgeText: locked without a price shows ¥0', () => {
    assert.equal(assetStateBadgeText({ state: 'locked' }), '¥0');
});

test('assetStateBadgeText: missing state (local origin) returns undefined', () => {
    assert.equal(assetStateBadgeText({}), undefined);
});

test('assetStateBadgeText: available with a positive price shows purchased', () => {
    assert.equal(assetStateBadgeText({ state: 'available', price: 2980 }), '✓ Purchased');
});

test('assetStateBadgeText: available without a price remains free', () => {
    assert.equal(assetStateBadgeText({ state: 'available', price: 0 }), '☁');
    assert.equal(assetStateBadgeText({ state: 'available' }), '☁');
});

test('assetStateBadgeTitle: descriptions for all four states', () => {
    assert.equal(assetStateBadgeTitle({ state: 'cached' }), 'Downloaded');
    assert.equal(assetStateBadgeTitle({ state: 'available' }), 'Not downloaded');
    assert.equal(assetStateBadgeTitle({ state: 'available', price: 2980 }), 'Purchased (not downloaded)');
    assert.equal(assetStateBadgeTitle({ state: 'locked', price: 1200 }), '¥1,200 Not purchased');
    assert.equal(assetStateBadgeTitle({}), undefined);
});

test('deriveStoreLabBaseUrl: missing URL defaults to https://akari.video/lab', () => {
    assert.equal(deriveStoreLabBaseUrl(undefined), 'https://akari.video/lab');
});

test('deriveStoreLabBaseUrl: derives the Lab URL from store-credentials.json', () => {
    assert.equal(deriveStoreLabBaseUrl('https://akari.video/api/store'), 'https://akari.video/lab');
    assert.equal(deriveStoreLabBaseUrl('http://localhost:8788/api/store'), 'http://localhost:8788/lab');
});

test('storeProductUrl: constructs asset.html?id=<id>', () => {
    assert.equal(
        storeProductUrl('http://localhost:8788/api/store', 'phone-pro-titanium'),
        'http://localhost:8788/lab/asset.html?id=phone-pro-titanium'
    );
    assert.equal(
        storeProductUrl(undefined, 'app-icon-squircle'),
        'https://akari.video/lab/asset.html?id=app-icon-squircle'
    );
});

test('catalogPurchaseActionText: cards show price; lists show the purchase action', () => {
    const url = 'https://akari.video/lab/asset.html?id=paid-asset';
    assert.deepEqual(catalogPurchaseActionText(2980, 'grid', url), {
        label: '¥2,980',
        title: `¥2,980 to purchase — Open AKARI Video Lab(${url})`
    });
    assert.deepEqual(catalogPurchaseActionText(2980, 'list', url), {
        label: '¥2,980 to purchase',
        title: `¥2,980 to purchase — Open AKARI Video Lab(${url})`
    });
});

test('catalogPurchaseActionText: missing price consistently shows ¥0', () => {
    const url = 'https://example.com/asset';
    assert.equal(catalogPurchaseActionText(undefined, 'grid', url).label, '¥0');
    assert.match(catalogPurchaseActionText(undefined, 'list', url).title, /^¥0 to purchase — Open AKARI Video Lab/);
});

test('selectResolverAudioFileRef: selects a URL audio file in the audio category', () => {
    const ref = selectResolverAudioFileRef({
        category: 'audio',
        files: [{ name: 'bgm-beatslide-124-001.mp3', url: 'https://github.com/AkariLabs/akari-sounds/releases/download/v0/bgm-beatslide-124-001.mp3' }]
    });
    assert.equal(ref, 'https://github.com/AkariLabs/akari-sounds/releases/download/v0/bgm-beatslide-124-001.mp3');
});

test('selectResolverAudioFileRef: returns an audio key relative to base', () => {
    const ref = selectResolverAudioFileRef({
        category: 'audio',
        files: [{ name: 'se-click.wav', key: 'audio/se-click/v1/se-click.wav' }]
    });
    assert.equal(ref, 'audio/se-click/v1/se-click.wav');
});

test('selectResolverAudioFileRef: selects the first file with an audio extension', () => {
    const ref = selectResolverAudioFileRef({
        category: 'audio',
        files: [
            { name: 'cover.jpeg', url: 'https://example.com/cover.jpeg' },
            { name: 'bgm-a.m4a', url: 'https://example.com/bgm-a.m4a' },
            { name: 'bgm-b.ogg', url: 'https://example.com/bgm-b.ogg' }
        ]
    });
    assert.equal(ref, 'https://example.com/bgm-a.m4a');
});

test('selectResolverAudioFileRef: ignores files outside the audio category', () => {
    const ref = selectResolverAudioFileRef({
        category: 'still',
        files: [{ name: 'photo.mp3', url: 'https://example.com/photo.mp3' }]
    });
    assert.equal(ref, undefined);
});

test('selectResolverAudioFileRef: missing or non-audio files return undefined', () => {
    assert.equal(selectResolverAudioFileRef({ category: 'audio' }), undefined);
    assert.equal(selectResolverAudioFileRef({ category: 'audio', files: [] }), undefined);
    assert.equal(selectResolverAudioFileRef({ category: 'audio', files: [{ name: 'not-audio.txt', url: 'https://example.com/not-audio.txt' }] }), undefined);
});

// --- deriveAssetDistribution / assetDistributionBadgeText（分類バッジ 4 分類、task.md §2） ------
// 優先順位（installed > paid-license-required > remote）の実データ確認: catalog/font/
// 851-chikara-dzuyoku（free）・vdl-v7-mincho（paid）・ab-kirigirisu（subscription）。

test('deriveAssetDistribution: installed always takes bundled priority', () => {
    const distribution = deriveAssetDistribution({
        installed: true,
        licenseScope: 'paid-license-required',
        remote: true,
        tags: ['subscription']
    });
    assert.equal(distribution, 'bundled');
});

test('deriveAssetDistribution: paid license without a subscription tag is paid', () => {
    const distribution = deriveAssetDistribution({
        installed: false,
        licenseScope: 'paid-license-required',
        remote: true,
        tags: ['font', 'paid']
    });
    assert.equal(distribution, 'paid');
});

test('deriveAssetDistribution: paid license with a subscription tag is subscription', () => {
    const distribution = deriveAssetDistribution({
        installed: false,
        licenseScope: 'paid-license-required',
        remote: true,
        tags: ['font', 'subscription', 'byo-font']
    });
    assert.equal(distribution, 'subscription');
});

test('deriveAssetDistribution: remote without a paid license is free', () => {
    const distribution = deriveAssetDistribution({
        installed: false,
        licenseScope: 'commercial-ok',
        remote: true,
        tags: ['font']
    });
    assert.equal(distribution, 'free');
});

test('deriveAssetDistribution: no distribution returns undefined', () => {
    assert.equal(deriveAssetDistribution({ installed: false, licenseScope: 'commercial-ok', remote: false }), undefined);
    assert.equal(deriveAssetDistribution({ installed: false }), undefined);
});

test('deriveAssetDistribution: missing tags do not throw', () => {
    assert.equal(deriveAssetDistribution({ installed: false, licenseScope: 'paid-license-required' }), 'paid');
});

test('assetDistributionBadgeText: bundled shows bundled', () => {
    assert.equal(assetDistributionBadgeText('bundled'), '✓ Bundled');
});

test('assetDistributionBadgeText: subscription shows subscription', () => {
    assert.equal(assetDistributionBadgeText('subscription'), 'Subscription');
});

test('assetDistributionBadgeText: paid shows separate purchase', () => {
    assert.equal(assetDistributionBadgeText('paid'), '¥ Obtain separately');
});

test('assetDistributionBadgeText: free direct downloads show free download', () => {
    assert.equal(assetDistributionBadgeText('free'), '☁ Free download');
    assert.equal(assetDistributionBadgeText('free', 'direct'), '☁ Free download');
});

test('assetDistributionBadgeText: free login downloads show registration required', () => {
    assert.equal(assetDistributionBadgeText('free', 'login'), '☁ Free download (registration required)');
});

test('assetDistributionBadgeText: missing distribution hides the badge', () => {
    assert.equal(assetDistributionBadgeText(undefined), undefined);
});

// --- パック棚: catalogItemPackIds / groupCatalogItemsByPack / summarizeCatalogPackDistribution /
// formatCatalogPackBreakdown（task.md §3） ------------------------------------------------------

test('catalogItemPackIds: extracts IDs from pack: tags', () => {
    assert.deepEqual(catalogItemPackIds({ tags: ['font', 'pack:font25-2026-08', 'handwriting'] }), ['font25-2026-08']);
});

test('catalogItemPackIds: no pack: tags returns an empty array', () => {
    assert.deepEqual(catalogItemPackIds({ tags: ['font', 'handwriting'] }), []);
    assert.deepEqual(catalogItemPackIds({}), []);
});

test('catalogItemPackIds: extracts every pack: tag', () => {
    assert.deepEqual(catalogItemPackIds({ tags: ['pack:a', 'pack:b'] }), ['a', 'b']);
});

const PACKS = [{ id: 'font25-2026-08', category: 'font', title: '25 essential fonts for Captions', summary: '25 reviewed typefaces' }];

function fontItem(id, title, tags, extra) {
    return { origin: 'local', key: `font/${id}`, id, category: 'font', title, tags, ...extra };
}

test('groupCatalogItemsByPack: groups tagged items and retains unrelated items', () => {
    const items = [
        fontItem('a', 'Typeface A', ['pack:font25-2026-08']),
        fontItem('b', 'Typeface B', ['pack:font25-2026-08']),
        fontItem('c', 'Typeface C', ['font'])
    ];
    const { groups, ungrouped } = groupCatalogItemsByPack(items, PACKS);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].pack.id, 'font25-2026-08');
    assert.deepEqual(groups[0].items.map(item => item.id), ['a', 'b']);
    assert.deepEqual(ungrouped.map(item => item.id), ['c']);
});

test('groupCatalogItemsByPack: unknown pack IDs remain ungrouped', () => {
    const items = [fontItem('x', 'Typeface X', ['pack:unknown-pack'])];
    const { groups, ungrouped } = groupCatalogItemsByPack(items, PACKS);
    assert.equal(groups.length, 0);
    assert.deepEqual(ungrouped.map(item => item.id), ['x']);
});

test('groupCatalogItemsByPack: empty packs do not create sections', () => {
    const { groups } = groupCatalogItemsByPack([], PACKS);
    assert.deepEqual(groups, []);
});

test('groupCatalogItemsByPack: multiple tags put an item in every matching pack', () => {
    const packs = [
        { id: 'p1', category: 'font', title: 'Pack 1' },
        { id: 'p2', category: 'font', title: 'Pack 2' }
    ];
    const items = [fontItem('shared', 'Shared typeface', ['pack:p1', 'pack:p2'])];
    const { groups, ungrouped } = groupCatalogItemsByPack(items, packs);
    assert.equal(groups.length, 2);
    assert.ok(groups.every(group => group.items.some(item => item.id === 'shared')));
    assert.deepEqual(ungrouped, []);
});

test('groupCatalogItemsByPack: groups follow packs.json order', () => {
    const packs = [
        { id: 'p1', category: 'font', title: 'Pack 1' },
        { id: 'p2', category: 'font', title: 'Pack 2' }
    ];
    const items = [fontItem('b', 'B', ['pack:p2']), fontItem('a', 'A', ['pack:p1'])];
    const { groups } = groupCatalogItemsByPack(items, packs);
    assert.deepEqual(groups.map(group => group.pack.id), ['p1', 'p2']);
});

test('summarizeCatalogPackDistribution: counts distribution and total', () => {
    const items = [
        { distribution: 'bundled' },
        { distribution: 'bundled' },
        { distribution: 'free' },
        { distribution: 'paid' },
        { distribution: 'subscription' },
        { distribution: undefined }
    ];
    assert.deepEqual(summarizeCatalogPackDistribution(items), {
        total: 6, bundled: 2, free: 1, paid: 1, subscription: 1
    });
});

test('formatCatalogPackBreakdown: omits zero-count categories', () => {
    const breakdown = { total: 23, bundled: 9, free: 14, paid: 0, subscription: 0 };
    assert.equal(formatCatalogPackBreakdown(breakdown), '23 items — Bundled 9 / Free download 14');
});

test('formatCatalogPackBreakdown: all-zero categories show only the count', () => {
    assert.equal(formatCatalogPackBreakdown({ total: 0, bundled: 0, free: 0, paid: 0, subscription: 0 }), '0 items');
});

// カタログ面の空状態分岐（catalog-account-first-ux task.md §1/§2）。
// resolver 失敗 / resolver 成功だが 0 件 / 件数ありの 3 パターンをここで単体テストする
// （L0 受け入れ条件「空状態分岐の単体テスト追加」の実体）。

test('deriveCatalogEmptyStateKind: positive count means items regardless of resolver state', () => {
    assert.equal(deriveCatalogEmptyStateKind(1, 'ok'), 'items');
    assert.equal(deriveCatalogEmptyStateKind(3, 'failed'), 'items');
});

test('deriveCatalogEmptyStateKind: no items and resolver failure means resolver-failed', () => {
    assert.equal(deriveCatalogEmptyStateKind(0, 'failed'), 'resolver-failed');
});

test('deriveCatalogEmptyStateKind: no items and resolver success means empty', () => {
    assert.equal(deriveCatalogEmptyStateKind(0, 'ok'), 'empty');
});

test('deriveCatalogResolverNotice: unauthorized requests reconnection without retry', () => {
    assert.deepEqual(deriveCatalogResolverNotice('ok', 'unauthorized'), {
        kind: 'unauthorized',
        message: 'Your AKARI account is disconnected — reconnect from Home',
        retry: false
    });
});

test('deriveCatalogResolverNotice: entitlement error offers retry', () => {
    assert.deepEqual(deriveCatalogResolverNotice('ok', 'error'), {
        kind: 'error',
        message: 'Failed to retrieve account assets',
        retry: true
    });
});

test('deriveCatalogResolverNotice: ok and no_credentials omit the notice', () => {
    assert.equal(deriveCatalogResolverNotice('ok', 'ok'), undefined);
    assert.equal(deriveCatalogResolverNotice('ok', 'no_credentials'), undefined);
});

test('deriveCatalogResolverNotice: resolver failure offers retry', () => {
    assert.deepEqual(deriveCatalogResolverNotice('failed', 'error'), {
        kind: 'error',
        message: 'Failed to retrieve account assets',
        retry: true
    });
});
