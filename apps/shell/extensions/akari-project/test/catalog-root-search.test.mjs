import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveUpwardCatalogRoot, CATALOG_ROOT_UPWARD_MAX_DEPTH } from '../lib/node/catalog-root-search.js';

// 上方探索純関数の単体テスト（task.md L0: 一致あり/なし/深すぎ）。
// hasCatalogIndex は catalog/INDEX.md の存在判定を注入する形なので fs に触らず検証できる。

test('match: found in an ancestor directory within maxDepth', async () => {
    const start = '/Users/example/repo/apps/shell/lib/backend';
    const target = '/Users/example/repo';
    const hasCatalogIndex = async dir => dir === target;
    const result = await resolveUpwardCatalogRoot(start, CATALOG_ROOT_UPWARD_MAX_DEPTH, hasCatalogIndex);
    assert.equal(result, target);
});

test('match: starting directory itself matches (depth 0)', async () => {
    const start = '/Users/example/repo';
    const hasCatalogIndex = async dir => dir === start;
    const result = await resolveUpwardCatalogRoot(start, CATALOG_ROOT_UPWARD_MAX_DEPTH, hasCatalogIndex);
    assert.equal(result, start);
});

test('no match: no ancestor contains catalog/INDEX.md', async () => {
    const start = '/Users/example/repo/apps/shell/lib/backend';
    const result = await resolveUpwardCatalogRoot(start, CATALOG_ROOT_UPWARD_MAX_DEPTH, async () => false);
    assert.equal(result, undefined);
});

test('too deep: matching ancestor exceeds maxDepth and is not found', async () => {
    // start から target までは 9 階層上（dirname を 9 回）— maxDepth=8 の探索範囲外。
    const start = '/a/b/c/d/e/f/g/h/i/j';
    const target = '/a';
    const hasCatalogIndex = async dir => dir === target;
    const result = await resolveUpwardCatalogRoot(start, CATALOG_ROOT_UPWARD_MAX_DEPTH, hasCatalogIndex);
    assert.equal(result, undefined);
});

test('depth boundary: increasing maxDepth by one finds the same target', async () => {
    const start = '/a/b/c/d/e/f/g/h/i/j';
    const target = '/a';
    const hasCatalogIndex = async dir => dir === target;
    const result = await resolveUpwardCatalogRoot(start, CATALOG_ROOT_UPWARD_MAX_DEPTH + 1, hasCatalogIndex);
    assert.equal(result, target);
});

test('stops at the filesystem root without looping forever on no match', async () => {
    const start = '/a/b';
    const result = await resolveUpwardCatalogRoot(start, 100, async () => false);
    assert.equal(result, undefined);
});
