import test from 'node:test';
import assert from 'node:assert/strict';
import { assetGroupOpenTarget } from '../lib/common/asset-group-open-target.js';

const files = (...names) => names.map(name => ({ name, isDirectory: false }));

for (const category of ['overlay', 'still']) {
    test(`${category}: prefers the fragment to the preview image`, () => {
        assert.equal(assetGroupOpenTarget(files('preview.png', 'meta.json', 'fragment.html'), category), 'fragment.html');
    });
}

test('font: picks typefaces by name without changing the input', () => {
    const children = files('z.ttf', 'B.OTF', 'a.woff2', 'preview.png', 'meta.json');
    const before = structuredClone(children);
    assert.equal(assetGroupOpenTarget(children, 'font'), 'B.OTF');
    assert.deepEqual(children, before);
    for (const name of ['a.TTF', 'a.otf', 'a.WOFF2']) {
        assert.equal(assetGroupOpenTarget(files(name, 'meta.json'), 'font'), name);
    }
});

test('audio or no kind: picks preview image then metadata', () => {
    for (const category of ['audio', '', undefined, 'unknown']) {
        assert.equal(assetGroupOpenTarget(files('fragment.html', 'a.ttf', 'preview.png', 'meta.json'), category), 'preview.png');
        assert.equal(assetGroupOpenTarget(files('meta.json'), category), 'meta.json');
    }
});

test('no fragment or font: falls back to preview, metadata, undefined', () => {
    for (const category of ['overlay', 'still', 'font']) {
        assert.equal(assetGroupOpenTarget(files('preview.png', 'meta.json'), category), 'preview.png');
        assert.equal(assetGroupOpenTarget(files('meta.json'), category), 'meta.json');
        assert.equal(assetGroupOpenTarget([], category), undefined);
    }
});

test('directories with the same name are not click targets', () => {
    const directories = ['fragment.html', 'a.ttf', 'preview.png', 'meta.json'].map(name => ({ name, isDirectory: true }));
    for (const category of ['overlay', 'still', 'font', 'audio']) {
        assert.equal(assetGroupOpenTarget(directories, category), undefined);
        assert.equal(assetGroupOpenTarget([...directories, ...files('meta.json')], category), 'meta.json');
    }
});
