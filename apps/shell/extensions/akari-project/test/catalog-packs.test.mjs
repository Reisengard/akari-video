import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogPacksFile } from '../lib/common/catalog-packs.js';

// catalog/packs.json（パック台帳）の寛容リーダー単体テスト（task.md L0:
// 欠損・壊れ JSON・スキーマ不一致・要素ごとの必須フィールド欠落のどれでも落ちない）。

test('parseCatalogPacksFile: reads valid multiple-pack data', () => {
    const raw = JSON.stringify({
        schema: 'akari-catalog-packs/v0',
        packs: [
            { id: 'font25-2026-08', category: 'font', title: '25 essential fonts for Captions', summary: 'Covers entertainment and corporate presentations' },
            { id: 'sfx-impact-2026-08', category: 'audio', title: 'Impact sound effects pack' }
        ]
    });
    const packs = parseCatalogPacksFile(raw);
    assert.equal(packs.length, 2);
    assert.deepEqual(packs[0], {
        id: 'font25-2026-08',
        category: 'font',
        title: '25 essential fonts for Captions',
        summary: 'Covers entertainment and corporate presentations'
    });
    assert.equal(packs[1].summary, undefined);
});

test('parseCatalogPacksFile: malformed JSON returns an empty array', () => {
    assert.deepEqual(parseCatalogPacksFile('{ broken json ,,,'), []);
});

test('parseCatalogPacksFile: non-object JSON returns an empty array', () => {
    assert.deepEqual(parseCatalogPacksFile('[1, 2, 3]'), []);
    assert.deepEqual(parseCatalogPacksFile('"just a string"'), []);
});

test('parseCatalogPacksFile: missing packs returns an empty array', () => {
    assert.deepEqual(parseCatalogPacksFile(JSON.stringify({ schema: 'akari-catalog-packs/v0' })), []);
});

test('parseCatalogPacksFile: non-array packs returns an empty array', () => {
    assert.deepEqual(parseCatalogPacksFile(JSON.stringify({ packs: 'not-an-array' })), []);
});

test('parseCatalogPacksFile: reads packs without a schema field', () => {
    const raw = JSON.stringify({ packs: [{ id: 'x', category: 'font', title: 'y' }] });
    assert.equal(parseCatalogPacksFile(raw).length, 1);
});

test('parseCatalogPacksFile: skips missing required fields and retains valid items', () => {
    const raw = JSON.stringify({
        packs: [
            { id: 'ok-pack', category: 'font', title: 'Valid pack' },
            { category: 'font', title: 'Missing ID' },
            { id: 'no-title', category: 'font' },
            null,
            'not-an-object'
        ]
    });
    const packs = parseCatalogPacksFile(raw);
    assert.equal(packs.length, 1);
    assert.equal(packs[0].id, 'ok-pack');
});

test('parseCatalogPacksFile: skips empty required fields', () => {
    const raw = JSON.stringify({ packs: [{ id: '', category: 'font', title: 'x' }] });
    assert.deepEqual(parseCatalogPacksFile(raw), []);
});
