import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveThumbnailCacheKey, thumbnailCacheFileName } from '../lib/node/thumbnail-cache.js';

// キャッシュキー導出の単体テスト（task.md L0 必須項目）。
// path + size + mtime 由来（project-structure-v0 契約 §2-2: 再生成可能・削除安全）。

test('deriveThumbnailCacheKey: identical path/size/mtime returns the same deterministic key', () => {
    const a = deriveThumbnailCacheKey('assets/clip.mp4', 12345, 1700000000000);
    const b = deriveThumbnailCacheKey('assets/clip.mp4', 12345, 1700000000000);
    assert.equal(a, b);
});

test('deriveThumbnailCacheKey: different paths return different keys', () => {
    const a = deriveThumbnailCacheKey('assets/clip.mp4', 12345, 1700000000000);
    const b = deriveThumbnailCacheKey('assets/other.mp4', 12345, 1700000000000);
    assert.notEqual(a, b);
});

test('deriveThumbnailCacheKey: different sizes return different keys and regenerate changed originals', () => {
    const a = deriveThumbnailCacheKey('assets/clip.mp4', 12345, 1700000000000);
    const b = deriveThumbnailCacheKey('assets/clip.mp4', 99999, 1700000000000);
    assert.notEqual(a, b);
});

test('deriveThumbnailCacheKey: different mtime returns different keys', () => {
    const a = deriveThumbnailCacheKey('assets/clip.mp4', 12345, 1700000000000);
    const b = deriveThumbnailCacheKey('assets/clip.mp4', 12345, 1700000005000);
    assert.notEqual(a, b);
});

test('deriveThumbnailCacheKey: returns short alphanumeric strings safe for filenames', () => {
    const key = deriveThumbnailCacheKey('assets/café-file.mp4', 1, 1);
    assert.match(key, /^[0-9a-f]{16}$/);
});

test('thumbnailCacheFileName: joins key and extension', () => {
    assert.equal(thumbnailCacheFileName('abc123', '.jpg'), 'abc123.jpg');
});

test('thumbnailCacheFileName: accepts extensions without leading dots', () => {
    assert.equal(thumbnailCacheFileName('abc123', 'png'), 'abc123.png');
});

test('thumbnailCacheFileName: lowercases extensions', () => {
    assert.equal(thumbnailCacheFileName('abc123', '.PNG'), 'abc123.png');
});
