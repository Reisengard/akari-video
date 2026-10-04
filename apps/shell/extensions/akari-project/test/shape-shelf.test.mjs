import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    buildShapeShelfRows, parseRecentShapes, parseShapeShelfJsonl, pushRecentShape, searchShapeShelf,
    SHAPE_SHELF_LINE_ROW, SHAPE_SHELF_RECENT_LIMIT, shapeShelfDragPayload, shapeShelfRowItems, shapeShelfRowLabel
} from '../lib/common/shape-shelf.js';
import { LIBRARY_PRIMARY_TILES, resolveOpenableLibraryCategory, searchLibraryHome } from '../lib/common/library-home-view.js';

// 棚の正本（presets/shapes/index.jsonl）をそのまま読む。
const raw = readFileSync(new URL('../../../../../presets/shapes/index.jsonl', import.meta.url), 'utf8');
const presets = parseShapeShelfJsonl(raw);
const emptySources = { catalogItems: [], presetShowcase: { textstyle: [], textanim: [], lut: [] }, transitions: [] };

test('reads jsonl and discards broken lines and duplicate IDs', () => {
    assert.equal(presets.length, 276);
    const parsed = parseShapeShelfJsonl([
        '{"id":"a","category":"basic","name":"A","vb":[100,100],"d":"M0 0L1 1Z","kind":"fill","defaults":{}}',
        'not json',
        '{"id":"a","category":"basic","name":"A2","vb":[100,100],"d":"M0 0L1 1Z","kind":"fill","defaults":{}}',
        '{"id":"b","category":"basic","name":"B","vb":[0,100],"d":"M0 0Z","kind":"fill","defaults":{}}',
        '{"id":"c","category":"basic","name":"C","vb":[10,10],"d":"M0 0Z","kind":"unknown","defaults":{}}',
        ''
    ].join('\n'));
    assert.deepEqual(parsed.map(preset => preset.name), ['A']);
    const rounded = presets.find(preset => preset.id === 'basic-rounded-square');
    assert.deepEqual(rounded.rounded_from, { base: 'basic-square', radius: 36 });
});

test('shelf rows: without recent use, Lines first then jsonl category order, ending with comic speech bubbles', () => {
    const rows = buildShapeShelfRows(presets, []);
    assert.deepEqual(rows.map(row => row.key), [
        'line', 'basic', 'polygon', 'star', 'arrow', 'flow', 'bubble', 'cloud', 'heart', 'banner', 'drop', 'gear',
        'asterisk', 'organic', 'wave', 'abstract', 'manga'
    ]);
    assert.deepEqual(rows.map(row => row.label).slice(0, 3), ['Lines', 'Basic shapes', 'Polygons']);
    assert.equal(rows.at(-1).label, 'Comic speech bubbles');
    const line = rows[0];
    assert.deepEqual(line.items.map(item => item.id), SHAPE_SHELF_LINE_ROW);
    assert.equal(line.total, 45);
    const basic = rows[1];
    assert.equal(basic.items.length, 14);
    assert.equal(basic.total, 15);
    const organic = rows.find(row => row.key === 'organic');
    assert.equal(organic.items.length, 14);
    assert.equal(organic.total, 37);
    // 1 行 14 件（行の中で左右に送る）。全部は「すべて表示」。
    assert.ok(rows.every(row => row.items.length <= 15));
});

test('recently used items lead in placement order, newest first; unknown shelf IDs are omitted', () => {
    let recent = [];
    for (const id of ['star-5', 'heart-heart', 'line-dash-tri-tri', 'manga-shout', 'star-5']) recent = pushRecentShape(recent, id);
    assert.deepEqual(recent, ['star-5', 'manga-shout', 'line-dash-tri-tri', 'heart-heart']);
    const rows = buildShapeShelfRows(presets, [...recent, 'gone-shape']);
    assert.equal(rows[0].key, 'recent');
    assert.equal(rows[0].label, 'Recently used');
    assert.deepEqual(rows[0].items.map(item => item.id), recent);
    assert.equal(rows[0].total, 4);
    assert.equal(rows[1].key, 'line');
    const many = presets.slice(0, 30).map(preset => preset.id).reduce((list, id) => pushRecentShape(list, id), []);
    assert.equal(many.length, SHAPE_SHELF_RECENT_LIMIT);
    assert.equal(buildShapeShelfRows(presets, many)[0].items.length, 12);
    assert.equal(shapeShelfRowItems(presets, 'recent', many).length, SHAPE_SHELF_RECENT_LIMIT);
});

test('corrupted recent-use values fall back to empty and normalize duplicates and limits', () => {
    assert.deepEqual(parseRecentShapes(null), []);
    assert.deepEqual(parseRecentShapes('{'), []);
    assert.deepEqual(parseRecentShapes('{"a":1}'), []);
    assert.deepEqual(parseRecentShapes('["a",3,"b","a",""]'), ['a', 'b']);
    assert.equal(parseRecentShapes(JSON.stringify(Array.from({ length: 40 }, (_, i) => `s${i}`))).length, SHAPE_SHELF_RECENT_LIMIT);
});

test('Show all: all 45 lines, or all items in that category row', () => {
    const lines = shapeShelfRowItems(presets, 'line', []);
    assert.equal(lines.length, 45);
    assert.ok(lines.every(item => item.kind === 'line'));
    assert.ok(lines.some(item => item.id === 'line-dash-tri-tri'));
    assert.equal(shapeShelfRowItems(presets, 'manga', []).length, 12);
    assert.equal(shapeShelfRowItems(presets, 'abstract', []).length, 50);
    assert.equal(shapeShelfRowLabel('manga'), 'Comic speech bubbles');
});

test('searches shape names and row names, but not IDs', () => {
    const hearts = searchShapeShelf(presets, 'Hearts');
    assert.ok(hearts.length >= 12);
    assert.ok(hearts.some(item => item.id === 'heart-heart'));
    const shoutPreset = presets.find(preset => preset.id === 'manga-shout');
    const shout = searchShapeShelf(presets, shoutPreset.name).map(item => item.id);
    assert.ok(shout.includes('manga-shout'));
    assert.ok(searchShapeShelf(presets, 'Comic speech bubbles').length >= 12);
    const dashedPreset = presets.find(preset => preset.id === 'line-dash-tri-tri');
    const dashed = searchShapeShelf(presets, dashedPreset.name);
    assert.ok(dashed.some(item => item.id === 'line-dash-tri-tri'));
    assert.ok(dashed.every(item => item.kind === 'line'));
    assert.equal(searchShapeShelf(presets, 'ＳＴＡＲ-5').length, 0);
    assert.equal(searchShapeShelf(presets, 'star-5').length, 0);
    const star = presets.find(preset => preset.id === 'star-5');
    assert.equal(searchShapeShelf(presets, star.name)[0].id, star.id);
    assert.deepEqual(searchShapeShelf(presets, '   '), []);
});

test('Library search matches shape names and opens the shape shelf on click', () => {
    const star = presets.find(preset => preset.id === 'star-5');
    const hits = searchLibraryHome(star.name, { ...emptySources, shapes: presets });
    assert.ok(hits.length > 0);
    assert.ok(hits.every(hit => hit.categoryKey === 'shapes' && hit.kind === 'shape'));
    assert.ok(hits.some(hit => hit.label === star.name));
    assert.deepEqual(searchLibraryHome(star.name, emptySources), []);
    assert.equal(resolveOpenableLibraryCategory('shapes'), 'shapes');
    const tile = LIBRARY_PRIMARY_TILES.find(item => item.key === 'shapes');
    assert.equal(tile.status, 'live');
});

test('drag payload uses kind: shape + preset (name and vb for placeholders, d for actual geometry)', () => {
    const star = presets.find(preset => preset.id === 'star-5');
    const payload = shapeShelfDragPayload(star);
    // d は下書きを実物の形で描くためだけのもの。置く形の正本はコマンド側なので比較から外す。
    const { d, ...rest } = payload;
    assert.deepEqual(rest, { kind: 'shape', preset: 'star-5', name: star.name, vb: [100, 95] });
    assert.equal(d, star.d);
});
