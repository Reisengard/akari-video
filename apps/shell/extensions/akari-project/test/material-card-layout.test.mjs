import test from 'node:test';
import assert from 'node:assert/strict';
import { materialCardLayout } from '../lib/common/material-card-layout.js';

const cases = [
    ['HTML', { kind: 'other', name: 'title.html' }, 'HTML'],
    ['video', { kind: 'video', name: 'clip.mp4' }, 'Video'],
    ['image', { kind: 'image', name: 'photo.png' }, 'Image'],
    ['audio', { kind: 'audio', name: 'sound.wav' }, 'Audio'],
    ['font', { kind: 'other', name: 'specimen.html', assetGroupCategory: 'font' }, 'font'],
    ['Uncategorized', { kind: 'other', assetGroupCategory: '' }, 'Footage']
];

for (const [label, entry, kindLabel] of cases) {
    test(`materialCardLayout: ${label} uses the shared square card`, () => {
        const layout = materialCardLayout(entry);
        assert.equal(layout.aspectRatio, '1 / 1');
        assert.equal(layout.gridColumn, undefined);
        assert.equal(layout.objectFit, 'contain');
        assert.equal(layout.namePlacement, 'overlay');
        assert.equal(layout.kindLabel, kindLabel);
        assert.equal(layout.gridGap, '4px');
        assert.equal(layout.gridPadding, '4px');
        assert.equal(layout.cardMinWidth, '95px');
        assert.equal(materialCardLayout(entry, { cardMinWidthPx: 120 }).cardMinWidth, '120px');
        const customized = materialCardLayout(entry, { gridGapPx: 0, gridPaddingPx: 8 });
        assert.equal(customized.gridGap, '0px');
        assert.equal(customized.gridPadding, '8px');
        if (label === 'HTML') {
            assert.equal(materialCardLayout({ kind: 'other', name: 'title.HTM' }).kindLabel, 'HTML');
        }
    });
}
