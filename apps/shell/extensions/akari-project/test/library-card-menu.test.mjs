import test from 'node:test';
import assert from 'node:assert/strict';
import {
    formatYen, isPlaceableLibraryCategory, libraryAssetInfoCard, libraryCardMenuEntries, libraryPresetInfoCard, premiumPromptText
} from '../lib/common/library-card-menu.js';

const asset = (extra = {}) => ({ origin: 'resolver', key: 'still/photo', id: 'photo', category: 'still', title: 'Sunset beach',
    tags: ['Landscape', 'Evening', 'Sea', 'Sky', 'Travel', 'Summer'], sourceKind: 'own', state: 'cached', price: 0, ...extra });
const ids = entries => entries.map(entry => entry.id);

test('placeable assets: Place at playhead / Import only / ★ / View info / Finder / Remove from Library', () => {
    const entries = libraryCardMenuEntries({ kind: 'asset', item: asset({ libraryDir: '/library/still/photo' }) }, false);
    assert.deepEqual(ids(entries), ['place', 'import', 'favorite', 'info', 'reveal', 'remove-library']);
    assert.equal(entries.find(entry => entry.id === 'import').label, 'Import only (do not place)');
    assert.equal(entries.find(entry => entry.id === 'remove-library').danger, true);
    assert.equal(entries.find(entry => entry.id === 'favorite').separator, true);
    assert.equal(entries.find(entry => entry.id === 'reveal').separator, true);
    // 置き場を持たない（Lab のカタログ）素材には Finder・消すを出さない。
    assert.deepEqual(ids(libraryCardMenuEntries({ kind: 'asset', item: asset({ sourceKind: 'lab', state: 'available' }) }, false)),
        ['place', 'import', 'favorite', 'info']);
    for (const category of ['audio', 'broll', 'still']) assert.equal(isPlaceableLibraryCategory({ origin: 'resolver', category }), true);
});

test('★ wording changes with state', () => {
    assert.equal(libraryCardMenuEntries({ kind: 'asset', item: asset() }, false).find(entry => entry.id === 'favorite').label, 'Add to favorites');
    const on = libraryCardMenuEntries({ kind: 'asset', item: asset() }, true).find(entry => entry.id === 'favorite');
    assert.equal(on.label, 'Remove from favorites');
    assert.equal(on.icon, 'star-full');
});

test('Overlays can be placed; 3D can only be imported', () => {
    for (const category of ['overlay', 'scene3d']) {
        const entries = libraryCardMenuEntries({ kind: 'asset', item: asset({ category, key: `${category}/x`, sourceKind: 'lab', state: 'available' }) }, false);
        assert.deepEqual(ids(entries), category === 'overlay'
            ? ['place', 'import', 'favorite', 'info'] : ['import', 'favorite', 'info']);
    }
});

test('fonts apply to selected text', () => {
    const entries = libraryCardMenuEntries({ kind: 'asset', item: asset({ category: 'font', key: 'font/noto-sans-jp' }) }, false);
    assert.deepEqual(ids(entries), ['apply', 'favorite', 'info']);
    assert.equal(entries[0].label, 'Apply to selection');
});

test('unpurchased premium: View in Lab (¥price) / Place at playhead (opens prompt sheet) / ★ / View info', () => {
    const premium = asset({ sourceKind: 'lab', state: 'locked', price: 2980 });
    const entries = libraryCardMenuEntries({ kind: 'asset', item: premium }, false);
    assert.deepEqual(ids(entries), ['lab', 'place', 'favorite', 'info']);
    assert.equal(entries[0].label, 'View in Lab (¥2,980)');
    // 置けない種類のプレミアムには「置く」を出さない。
    assert.deepEqual(ids(libraryCardMenuEntries({ kind: 'asset', item: { ...premium, category: 'overlay' } }, false)), ['lab', 'place', 'favorite', 'info']);
});

test('local index assets: Import (only if not downloaded) / Ask / ★ / View info', () => {
    const local = { origin: 'local', key: 'audio/pack', id: 'pack', category: 'audio', title: 'Packs', tags: [], installed: false };
    assert.deepEqual(ids(libraryCardMenuEntries({ kind: 'asset', item: local }, false)), ['agent-import', 'ask', 'favorite', 'info']);
    assert.deepEqual(ids(libraryCardMenuEntries({ kind: 'asset', item: { ...local, installed: true } }, false)), ['ask', 'favorite', 'info']);
});

test('text appearance menu and My styles', () => {
    assert.deepEqual(ids(libraryCardMenuEntries({ kind: 'textstyle', key: 'textstyle/news' }, false)), ['apply', 'place-text', 'favorite', 'info']);
    assert.deepEqual(ids(libraryCardMenuEntries({ kind: 'textanim', key: 'textanim/fade' }, false)), ['apply', 'favorite', 'info']);
    assert.deepEqual(ids(libraryCardMenuEntries({ kind: 'lut', key: 'lut/x' }, false)), ['apply', 'favorite', 'info']);
    assert.deepEqual(ids(libraryCardMenuEntries({ kind: 'transition', key: 'transition/x' }, false)), ['favorite', 'info']);
    const mine = libraryCardMenuEntries({ kind: 'mystyle', key: 'mystyle/orange' }, false);
    assert.deepEqual(ids(mine), ['apply', 'place-text', 'favorite', 'info', 'rename', 'delete']);
    assert.equal(mine.find(entry => entry.id === 'delete').danger, true);
});

test('menu wording does not use "AI", "group", or emoji symbols', () => {
    const all = [
        ...libraryCardMenuEntries({ kind: 'asset', item: asset({ libraryDir: '/x' }) }, true),
        ...libraryCardMenuEntries({ kind: 'asset', item: asset({ state: 'locked', price: 1 }) }, false),
        ...libraryCardMenuEntries({ kind: 'mystyle', key: 'mystyle/a' }, false)
    ];
    for (const entry of all) assert.doesNotMatch(entry.label, /AI|group|[★☆♛☁✓]/u, entry.label);
});

test('info card: name, creator, price, license name, keywords, and action entry points', () => {
    const card = libraryAssetInfoCard(asset({ libraryDir: '/x' }), 'Image', false);
    assert.equal(card.name, 'Sunset beach');
    assert.equal(card.creator, 'My assets');
    assert.equal(card.creatorSource, 'own');
    assert.deepEqual(card.price, { kind: 'free', label: 'Free' });
    assert.equal(card.keywords[0], 'Image');
    assert.ok(card.keywords.length > 5, 'Count requiring Show all');
    assert.deepEqual(card.actions.map(action => action.id), ['place', 'import', 'favorite']);
    assert.equal(card.actions[0].primary, true);
    assert.equal(card.actions.some(action => ['reveal', 'remove-library', 'info'].includes(action.id)), false);
    const site = libraryAssetInfoCard(asset({ sourceKind: 'site', author: undefined, machineTags: ['site:photo-free'] }), 'Image', false);
    assert.equal(site.creator, 'photo-free');
    assert.ok(site.keywords.includes('photo-free'));
    const author = libraryAssetInfoCard(asset({ sourceKind: 'site', author: 'Music Lab', licenseSpdx: 'CC-BY-4.0' }), 'BGM', false);
    assert.equal(author.creator, 'Music Lab');
    assert.equal(author.license.kind, 'by');
    assert.deepEqual(libraryAssetInfoCard(asset({ tags: ['bgm', 'BGM', 'Bright'] }), 'BGM', false).keywords, ['BGM', 'Bright']);
});

test('info card: unpurchased premium has crown · price and one View in Lab action (+ ★)', () => {
    const card = libraryAssetInfoCard(asset({ sourceKind: 'lab', state: 'locked', price: 2980, author: 'AKARI Video Lab' }), 'Image', false);
    assert.deepEqual(card.price, { kind: 'premium', label: 'Premium · ¥2,980' });
    assert.deepEqual(card.actions.map(action => action.id), ['lab', 'favorite']);
    assert.equal(card.actions[0].label, 'View in Lab (¥2,980)');
    assert.equal(card.license.kind, 'premium');
    const bought = libraryAssetInfoCard(asset({ sourceKind: 'lab', state: 'available', price: 2980 }), 'Image', false);
    assert.deepEqual(bought.price, { kind: 'purchased', label: 'Purchased' });
    assert.equal(bought.creator, 'AKARI Video Lab');
});

test('info card: presets and My styles', () => {
    const style = libraryPresetInfoCard({ key: 'textstyle/news', kind: 'textstyle', name: 'News style', categoryLabel: 'Text style', tags: ['subtitle'] }, false);
    assert.equal(style.creator, 'AKARI Video (standard)');
    assert.equal(style.license.kind, 'builtin');
    assert.deepEqual(style.actions.map(action => action.id), ['apply', 'place-text', 'favorite']);
    assert.deepEqual(style.keywords, ['Text style', 'subtitle']);
    const mine = libraryPresetInfoCard({ key: 'mystyle/o', kind: 'mystyle', name: 'Orange', categoryLabel: 'My styles', tags: ['Emphasis'] }, true);
    assert.equal(mine.creator, 'My assets');
    assert.equal(mine.creatorSource, 'own');
    assert.equal(mine.license.kind, 'own');
    assert.deepEqual(mine.actions.map(action => action.id), ['apply', 'place-text', 'favorite']);
    const lut = libraryPresetInfoCard({ key: 'lut/warm', kind: 'lut', name: 'Warm', categoryLabel: 'LUT' }, false);
    assert.deepEqual(lut.actions.map(action => action.id), ['apply', 'favorite']);
    assert.equal(lut.actions[0].primary, true);
});

test('prompt sheet wording uses price and explains that nothing was placed', () => {
    const text = premiumPromptText({ title: 'Gold decorative frame', price: 2980 });
    assert.equal(text.title, '“Gold decorative frame” is a premium Lab asset');
    assert.match(text.body, /¥2,980/);
    assert.match(text.body, /not been placed yet/);
    assert.equal(text.action, 'View in Lab');
    assert.equal(formatYen(undefined), '¥0');
});
