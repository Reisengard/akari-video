import assert from 'node:assert/strict';
import test from 'node:test';

import { clipKindBadge } from '../lib/common/clip-kind-badge.js';

for (const [kind, text] of [
    ['html', 'HTML'],
    ['scene3d', '3D'],
    ['video', 'Video'],
    ['image', 'Image'],
    ['audio', 'Audio'],
    ['caption', 'Caption']
]) {
    test(`${kind} は素材カードと同じ語彙・title の札を返す`, () => {
        const item = Object.freeze({ source: Object.freeze({ kind }) });
        assert.deepEqual(clipKindBadge(item), { text, title: `Type: ${text}` });
    });
}

test('未知の kind と source のないアイテムには札を出さない', () => {
    for (const kind of ['unknown', 'group', 'toString', '__proto__', '']) {
        assert.equal(clipKindBadge({ source: { kind } }), undefined);
    }
    assert.equal(clipKindBadge({}), undefined);
    assert.equal(clipKindBadge(undefined), undefined);
});

for (const [name, source, context, text] of [
    ['media + 動画パス', { kind: 'media', src: 'source-id' }, { path: 'assets/movie.MP4', lane: 'visual' }, 'Video'],
    ['media + 画像パス', { kind: 'media', src: 'source-id' }, { path: 'assets/still.PNG', lane: 'visual' }, 'Image'],
    ['media + audio lane', { kind: 'media', src: 'source-id' }, { path: 'assets/movie.mp4', lane: 'audio' }, 'Audio'],
    ['audio lane は画像拡張子より優先', { kind: 'media' }, { path: 'assets/still.png', lane: 'audio' }, 'Audio'],
    ['media + 音声パス', { kind: 'media', src: 'source-id' }, { path: 'assets/voice.WAV' }, 'Audio'],
    ['media は source.src にフォールバック', { kind: 'media', src: 'assets/still.JpEg' }, {}, 'Image'],
    ['media は文脈の path を優先', { kind: 'media', src: 'assets/still.png' }, { path: 'assets/movie.mov' }, 'Video'],
    ['media の未判定拡張子', { kind: 'media', src: 'assets/movie.custom' }, {}, 'Video'],
    ['media のパスなし', { kind: 'media' }, {}, 'Video'],
    ['media のパスなし + audio lane', { kind: 'media' }, { lane: 'audio' }, 'Audio'],
    ['html + scene3d の参照解決パス', { kind: 'html', src: 'scene-source' }, { path: 'assets/scene3d/studio/fragment.html' }, '3D'],
    ['html は source.path にフォールバック', { kind: 'html', path: 'assets/scene3d/studio/fragment.html' }, {}, '3D'],
    ['html + Windows のパス区切り', { kind: 'html' }, { path: 'C:\\assets\\scene3d\\studio\\fragment.html' }, '3D'],
    ['html はディレクトリ要素の完全一致のみ', { kind: 'html', path: 'assets/my-scene3d/fragment.html' }, {}, 'HTML'],
    ['html は文脈の path を優先', { kind: 'html', path: 'assets/scene3d/studio/fragment.html' }, { path: 'assets/overlay/title/fragment.html' }, 'HTML'],
    ['未知の kind は文脈があっても未知', { kind: 'unknown' }, { path: 'assets/still.png', lane: 'audio' }, undefined]
]) {
    test(name, () => {
        const item = Object.freeze({ source: Object.freeze(source) });
        assert.deepEqual(clipKindBadge(item, Object.freeze(context)), text === undefined ? undefined : { text, title: `Type: ${text}` });
    });
}

for (const [text, extensions] of [
    ['Image', ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'avif', 'heic']],
    ['Audio', ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'aif', 'aiff']]
]) {
    test(`${text} の全拡張子を大文字・小文字ともに判定する`, () => {
        for (const extension of extensions) {
            for (const suffix of [extension, extension.toUpperCase()]) {
                assert.deepEqual(clipKindBadge({ source: { kind: 'media', src: `assets/clip.${suffix}` } }), { text, title: `Type: ${text}` });
            }
        }
    });
}
