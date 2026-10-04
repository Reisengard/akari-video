import test from 'node:test';
import assert from 'node:assert/strict';
import { isUnorganizedRootEntry, classifyUnorganizedMediaKind } from '../lib/common/unorganized-materials.js';

// 未整理判定の単体テスト（task.md L0 必須項目）。
// project-tree-policy.ts の DEFAULT_WORKFLOW.tree 相当のポリシーを使う。
const POLICY = {
    hidden: ['.claude', '.agents', '.codex', '.akari', 'CLAUDE.md', 'AGENTS.md', '.gitignore', '.gitkeep'],
    sidecarSuffixes: ['.meta.json', '.decisions.json', '.analysis.json']
};

test('classifyUnorganizedMediaKind: classifies supported video/audio/image extensions', () => {
    assert.equal(classifyUnorganizedMediaKind('clip.mp4'), 'video');
    assert.equal(classifyUnorganizedMediaKind('clip.MOV'), 'video');
    assert.equal(classifyUnorganizedMediaKind('clip.webm'), 'video');
    assert.equal(classifyUnorganizedMediaKind('take.wav'), 'audio');
    assert.equal(classifyUnorganizedMediaKind('take.mp3'), 'audio');
    assert.equal(classifyUnorganizedMediaKind('take.m4a'), 'audio');
    assert.equal(classifyUnorganizedMediaKind('frame-01.png'), 'image');
    assert.equal(classifyUnorganizedMediaKind('frame-01.jpg'), 'image');
    assert.equal(classifyUnorganizedMediaKind('frame-01.jpeg'), 'image');
    assert.equal(classifyUnorganizedMediaKind('frame-01.webp'), 'image');
});

test('classifyUnorganizedMediaKind: unsupported extensions return undefined', () => {
    assert.equal(classifyUnorganizedMediaKind('notes.txt'), undefined);
    assert.equal(classifyUnorganizedMediaKind('clip.mkv'), undefined);
    assert.equal(classifyUnorganizedMediaKind('README.md'), undefined);
});

test('isUnorganizedRootEntry: collects root-level media files as unorganized', () => {
    assert.equal(isUnorganizedRootEntry({ name: 'clip.mp4', isDirectory: false }, POLICY), true);
    assert.equal(isUnorganizedRootEntry({ name: 'narration.wav', isDirectory: false }, POLICY), true);
    assert.equal(isUnorganizedRootEntry({ name: 'frame-01.png', isDirectory: false }, POLICY), true);
});

test('isUnorganizedRootEntry: legacy evidence images (frame-*.png) may be unorganized too', () => {
    assert.equal(isUnorganizedRootEntry({ name: 'frame-09.png', isDirectory: false }, POLICY), true);
});

test('isUnorganizedRootEntry: always excludes directories without recursion, including assets/exports/.akari', () => {
    assert.equal(isUnorganizedRootEntry({ name: 'assets', isDirectory: true }, POLICY), false);
    assert.equal(isUnorganizedRootEntry({ name: 'exports', isDirectory: true }, POLICY), false);
    assert.equal(isUnorganizedRootEntry({ name: '.akari', isDirectory: true }, POLICY), false);
    assert.equal(isUnorganizedRootEntry({ name: 'planning', isDirectory: true }, POLICY), false);
});

test('isUnorganizedRootEntry: excludes root-level contract JSON such as edit.json', () => {
    assert.equal(isUnorganizedRootEntry({ name: 'edit.json', isDirectory: false }, POLICY), false);
    assert.equal(isUnorganizedRootEntry({ name: 'captions.json', isDirectory: false }, POLICY), false);
    assert.equal(isUnorganizedRootEntry({ name: 'review.json', isDirectory: false }, POLICY), false);
});

test('isUnorganizedRootEntry: excludes policy.hidden matches consistently with existing noise rules', () => {
    assert.equal(isUnorganizedRootEntry({ name: 'CLAUDE.md', isDirectory: false }, POLICY), false);
    assert.equal(isUnorganizedRootEntry({ name: '.gitignore', isDirectory: false }, POLICY), false);
});

test('isUnorganizedRootEntry: excludes sidecar extensions', () => {
    assert.equal(isUnorganizedRootEntry({ name: 'clip.mp4.analysis.json', isDirectory: false }, POLICY), false);
});

test('isUnorganizedRootEntry: excludes files without media extensions', () => {
    assert.equal(isUnorganizedRootEntry({ name: 'notes.txt', isDirectory: false }, POLICY), false);
    assert.equal(isUnorganizedRootEntry({ name: 'package.json', isDirectory: false }, POLICY), false);
});
