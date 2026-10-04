import test from 'node:test';
import assert from 'node:assert/strict';
import {
    derivePresetShowcaseChips,
    filterPresetShowcaseItems,
    parsePresetShowcaseJsonl,
    appendLibraryTextstyleShowcaseItems
} from '../lib/common/preset-showcase.js';

test('parsePresetShowcaseJsonl: retired telop is never offered', () => {
    assert.deepEqual(parsePresetShowcaseJsonl(JSON.stringify({
        id: 'old', name: 'Old', category: 'caption', tags: [],
        description: 'legacy', when_to_use: 'legacy'
    }), 'telop'), []);
});

test('parsePresetShowcaseJsonl: LUT normalizes description and use cases to camelCase', () => {
    const items = parsePresetShowcaseJsonl(JSON.stringify({
        id: 'natural',
        name: 'Natural',
        description: 'Gentle tones',
        when_to_use: 'General export',
        tags: ['lut', 'natural'],
        params: [{ key: 'intensity' }]
    }), 'lut');
    assert.deepEqual(items, [{
        kind: 'lut',
        id: 'natural',
        name: 'Natural',
        description: 'Gentle tones',
        whenToUse: 'General export',
        tags: ['lut', 'natural']
    }]);
});

test('parsePresetShowcaseJsonl: skips only broken lines and invalid required fields and returns the rest', () => {
    const valid = JSON.stringify({ id: 'ok', name: 'Valid', description: 'description', when_to_use: 'use', tags: ['lut'] });
    const missing = JSON.stringify({ id: 'missing-category', name: 'Invalid', tags: [] });
    const items = parsePresetShowcaseJsonl([valid, '{ broken', missing, '', valid].join('\n'), 'lut');
    assert.deepEqual(items.map(item => item.id), ['ok', 'ok']);
});

test('parsePresetShowcaseJsonl: textanim normalizes slot to tags and preserves sampleText', () => {
    const items = parsePresetShowcaseJsonl(JSON.stringify({
        id: 'fade-up',
        name: 'Fade up',
        category: 'Fade',
        description: 'Gently rises from below',
        sample_text: 'Floating Captions',
        slot: 'in'
    }), 'textanim');
    assert.deepEqual(items, [{
        kind: 'textanim',
        id: 'fade-up',
        name: 'Fade up',
        category: 'Fade',
        description: 'Gently rises from below',
        sampleText: 'Floating Captions',
        tags: ['in']
    }]);
});

test('parsePresetShowcaseJsonl: textstyle normalizes category to tags and preserves sampleText', () => {
    const items = parsePresetShowcaseJsonl(JSON.stringify({
        id: 'subtitle-news',
        kind: 'textstyle',
        category: 'subtitle',
        name: 'News style',
        sample_text: 'Breaking news',
        style: { size_px: 56 }
    }), 'textstyle');
    assert.deepEqual(items, [{
        kind: 'textstyle',
        id: 'subtitle-news',
        name: 'News style',
        category: 'subtitle',
        sampleText: 'Breaking news',
        style: { size_px: 56 },
        tags: ['subtitle']
    }]);
});

test('parsePresetShowcaseJsonl: skips broken textanim / textstyle lines', () => {
    const invalidAnimation = JSON.stringify({ id: 'bad', name: 'Invalid', category: 'Motion', description: 'Missing', slot: 'middle' });
    const invalidStyle = JSON.stringify({ id: 'bad', kind: 'textstyle', category: 'subtitle', name: 'Invalid', sample_text: 'Missing' });
    assert.deepEqual(parsePresetShowcaseJsonl(invalidAnimation, 'textanim'), []);
    assert.deepEqual(parsePresetShowcaseJsonl(invalidStyle, 'textstyle'), []);
});

test('library textstyle follows built-ins, carries origin and drops conflicting ids', () => {
    const builtin = [{ kind: 'textstyle', id: 'neon', name: 'Built-in', tags: [] }];
    const library = [
        { id: 'neon', name: 'Other', category: 'test', style: {}, origin: 'library' },
        { id: 'library-gold-sample', name: 'Gold', category: 'metallic', style: { strokes: [] }, origin: 'library' }
    ];
    const items = appendLibraryTextstyleShowcaseItems(builtin, library, () => 'file:///preview.png');
    assert.equal(items.length, 2);
    assert.equal(items[0], builtin[0]);
    assert.equal(items[1].origin, 'library');
    assert.equal(items[1].previewUrl, 'file:///preview.png');
    assert.deepEqual(items[1].style, { strokes: [] });
});

test('derivePresetShowcaseChips: returns three retired kinds in fixed count order', () => {
    const chips = derivePresetShowcaseChips({
        lut: [
            { kind: 'lut', id: 'b', name: 'B', description: 'B', whenToUse: 'B', tags: [] },
            { kind: 'lut', id: 'c', name: 'C', description: 'C', whenToUse: 'C', tags: [] }
        ],
        textanim: [{ kind: 'textanim', id: 'd', name: 'D', category: 'in', tags: ['in'] }],
        textstyle: [{ kind: 'textstyle', id: 'e', name: 'E', category: 'subtitle', tags: ['subtitle'] }]
    });
    assert.deepEqual(chips, [
        { category: 'preset:lut', label: 'LUT', count: 2 },
        { category: 'preset:textanim', label: 'Text animation', count: 1 },
        { category: 'preset:textstyle', label: 'Text style', count: 1 }
    ]);
});

const SEARCH_ITEMS = [
    { kind: 'textstyle', id: 'caption-pop', name: 'Pop Captions', category: 'caption', tags: ['bright', 'caption'] },
    { kind: 'textstyle', id: 'news-lower', name: 'News lower third', category: 'lower-third', tags: ['news'] }
];

test('filterPresetShowcaseItems: searches display names, IDs, and tags', () => {
    assert.deepEqual(filterPresetShowcaseItems(SEARCH_ITEMS, 'News').map(item => item.id), ['news-lower']);
    assert.deepEqual(filterPresetShowcaseItems(SEARCH_ITEMS, 'caption-pop').map(item => item.id), ['caption-pop']);
    assert.deepEqual(filterPresetShowcaseItems(SEARCH_ITEMS, 'bright').map(item => item.id), ['caption-pop']);
});

test('filterPresetShowcaseItems: empty search returns all; no match returns zero', () => {
    assert.equal(filterPresetShowcaseItems(SEARCH_ITEMS, ' ').length, 2);
    assert.equal(filterPresetShowcaseItems(SEARCH_ITEMS, 'no-match').length, 0);
});
