import test from 'node:test';
import assert from 'node:assert/strict';
import { nextCandidateAssetName } from '../lib/common/asset-naming.js';

// assets へ移動時の同名衝突回避（recordDroppedAssets の stem-index.ext 規約を踏襲）。

test('nextCandidateAssetName: extension uses stem-index.ext', () => {
    assert.equal(nextCandidateAssetName('clip.mp4', 2), 'clip-2.mp4');
    assert.equal(nextCandidateAssetName('clip.mp4', 3), 'clip-3.mp4');
});

test('nextCandidateAssetName: no extension uses name-index', () => {
    assert.equal(nextCandidateAssetName('README', 2), 'README-2');
});

test('nextCandidateAssetName: leading-dot files have no extension', () => {
    assert.equal(nextCandidateAssetName('.gitkeep', 2), '.gitkeep-2');
});

test('nextCandidateAssetName: only the last dot separates the extension', () => {
    assert.equal(nextCandidateAssetName('archive.tar.gz', 2), 'archive.tar-2.gz');
});
