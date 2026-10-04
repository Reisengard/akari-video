import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMaterialKind, resolveAssetGroupMedia } from '../lib/common/asset-group-media.js';

const files = (...names) => names.map(name => ({ name, isDirectory: false }));

for (const [label, category, names, expected] of [
    ['one audio file', 'audio', ['meta.json', 'track.wav', 'preview.png'], { kind: 'audio', mediaName: 'track.wav' }],
    ['no audio files', 'audio', ['meta.json', 'preview.png'], { kind: 'other' }],
    ['two audio files', 'audio', ['piano-1.mp3', 'piano-2.mp3'], { kind: 'other' }],
    ['one video with audio and images', 'broll', ['clip.mp4', 'voice.wav', 'still.png', 'preview.png', 'meta.json', 'transcript.srt', 'script.md'], { kind: 'video', mediaName: 'clip.mp4' }],
    ['no videos', 'broll', ['voice.wav', 'still.png'], { kind: 'other' }],
    ['two videos', 'broll', ['clip.mp4', 'demo.mov'], { kind: 'other' }],
    ['one image', 'still', ['still.png', 'preview.png', 'meta.json'], { kind: 'image', mediaName: 'still.png' }],
    ['preview.png only', 'still', ['preview.png'], { kind: 'other' }],
    ['no images', 'still', ['meta.json'], { kind: 'other' }],
    ['one image and fragment.html', 'still', ['still.png', 'fragment.html', 'preview.png', 'meta.json'], { kind: 'image', mediaName: 'still.png' }],
    ['no images and fragment.html', 'still', ['fragment.html', 'preview.png', 'meta.json'], { kind: 'other' }],
    ['two images and fragment.html', 'still', ['one.jpg', 'two.webp', 'fragment.html', 'preview.png', 'meta.json'], { kind: 'other' }],
    ['image with HTM', 'still', ['still.png', 'fragment.HTM'], { kind: 'image', mediaName: 'still.png' }],
    ['two images', 'still', ['one.jpg', 'two.webp', 'preview.png'], { kind: 'other' }],
    ['overlay', 'overlay', ['clip.mp4', 'still.png'], { kind: 'other' }],
    ['Overlay image and fragment.html', 'overlay', ['still.png', 'fragment.html', 'preview.png', 'meta.json'], { kind: 'other' }],
    ['scene3d demo video', 'scene3d', ['demo.mp4'], { kind: 'other' }],
    ['font', 'font', ['font.woff2', 'specimen.png'], { kind: 'other' }],
    ['unknown category', 'unknown', ['clip.mp4'], { kind: 'other' }],
    ['undefined category', undefined, ['clip.mp4'], { kind: 'other' }],
    ['empty category', '', ['clip.mp4'], { kind: 'other' }],
    ['no children', 'audio', [], { kind: 'other' }],
    ['uppercase audio extension', 'audio', ['Track.MP3'], { kind: 'audio', mediaName: 'Track.MP3' }],
    ['uppercase video extension', 'broll', ['Clip.MOV'], { kind: 'video', mediaName: 'Clip.MOV' }],
    ['uppercase image extension and preview exclusion', 'still', ['Still.JPEG', 'PREVIEW.PNG'], { kind: 'image', mediaName: 'Still.JPEG' }]
]) {
    test(`resolveAssetGroupMedia: ${label}`, () => {
        assert.deepEqual(resolveAssetGroupMedia(category, files(...names)), expected);
    });
}

for (const [category, name, kind] of [['audio', 'track.wav', 'audio'], ['broll', 'clip.mp4', 'video'], ['still', 'still.png', 'image']]) {
    test(`resolveAssetGroupMedia: ${category} directories do not count`, () => {
        const directories = [
            { name: `directory-${name}`, isDirectory: true },
            { name: 'fragment.html', isDirectory: true }
        ];
        assert.deepEqual(resolveAssetGroupMedia(category, directories), { kind: 'other' });
        assert.deepEqual(resolveAssetGroupMedia(category, [...directories, ...files(name)]), { kind, mediaName: name });
    });
}

for (const [kind, category, extensions] of [
    ['video', 'broll', ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi']],
    ['audio', 'audio', ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg']],
    ['image', 'still', ['png', 'jpg', 'jpeg', 'gif', 'webp']]
]) {
    test(`classifyMaterialKind: ${kind} shares extensions between files and groups`, () => {
        for (const extension of extensions) {
            for (const name of [`media.${extension}`, `Media.${extension.toUpperCase()}`]) {
                assert.equal(classifyMaterialKind(name), kind, name);
                assert.deepEqual(resolveAssetGroupMedia(category, files(name)), { kind, mediaName: name });
            }
        }
    });
}

test('classifyMaterialKind: unsupported names remain other', () => {
    for (const name of ['', 'mp4', 'clip.mp4.bak', 'sound.aiff', 'still.svg', 'fragment.html', 'meta.json']) {
        assert.equal(classifyMaterialKind(name), 'other', name);
    }
});
