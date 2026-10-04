import test from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY_DETAIL_GROUPS, LIBRARY_GROUPS, LIBRARY_PRIMARY_TILES, resolveOpenableLibraryCategory, searchLibraryHome } from '../lib/common/library-home-view.js';

// 2026-09-27 オーナー改訂: 9 枚 → 16 枚。仕上げ・まとめて・マイスタイルも同じカードで
// 最上段へ出し、B-roll は「動画」と呼ぶ（データキー broll は維持）。
test('top row has 16 tiles, separates Create and Choose, and declares row breaks', () => {
    assert.deepEqual(LIBRARY_PRIMARY_TILES.map(tile => tile.key), [
        'text', 'shapes', 'stamps',
        'image', 'broll', 'bgm', 'sfx', 'overlay', 'scene3d',
        'lut', 'transition', 'fx', 'motion',
        'mypresets', 'template', 'pack'
    ]);
    assert.deepEqual(LIBRARY_PRIMARY_TILES.map(tile => tile.kind), [
        'make', 'make', 'make',
        'pick', 'pick', 'pick', 'pick', 'pick', 'pick',
        'pick', 'pick', 'pick', 'pick',
        'pick', 'pick', 'pick'
    ]);
    assert.deepEqual(LIBRARY_PRIMARY_TILES.filter(tile => tile.status === 'soon').map(tile => tile.key),
        ['stamps', 'fx', 'motion', 'mypresets', 'template']);
    assert.equal(LIBRARY_PRIMARY_TILES[0].hint, 'Click to browse or drag to place');
    // 段の区切りは見出しではなく線 1 本。線を引く位置は startsGroup が持つ。
    assert.deepEqual(LIBRARY_PRIMARY_TILES.filter(tile => tile.startsGroup).map(tile => tile.key),
        ['image', 'lut', 'mypresets']);
    // 画面語と内部キーを切り離す（B-roll → 動画・パック → セット・テンプレート → ひな形）。
    const label = key => LIBRARY_PRIMARY_TILES.find(tile => tile.key === key).label;
    assert.equal(label('broll'), 'Video');
    assert.equal(label('pack'), 'Set');
    assert.equal(label('template'), 'Template');
    assert.equal(label('mypresets'), 'My styles');
    // 2 枚重ねカードの絵と台座色は全タイルが持つ。
    assert.ok(LIBRARY_PRIMARY_TILES.every(tile => typeof tile.art === 'string' && tile.art.length > 0));
    assert.ok(LIBRARY_PRIMARY_TILES.every(tile => tile.plate.length === 2
        && tile.plate.every(color => /^#[0-9a-f]{6}$/.test(color))));
});

test('details show only My items while preserving external resolution for all categories', () => {
    assert.deepEqual(LIBRARY_DETAIL_GROUPS.map(group => group.label), ['My library']);
    const detailKeys = LIBRARY_DETAIL_GROUPS.flatMap(group => group.categories.map(category => category.key));
    assert.deepEqual(detailKeys, ['fav', 'brandkit']);
    const primaryCategoryKeys = LIBRARY_PRIMARY_TILES.filter(tile => tile.key !== 'text').map(tile => tile.key);
    assert.equal(detailKeys.some(key => primaryCategoryKeys.includes(key)), false);
    assert.deepEqual(new Set([...detailKeys, ...primaryCategoryKeys, 'textstyle', 'textanim', 'font']),
        new Set(LIBRARY_GROUPS.flatMap(group => group.categories.map(category => category.key))));
    assert.equal(resolveOpenableLibraryCategory('bgm'), 'bgm');
    assert.equal(resolveOpenableLibraryCategory('textstyle'), 'textstyle');
    assert.equal(resolveOpenableLibraryCategory('text'), undefined);
    assert.equal(resolveOpenableLibraryCategory('shapes'), 'shapes');
});

test('LIBRARY_GROUPS: preserves five groups and category vocabulary in declared order', () => {
    assert.deepEqual(LIBRARY_GROUPS.map(group => group.label), [
        'My library', 'Audio, video, and images', 'Text and decorations', 'Finishing', 'Template'
    ]);
    assert.deepEqual(LIBRARY_GROUPS.map(group => group.categories.map(category => category.key)), [
        ['fav', 'brandkit', 'mypresets'],
        ['bgm', 'sfx', 'broll', 'image', 'overlay', 'scene3d', 'pack'],
        ['textstyle', 'textanim', 'font', 'shapes', 'stamps'],
        ['lut', 'transition', 'fx', 'motion'],
        ['template']
    ]);
});

test('LIBRARY_GROUPS: fixes label, soon, and chipKey mapping', () => {
    const categories = Object.fromEntries(LIBRARY_GROUPS.flatMap(group => group.categories.map(category => [category.key, category])));
    assert.deepEqual(
        ['fav', 'brandkit', 'mypresets', 'shapes', 'stamps', 'fx', 'motion', 'template']
            .filter(key => categories[key].status === 'soon'),
        ['fav', 'brandkit', 'mypresets', 'stamps', 'fx', 'motion', 'template']
    );
    assert.deepEqual(
        Object.fromEntries(['bgm', 'sfx', 'broll', 'image', 'overlay', 'scene3d', 'textstyle', 'textanim', 'font', 'lut']
            .map(key => [key, categories[key].chipKey])),
        {
            bgm: 'audio:bgm', sfx: 'audio:sfx', broll: 'broll', image: 'still', overlay: 'overlay', scene3d: 'scene3d',
            textstyle: 'preset:textstyle', textanim: 'preset:textanim', font: 'font', lut: 'preset:lut'
        }
    );
    assert.equal(categories.fav.label, 'Favorites');
    assert.equal(categories.brandkit.icon, '◈');
    assert.equal(categories.mypresets.icon, '✎');
});

test('LIBRARY_GROUPS: fixes action entry wording', () => {
    const categories = Object.fromEntries(LIBRARY_GROUPS.flatMap(group => group.categories.map(category => [category.key, category])));
    for (const key of ['bgm', 'sfx', 'broll', 'image']) {
        assert.equal(categories[key].hint, 'Drag onto the timeline, or right-click to place at the playhead');
    }
    for (const key of ['overlay', 'scene3d']) {
        assert.equal(categories[key].hint, 'Right-click and select Import to add to the project');
    }
    assert.equal(categories.textstyle.hint, 'Apply to selected text or add as new text');
    assert.equal(categories.textanim.hint, 'Apply to selected text or hover to play a preview');
    assert.equal(categories.font.hint, 'Apply a font to selected text');
    assert.equal(categories.transition.hint, 'Drag onto a cut boundary in the timeline to apply');
    assert.equal(categories.lut.hint, 'Apply to the selected cut (adjust strength in the Inspector)');
});

const SEARCH_SOURCES = {
    catalogItems: [{ id: 'spark-se', category: 'audio', title: 'Spark confirmation', tags: ['sfx'] }],
    presetShowcase: {
        lut: [],
        textanim: [{ kind: 'textanim', id: 'spark-in', name: 'Spark entrance', tags: ['in'] }],
        textstyle: []
    },
    transitions: [{ id: 'spark-wipe', labelJa: 'Spark wipe', category: 'Wipe' }]
};

test('searchLibraryHome: searches catalog, presets, and transitions', () => {
    assert.deepEqual(searchLibraryHome('SPARK', SEARCH_SOURCES), [
        { categoryKey: 'sfx', label: 'Spark confirmation', kind: 'catalog' },
        { categoryKey: 'textanim', label: 'Spark entrance', kind: 'preset' },
        { categoryKey: 'transition', label: 'Spark wipe', kind: 'transition' }
    ]);
    assert.deepEqual(searchLibraryHome(' ', SEARCH_SOURCES), []);
});
