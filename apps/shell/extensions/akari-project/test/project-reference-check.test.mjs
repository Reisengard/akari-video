import test from 'node:test';
import assert from 'node:assert/strict';
import { countReferences } from '../lib/common/project-reference-check.js';

test('countReferences: N occurrences → N', () => {
    const doc = 'Use assets/clip.mp4 and assets/clip.mp4, then assets/clip.mp4 once more.';
    assert.equal(countReferences([doc], 'assets/clip.mp4', false), 3);
});

test('countReferences: 0 occurrences → 0', () => {
    assert.equal(countReferences(['No references'], 'assets/clip.mp4', false), 0);
});

test('countReferences: directories count both relativePath alone and trailing slash prefixes', () => {
    // 'assets/group' 単体に 1 マッチ、'assets/group/' prefix にも 1 マッチ（同じ 1 箇所への
    // 言及でも司令塔裁定どおり単純合算 = 2）。
    const doc = 'Reference: assets/group/meta.json';
    assert.equal(countReferences([doc], 'assets/group', true), 2);
});

test('countReferences: directories without child paths count only standalone matches', () => {
    const doc = 'A folder named assets/group';
    assert.equal(countReferences([doc], 'assets/group', true), 1);
});

test('countReferences: sums multiple documents (edit.json + captions.json)', () => {
    const editJson = 'assets/clip.mp4 assets/clip.mp4';
    const captionsJson = 'assets/clip.mp4';
    assert.equal(countReferences([editJson, captionsJson], 'assets/clip.mp4', false), 3);
});

test('countReferences: empty documents returns 0', () => {
    assert.equal(countReferences([], 'assets/clip.mp4', false), 0);
});
