import test from 'node:test';
import assert from 'node:assert/strict';
import { composeCatalogImportPrompt, composeCatalogAskAgentPrompt, composeCatalogPackImportPrompt } from '../lib/common/catalog-context-packet.js';

// カード動詞2本（取り込む/頼む）が組み立てるパケットの単体テスト。
// agent-context-packet.ts の汎用 composer を再利用しているだけであることを
// カタログ固有の語彙（id/category/title/source.url/license.spdx/when_to_use）
// の有無パターンで確認する。

const FULL_ITEM = {
    id: 'vintage-camera',
    category: '3d',
    title: 'Vintage camera 3D model',
    when_to_use: 'Retro product presentations and hero shots of photo or video equipment',
    license: { spdx: 'CC0-1.0' },
    source: { url: 'https://polyhaven.com/a/Camera_01', preview_url: 'https://cdn.polyhaven.com/x.png' }
};

const MINIMAL_ITEM = { id: 'noto-sans-jp', category: 'font', title: 'Noto Sans JP' };

test('composeCatalogImportPrompt: includes ID, category, title, URL, license and request', () => {
    const packet = composeCatalogImportPrompt(FULL_ITEM);
    assert.equal(
        packet,
        '【Catalog footage】vintage-camera（category 3d · title Vintage camera 3D model · source: https://polyhaven.com/a/Camera_01 · license: CC0-1.0）: Retrieve this footage from its catalog references, verify the license, and place it in the project (follow the setup-library skill)'
    );
});

test('composeCatalogImportPrompt: missing URL and license omit their fields', () => {
    const packet = composeCatalogImportPrompt(MINIMAL_ITEM);
    assert.equal(
        packet,
        '【Catalog footage】noto-sans-jp（category font · title Noto Sans JP）: Retrieve this footage from its catalog references, verify the license, and place it in the project (follow the setup-library skill)'
    );
    assert.equal(packet.includes('source:'), false);
    assert.equal(packet.includes('license:'), false);
});

test('composeCatalogAskAgentPrompt: includes fields, first use sentence and user request', () => {
    const packet = composeCatalogAskAgentPrompt(FULL_ITEM, 'What would you like to do with this footage?');
    assert.equal(
        packet,
        '【Catalog footage】vintage-camera（category 3d · title Vintage camera 3D model · source: https://polyhaven.com/a/Camera_01 · license: CC0-1.0 · Use: Retro product presentations and hero shots of photo or video equipment）: What would you like to do with this footage?'
    );
});

test('composeCatalogAskAgentPrompt: keeps only the first sentence of when_to_use', () => {
    const item = {
        id: 'noto-sans-jp',
        category: 'font',
        title: 'Noto Sans JP',
        when_to_use: 'Readable captions and UI text without a specific visual style. A standard typeface for corporate and explainer videos'
    };
    const packet = composeCatalogAskAgentPrompt(item, 'Consider this');
    assert.equal(
        packet,
        '【Catalog footage】noto-sans-jp（category font · title Noto Sans JP · Use: Readable captions and UI text without a specific visual style.）: Consider this'
    );
    assert.equal(packet.includes('corporate'), false, 'the second sentence must be omitted');
});

test('composeCatalogAskAgentPrompt: missing when_to_use omits the use field', () => {
    const packet = composeCatalogAskAgentPrompt(MINIMAL_ITEM, 'Change the color');
    assert.equal(packet, '【Catalog footage】noto-sans-jp（category font · title Noto Sans JP）: Change the color');
    assert.equal(packet.includes('Use:'), false);
});

// composeCatalogPackImportPrompt — パック棚ヘッダ「まとめて取り込む」の定型パケット。

test('composeCatalogPackImportPrompt: includes pack name, count, and item list', () => {
    const packet = composeCatalogPackImportPrompt('25 essential fonts for Captions', [
        { id: '851-chikara-dzuyoku', category: 'font', title: '851 Chikara Dzuyoku' },
        { id: 'zero-gothic', category: 'font', title: 'Zero Gothic' }
    ]);
    assert.equal(
        packet,
        '【Catalog footage pack】25 essential fonts for Captions — 2 items: 851-chikara-dzuyoku（font · 851 Chikara Dzuyoku）、zero-gothic（font · Zero Gothic）: Retrieve all unacquired free footage in this pack, verify the licenses, and place it in the project (follow the setup-library skill)'
    );
});

test('composeCatalogPackImportPrompt: collapses embedded newlines to one line', () => {
    const packet = composeCatalogPackImportPrompt('Pack name\nwith\nnewlines', [
        { id: 'x', category: 'font', title: 'Title\nwith newlines' }
    ]);
    assert.equal(packet.includes('\n'), false);
});

test('composeCatalogPackImportPrompt: no target items does not throw', () => {
    const packet = composeCatalogPackImportPrompt('Empty pack', []);
    assert.equal(packet.includes('0 items'), true);
});
